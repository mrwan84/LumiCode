import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogEntry {
  time: string;
  message: string;
  event?: string;
}

interface ColorConfig {
  r: number;
  g: number;
  b: number;
}

interface WebhookConfig {
  name: string;
  url: string;
  enabled: boolean;
  format: string;
}

interface AppConfig {
  port: number;
  start_minimized: boolean;
  sound_enabled: boolean;
  log_to_disk: boolean;
  custom_colors: Record<string, ColorConfig>;
  webhooks: WebhookConfig[];
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

type ThemePref = "system" | "dark" | "light";

function getResolvedTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

// Sound notification via Web Audio API — success melody (3-note ascending)
function playSuccessMelody() {
  try {
    const ctx = new AudioContext();
    const notes = [523, 659, 784]; // C5, E5, G5
    const noteDuration = 0.12;
    const gap = 0.04;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "triangle";
      const startTime = ctx.currentTime + i * (noteDuration + gap);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });

    const totalDuration = notes.length * (noteDuration + gap) * 1000 + 200;
    setTimeout(() => ctx.close(), totalDuration);
  } catch (_) {
    /* Audio not available */
  }
}

const DEFAULT_COLORS: Record<string, ColorConfig> = {
  working: { r: 0, g: 255, b: 238 },
  done: { r: 0, g: 180, b: 0 },
  error: { r: 255, g: 0, b: 0 },
  idle: { r: 30, g: 80, b: 220 },
  thinking: { r: 255, g: 0, b: 180 },
};

let toastId = 0;

function App() {
  const [page, setPage] = useState<"main" | "settings" | "about">("main");
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [connectedPorts, setConnectedPorts] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [currentLedState, setCurrentLedState] = useState<string>("idle");
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [serverFallback, setServerFallback] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const selectedPortRef = useRef(selectedPort);

  // Config
  const [config, setConfig] = useState<AppConfig>({
    port: 9999,
    start_minimized: false,
    sound_enabled: false,
    log_to_disk: true,
    custom_colors: {},
    webhooks: [],
  });
  const [hooksInstalled, setHooksInstalled] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("server");

  const toggleSection = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  // Theme
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    return (localStorage.getItem("lumicode-theme") as ThemePref) || "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    getResolvedTheme(
      (localStorage.getItem("lumicode-theme") as ThemePref) || "system",
    ),
  );

  useEffect(() => {
    localStorage.setItem("lumicode-theme", themePref);
    setResolvedTheme(getResolvedTheme(themePref));

    if (themePref === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setResolvedTheme(mq.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [themePref]);

  const cycleTheme = () => {
    setThemePref((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  const themeIcon =
    themePref === "system" ? "◐" : themePref === "dark" ? "🌙" : "☀️";
  const themeTooltip =
    themePref === "system"
      ? "Theme: System"
      : themePref === "dark"
        ? "Theme: Dark"
        : "Theme: Light";

  // Toast helpers
  const showToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const addLog = useCallback((message: string, event?: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev.slice(-100), { time, message, event }]);
  }, []);

  useEffect(() => {
    selectedPortRef.current = selectedPort;
  }, [selectedPort]);

  const refreshPorts = useCallback(async () => {
    try {
      const result = await invoke<string[]>("list_serial_ports");
      setPorts(result);
      if (result.length > 0 && !selectedPortRef.current) {
        setSelectedPort(result[0]);
      }
    } catch (e) {
      addLog(`Failed to list ports: ${e}`);
    }
  }, [addLog]);

  const checkStatus = useCallback(async () => {
    try {
      const status = await invoke<[boolean, string][]>("get_serial_status");
      const connected = status
        .filter(([isConn]) => isConn)
        .map(([, name]) => name);
      setConnectedPorts(connected);
      if (connected.length > 0 && !selectedPortRef.current) {
        setSelectedPort(connected[0]);
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    invoke<AppConfig>("get_config").then((cfg) => {
      setConfig(cfg);
    }).catch(() => {});
    invoke<boolean>("check_hooks_installed").then(setHooksInstalled).catch(() => {});
  }, []);

  // Load persisted log history
  useEffect(() => {
    invoke<LogEntry[]>("load_log_history").then((history) => {
      if (history.length > 0) {
        setLogs(history);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPorts();
    checkStatus();

    const statusInterval = setInterval(checkStatus, 3000);

    const unlistenHook = listen<{ event: string; message: string }>(
      "hook-event",
      (e) => {
        addLog(e.payload.message, e.payload.event);
        setCurrentLedState(e.payload.event);
        // Play sound only on done event
        if (config.sound_enabled && e.payload.event === "done") {
          playSuccessMelody();
        }
      },
    );

    const unlistenNav = listen<string>("navigate", (e) => {
      if (e.payload === "about") setPage("about");
      if (e.payload === "settings") setPage("settings");
    });

    const unlistenSerial = listen<{
      connected: boolean;
      port: string;
      message: string;
    }>("serial-status", (e) => {
      addLog(e.payload.message, e.payload.connected ? "done" : "error");
      showToast(
        e.payload.message,
        e.payload.connected ? "success" : "error",
      );
      checkStatus();
      refreshPorts();
    });

    const unlistenServer = listen<{
      port?: number;
      configured_port: number;
      fallback?: boolean;
      error?: string;
    }>("server-status", (e) => {
      setServerPort(e.payload.port ?? null);
      setServerFallback(e.payload.fallback ?? false);
      if (e.payload.error) {
        addLog(`Server: ${e.payload.error}`, "error");
      }
    });

    // Check server status
    invoke<number | null>("get_server_status").then((p) => {
      setServerPort(p);
    }).catch(() => {});

    return () => {
      clearInterval(statusInterval);
      unlistenHook.then((fn) => fn());
      unlistenNav.then((fn) => fn());
      unlistenSerial.then((fn) => fn());
      unlistenServer.then((fn) => fn());
    };
  }, [refreshPorts, addLog, checkStatus, showToast, config.sound_enabled]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const connectPort = async () => {
    if (!selectedPort) return;
    try {
      await invoke("set_serial_port", { port: selectedPort });
      addLog(`Connected to ${selectedPort}`);
      await checkStatus();
    } catch (e) {
      addLog(`Connection failed: ${e}`);
    }
  };

  const disconnectPort = async (portName?: string) => {
    try {
      await invoke("disconnect_serial_port", { port: portName ?? null });
      addLog(portName ? `Disconnected ${portName}` : "Disconnected all");
      await checkStatus();
    } catch (e) {
      addLog(`Disconnect failed: ${e}`);
    }
  };

  const sendCommand = async (command: string) => {
    try {
      await invoke("send_led_command", { command });
      addLog(`Sent: ${command}`, command);
      setCurrentLedState(command);
    } catch (e) {
      addLog(`Send failed: ${e}`);
    }
  };

  // Config helpers
  const updateConfig = async (partial: Partial<AppConfig>) => {
    const newConfig = { ...config, ...partial };
    setConfig(newConfig);
    try {
      await invoke("save_config", { config: newConfig });
    } catch (e) {
      addLog(`Config save failed: ${e}`);
    }
  };

  const handleInstallHooks = async () => {
    try {
      const result = await invoke<string>("install_hooks");
      addLog(result);
      setHooksInstalled(true);
      showToast("Hooks installed!", "success");
    } catch (e) {
      addLog(`Hook install failed: ${e}`);
      showToast("Hook install failed", "error");
    }
  };

  const addWebhook = () => {
    const newWebhook: WebhookConfig = {
      name: `Webhook ${config.webhooks.length + 1}`,
      url: "",
      enabled: true,
      format: "generic",
    };
    updateConfig({ webhooks: [...config.webhooks, newWebhook] });
  };

  const updateWebhook = (index: number, partial: Partial<WebhookConfig>) => {
    const updated = config.webhooks.map((w, i) =>
      i === index ? { ...w, ...partial } : w,
    );
    updateConfig({ webhooks: updated });
  };

  const removeWebhook = (index: number) => {
    updateConfig({ webhooks: config.webhooks.filter((_, i) => i !== index) });
  };

  const getColorForEvent = (event: string): ColorConfig => {
    return config.custom_colors[event] || DEFAULT_COLORS[event] || { r: 128, g: 128, b: 128 };
  };

  const updateEventColor = (event: string, color: ColorConfig) => {
    updateConfig({
      custom_colors: { ...config.custom_colors, [event]: color },
    });
  };

  const resetEventColor = (event: string) => {
    const newColors = { ...config.custom_colors };
    delete newColors[event];
    updateConfig({ custom_colors: newColors });
  };

  const isConnected = connectedPorts.length > 0;
  const availablePorts = ports.filter((p) => !connectedPorts.includes(p));

  // Keep selectedPort in sync with available ports
  useEffect(() => {
    if (availablePorts.length > 0 && !availablePorts.includes(selectedPort)) {
      setSelectedPort(availablePorts[0]);
    } else if (availablePorts.length === 0 && selectedPort) {
      setSelectedPort("");
    }
  }, [availablePorts.join(","), selectedPort]);

  const ledButtons = [
    { command: "working", label: "Working" },
    { command: "done", label: "Done" },
    { command: "error", label: "Error" },
    { command: "idle", label: "Idle" },
    { command: "thinking", label: "Thinking" },
  ];

  return (
    <div className="app" data-theme={resolvedTheme} onContextMenu={(e) => e.preventDefault()}>
      <div className="header">
        <h1>LumiCode</h1>
        <span className="version">v1.3.0</span>
        <div className="header-spacer" />
        <button
          className="theme-toggle"
          onClick={cycleTheme}
          title={themeTooltip}
        >
          {themeIcon}
        </button>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${page === "main" ? "active" : ""}`}
          onClick={() => setPage("main")}
        >
          Home
        </button>
        <button
          className={`tab ${page === "settings" ? "active" : ""}`}
          onClick={() => setPage("settings")}
        >
          Settings
        </button>
        <button
          className={`tab ${page === "about" ? "active" : ""}`}
          onClick={() => setPage("about")}
        >
          About
        </button>
      </div>

      {page === "about" ? (
        <div className="about-page">
          <div className="about-icon">
            <div className="about-ring">
              <div className="about-dot" />
            </div>
          </div>
          <h2 className="about-title">LumiCode</h2>
          <p className="about-desc">Claude Code RGB Notifier</p>
          <div className="about-divider" />
          <div className="about-info">
            <div className="about-row">
              <span className="about-label">Author</span>
              <span className="about-value">M.Alsouki</span>
            </div>
            <div className="about-row">
              <span className="about-label">Version</span>
              <span className="about-value">1.3.0</span>
            </div>
            <div className="about-row">
              <span className="about-label">License</span>
              <span className="about-value">MIT</span>
            </div>
          </div>
        </div>
      ) : page === "settings" ? (
        <div className="settings-page">
          {/* Server & General */}
          <div className="accordion">
            <button
              className={`accordion-header ${openSection === "server" ? "open" : ""}`}
              onClick={() => toggleSection("server")}
            >
              <span className="accordion-arrow" />
              <span>General</span>
              <span className="accordion-badge">
                {serverPort ? `:${serverPort}` : "offline"}
              </span>
            </button>
            {openSection === "server" && (
              <div className="accordion-body">
                <div className="settings-row">
                  <span className="settings-label">HTTP Port</span>
                  <input
                    type="number"
                    className="settings-input"
                    value={config.port}
                    min={1024}
                    max={65535}
                    onChange={(e) =>
                      updateConfig({ port: parseInt(e.target.value) || 9999 })
                    }
                  />
                </div>
                <div className="settings-row">
                  <span className="settings-label">Start minimized</span>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={config.start_minimized}
                      onChange={(e) =>
                        updateConfig({ start_minimized: e.target.checked })
                      }
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Sound notifications</span>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={config.sound_enabled}
                      onChange={(e) =>
                        updateConfig({ sound_enabled: e.target.checked })
                      }
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Persist event log</span>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={config.log_to_disk}
                      onChange={(e) =>
                        updateConfig({ log_to_disk: e.target.checked })
                      }
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {config.port !== serverPort && serverPort && (
                  <div className="settings-hint">Restart to apply new port</div>
                )}
              </div>
            )}
          </div>

          {/* LED Colors */}
          <div className="accordion">
            <button
              className={`accordion-header ${openSection === "colors" ? "open" : ""}`}
              onClick={() => toggleSection("colors")}
            >
              <span className="accordion-arrow" />
              <span>LED Colors</span>
              <div className="accordion-colors">
                {ledButtons.map((btn) => {
                  const c = getColorForEvent(btn.command);
                  return (
                    <span
                      key={btn.command}
                      className="accordion-color-dot"
                      style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                    />
                  );
                })}
              </div>
            </button>
            {openSection === "colors" && (
              <div className="accordion-body">
                {ledButtons.map((btn) => {
                  const color = getColorForEvent(btn.command);
                  const isCustom = !!config.custom_colors[btn.command];
                  const hex = `#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
                  return (
                    <div key={btn.command} className="color-row">
                      <span className="settings-label">{btn.label}</span>
                      <span className="color-rgb-text">
                        {color.r}, {color.g}, {color.b}
                      </span>
                      <input
                        type="color"
                        className="color-input"
                        value={hex}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateEventColor(btn.command, {
                            r: parseInt(v.slice(1, 3), 16),
                            g: parseInt(v.slice(3, 5), 16),
                            b: parseInt(v.slice(5, 7), 16),
                          });
                        }}
                      />
                      {isCustom && (
                        <button
                          className="btn-icon"
                          onClick={() => resetEventColor(btn.command)}
                          title="Reset to default"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Webhooks */}
          <div className="accordion">
            <button
              className={`accordion-header ${openSection === "webhooks" ? "open" : ""}`}
              onClick={() => toggleSection("webhooks")}
            >
              <span className="accordion-arrow" />
              <span>Webhooks</span>
              {config.webhooks.length > 0 && (
                <span className="accordion-badge">
                  {config.webhooks.filter((w) => w.enabled).length} active
                </span>
              )}
            </button>
            {openSection === "webhooks" && (
              <div className="accordion-body">
                {config.webhooks.map((wh, i) => (
                  <div key={i} className="webhook-row">
                    <div className="webhook-top">
                      <input
                        className="settings-input webhook-name"
                        placeholder="Name"
                        value={wh.name}
                        onChange={(e) =>
                          updateWebhook(i, { name: e.target.value })
                        }
                      />
                      <input
                        className="settings-input webhook-url"
                        placeholder="https://..."
                        value={wh.url}
                        onChange={(e) =>
                          updateWebhook(i, { url: e.target.value })
                        }
                      />
                    </div>
                    <div className="webhook-bottom">
                      <select
                        className="settings-select"
                        value={wh.format}
                        onChange={(e) =>
                          updateWebhook(i, { format: e.target.value })
                        }
                      >
                        <option value="generic">Generic</option>
                        <option value="discord">Discord</option>
                        <option value="slack">Slack</option>
                        <option value="homeassistant">Home Assistant</option>
                      </select>
                      <label className="toggle toggle-sm">
                        <input
                          type="checkbox"
                          checked={wh.enabled}
                          onChange={(e) =>
                            updateWebhook(i, { enabled: e.target.checked })
                          }
                        />
                        <span className="toggle-slider" />
                      </label>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => removeWebhook(i)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <button className="btn btn-sm" onClick={addWebhook}>
                  + Add Webhook
                </button>
              </div>
            )}
          </div>

          {/* Claude Code Hooks */}
          <div className="accordion">
            <button
              className={`accordion-header ${openSection === "hooks" ? "open" : ""}`}
              onClick={() => toggleSection("hooks")}
            >
              <span className="accordion-arrow" />
              <span>Claude Code Hooks</span>
              <span className={`accordion-badge ${hooksInstalled ? "badge-ok" : "badge-warn"}`}>
                {hooksInstalled ? "installed" : "not set"}
              </span>
            </button>
            {openSection === "hooks" && (
              <div className="accordion-body">
                <div className="settings-row">
                  <span className="settings-label">
                    {hooksInstalled
                      ? `Installed on :${config.port}`
                      : "Not installed"}
                  </span>
                  <button
                    className="btn btn-sm primary"
                    onClick={handleInstallHooks}
                  >
                    {hooksInstalled ? "Reinstall" : "Install"}
                  </button>
                </div>
                <div className="settings-hint">
                  Writes hooks to ~/.claude/settings.json
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="status-bar">
            {(() => {
              const c = getColorForEvent(currentLedState);
              const rgb = `rgb(${c.r}, ${c.g}, ${c.b})`;
              const glow = `0 0 12px rgba(${c.r}, ${c.g}, ${c.b}, 0.6)`;
              const animClass =
                currentLedState === "error" ? "led-anim-blink-fast" :
                currentLedState === "working" ? "led-anim-blink-slow" :
                currentLedState === "thinking" ? "led-anim-pulse" : "";
              return (
                <div
                  className={`led-preview ${animClass}`}
                  style={{ background: rgb, boxShadow: glow }}
                />
              );
            })()}
            <div className="status-info">
              <div className="status-row">
                <div
                  className={`status-dot ${isConnected ? "connected" : "disconnected"}`}
                />
                <span className="status-text">
                  <span className="label">Arduino: </span>
                  {isConnected
                    ? connectedPorts.join(", ")
                    : "Scanning..."}
                </span>
              </div>
              <div className="status-row">
                <div
                  className={`status-dot ${serverPort ? "connected" : "disconnected"}`}
                />
                <span className="status-text">
                  <span className="label">Server: </span>
                  {serverPort
                    ? `:${serverPort}${serverFallback ? " (fallback)" : ""}`
                    : "Not running"}
                </span>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Serial Ports</div>
            {/* Connected boards */}
            {connectedPorts.map((port) => (
              <div key={port} className="port-connected">
                <div className="status-dot connected" />
                <span className="port-name">{port}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => disconnectPort(port)}
                >
                  Disconnect
                </button>
              </div>
            ))}
            {/* Add new connection */}
            <div className="port-select">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
              >
                {availablePorts.length === 0 && (
                  <option value="">No ports available</option>
                )}
                {availablePorts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={refreshPorts}>
                Refresh
              </button>
              <button
                className="btn primary"
                onClick={connectPort}
                disabled={
                  !selectedPort || connectedPorts.includes(selectedPort)
                }
              >
                Connect
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Test LED</div>
            <div className="led-grid">
              {ledButtons.map((btn) => {
                const c = getColorForEvent(btn.command);
                return (
                  <button
                    key={btn.command}
                    className="led-btn"
                    onClick={() => sendCommand(btn.command)}
                  >
                    <div
                      className="dot"
                      style={{
                        background: `rgb(${c.r}, ${c.g}, ${c.b})`,
                        boxShadow: `0 0 10px rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`,
                      }}
                    />
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="log-section">
            <div className="log-header">
              <div className="section-title">Event Log</div>
              {logs.length > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={() => setLogs([])}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="log" ref={logRef}>
              {logs.map((entry, i) => {
                const logColor = entry.event
                  ? getColorForEvent(entry.event)
                  : null;
                return (
                <div
                  key={i}
                  className="log-entry"
                  style={
                    logColor
                      ? { color: `rgb(${logColor.r}, ${logColor.g}, ${logColor.b})` }
                      : undefined
                  }
                >
                  <span className="time">{entry.time}</span>
                  {entry.message}
                </div>
                );
              })}
              {logs.length === 0 && (
                <div className="log-entry">Waiting for events...</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
