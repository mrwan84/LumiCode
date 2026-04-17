import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";

import type {
  LogEntry,
  AppConfig,
  HookStatus,
  HookDiff,
  WebhookConfig,
  ColorConfig,
  Toast,
  ThemePref,
} from "./types";
import { DEFAULT_COLORS, ALL_EVENTS } from "./constants";
import { playSoundForEvent } from "./sounds";

import Header from "./components/Header";
import TabBar from "./components/TabBar";
import AboutPage from "./components/AboutPage";
import SettingsPage from "./components/SettingsPage";
import StatusBar from "./components/StatusBar";
import SessionStats from "./components/SessionStats";
import SerialPorts from "./components/SerialPorts";
import TestLed from "./components/TestLed";
import EventLog from "./components/EventLog";
import ToastContainer from "./components/Toast";
import HookDiffModal from "./components/HookDiffModal";
import OnboardingWizard from "./components/OnboardingWizard";

function getResolvedTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

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
  const [logFilter, setLogFilter] = useState<string>("all");
  const selectedPortRef = useRef(selectedPort);
  const idleTimerRef = useRef<number | null>(null);

  // Config
  const [config, setConfig] = useState<AppConfig>({
    port: 9999,
    start_minimized: false,
    sound_enabled: false,
    log_to_disk: true,
    custom_colors: {},
    webhooks: [],
    idle_timeout_minutes: 5,
    board_names: {},
    sound_events: ["done"],
    hotkey: null,
    coalesce_ms: 100,
    update_check_repo: "",
  });
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [hookStatus, setHookStatus] = useState<HookStatus>({
    installed: false,
    hook_port: null,
    port_match: false,
  });
  const [lastHookAt, setLastHookAt] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("server");
  const [pendingHookDiff, setPendingHookDiff] = useState<HookDiff | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return localStorage.getItem("lumicode-onboarded") !== "true";
  });

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

  // Helpers
  const showToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const addLog = useCallback((message: string, event?: string, skipPersist = false) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });
    const entry = { time, message, event, timestamp: now.toISOString() };
    setLogs((prev) => [...prev.slice(-100), entry]);
    if (!skipPersist && configRef.current.log_to_disk) {
      invoke("append_log", { entry }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    selectedPortRef.current = selectedPort;
  }, [selectedPort]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const minutes = configRef.current.idle_timeout_minutes;
    if (minutes > 0) {
      idleTimerRef.current = window.setTimeout(() => {
        invoke("send_led_command", { command: "idle" }).catch(() => {});
        setCurrentLedState("idle");
      }, minutes * 60 * 1000);
    }
  }, []);

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
    } catch (_) {}
  }, []);

  // Load config & hooks on mount
  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setConfig(cfg))
      .catch(() => {});
    invoke<HookStatus>("check_hooks_status")
      .then(setHookStatus)
      .catch(() => {});
  }, []);

  // Load persisted log history
  useEffect(() => {
    invoke<LogEntry[]>("load_log_history")
      .then((history) => {
        if (history.length > 0) setLogs(history);
      })
      .catch(() => {});
  }, []);

  // Main event listeners
  useEffect(() => {
    refreshPorts();
    checkStatus();
    const statusInterval = setInterval(checkStatus, 3000);

    const unlistenHook = listen<{ event: string; message: string }>(
      "hook-event",
      (e) => {
        addLog(e.payload.message, e.payload.event, true);
        setCurrentLedState(e.payload.event);
        setLastHookAt(Date.now());
        resetIdleTimer();
        const cfg = configRef.current;
        if (cfg.sound_enabled && cfg.sound_events.includes(e.payload.event)) {
          playSoundForEvent(e.payload.event);
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
      showToast(e.payload.message, e.payload.connected ? "success" : "error");
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
      if (e.payload.error) addLog(`Server: ${e.payload.error}`, "error");
    });

    invoke<number | null>("get_server_status")
      .then((p) => setServerPort(p))
      .catch(() => {});

    return () => {
      clearInterval(statusInterval);
      unlistenHook.then((fn) => fn());
      unlistenNav.then((fn) => fn());
      unlistenSerial.then((fn) => fn());
      unlistenServer.then((fn) => fn());
    };
  }, [refreshPorts, addLog, checkStatus, showToast, resetIdleTimer]);

  // Commands
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
      resetIdleTimer();
    } catch (e) {
      addLog(`Send failed: ${e}`);
    }
  };

  // Config helpers
  const saveTimerRef = useRef<number | null>(null);

  const updateConfig = useCallback((partial: Partial<AppConfig>) => {
    setConfig((prev) => {
      const newConfig = { ...prev, ...partial };
      configRef.current = newConfig;
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        invoke("save_config", { config: configRef.current }).catch((e) => {
          addLog(`Config save failed: ${e}`);
        });
      }, 400);
      return newConfig;
    });
  }, [addLog]);

  const handleInstallHooks = async () => {
    try {
      const diff = await invoke<HookDiff>("preview_install_hooks");
      setPendingHookDiff(diff);
    } catch (e) {
      addLog(`Hook preview failed: ${e}`);
      showToast("Hook preview failed", "error");
    }
  };

  const handleUninstallHooks = async () => {
    try {
      const diff = await invoke<HookDiff>("preview_uninstall_hooks");
      if (diff.removed.length === 0) {
        showToast("No LumiCode hooks to remove", "success");
        return;
      }
      setPendingHookDiff(diff);
    } catch (e) {
      addLog(`Hook preview failed: ${e}`);
      showToast("Hook preview failed", "error");
    }
  };

  const confirmHookChange = async () => {
    if (!pendingHookDiff) return;
    const action = pendingHookDiff.action;
    setPendingHookDiff(null);
    try {
      if (action === "install") {
        const result = await invoke<string>("install_hooks");
        addLog(result);
        setHookStatus({
          installed: true,
          hook_port: config.port,
          port_match: true,
        });
        showToast("Hooks installed!", "success");
      } else {
        const result = await invoke<string>("uninstall_hooks");
        addLog(result);
        setHookStatus({
          installed: false,
          hook_port: null,
          port_match: false,
        });
        showToast("Hooks uninstalled", "success");
      }
    } catch (e) {
      addLog(`Hook ${action} failed: ${e}`);
      showToast(`Hook ${action} failed`, "error");
    }
  };

  const addWebhook = () => {
    const newWebhook: WebhookConfig = {
      name: `Webhook ${config.webhooks.length + 1}`,
      url: "",
      enabled: true,
      format: "generic",
      events: [...ALL_EVENTS],
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

  const testWebhook = async (wh: WebhookConfig) => {
    try {
      const result = await invoke<string>("test_webhook", {
        url: wh.url,
        format: wh.format,
      });
      showToast(`Test sent: ${result}`, "success");
    } catch (e) {
      showToast(`Test failed: ${e}`, "error");
    }
  };

  const getColorForEvent = (event: string): ColorConfig => {
    return config.custom_colors[event] || DEFAULT_COLORS[event] || { r: 128, g: 128, b: 128 };
  };

  const updateEventColor = (event: string, color: ColorConfig) => {
    updateConfig({ custom_colors: { ...config.custom_colors, [event]: color } });
  };

  const resetEventColor = (event: string) => {
    const newColors = { ...config.custom_colors };
    delete newColors[event];
    updateConfig({ custom_colors: newColors });
  };

  const getBoardName = (port: string): string => {
    return config.board_names[port] || port;
  };

  const updateBoardName = (port: string, name: string) => {
    updateConfig({ board_names: { ...config.board_names, [port]: name } });
  };

  const cleanStaleBoardNames = () => {
    const activePorts = new Set([...connectedPorts, ...ports]);
    const cleaned: Record<string, string> = {};
    for (const [port, name] of Object.entries(config.board_names)) {
      if (activePorts.has(port)) {
        cleaned[port] = name;
      }
    }
    const removed = Object.keys(config.board_names).length - Object.keys(cleaned).length;
    if (removed > 0) {
      updateConfig({ board_names: cleaned });
      showToast(`Removed ${removed} stale name${removed > 1 ? "s" : ""}`, "success");
    } else {
      showToast("No stale names found", "success");
    }
  };

  const toggleWebhookEvent = (index: number, event: string) => {
    const wh = config.webhooks[index];
    const events = wh.events.includes(event)
      ? wh.events.filter((e) => e !== event)
      : [...wh.events, event];
    updateWebhook(index, { events });
  };

  const toggleSoundEvent = (event: string) => {
    const events = config.sound_events.includes(event)
      ? config.sound_events.filter((e) => e !== event)
      : [...config.sound_events, event];
    updateConfig({ sound_events: events });
  };

  const exportConfig = async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      const filePath = await save({
        defaultPath: "lumicode-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(cfg, null, 2));
      showToast("Config exported", "success");
    } catch (e) {
      showToast(`Export failed: ${e}`, "error");
    }
  };

  const importConfig = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;
      const text = await readTextFile(filePath as string);
      const parsed = JSON.parse(text) as AppConfig;
      // Apply defaults for missing optional fields first
      parsed.port = parsed.port ?? 9999;
      parsed.idle_timeout_minutes = parsed.idle_timeout_minutes ?? 5;
      parsed.start_minimized = parsed.start_minimized ?? false;
      parsed.sound_enabled = parsed.sound_enabled ?? false;
      parsed.log_to_disk = parsed.log_to_disk ?? true;
      parsed.custom_colors = parsed.custom_colors ?? {};
      parsed.webhooks = parsed.webhooks ?? [];
      parsed.board_names = parsed.board_names ?? {};
      parsed.sound_events = parsed.sound_events ?? ["done"];
      parsed.hotkey = parsed.hotkey ?? null;
      parsed.coalesce_ms = parsed.coalesce_ms ?? 100;
      parsed.update_check_repo = parsed.update_check_repo ?? "";
      // Validate fields and ranges
      if (typeof parsed.port !== "number" || parsed.port < 1024 || parsed.port > 65535)
        throw new Error("Invalid config: port must be 1024-65535");
      if (typeof parsed.idle_timeout_minutes !== "number" || parsed.idle_timeout_minutes < 0 || parsed.idle_timeout_minutes > 60)
        throw new Error("Invalid config: idle_timeout_minutes must be 0-60");
      if (typeof parsed.coalesce_ms !== "number" || parsed.coalesce_ms < 0 || parsed.coalesce_ms > 5000)
        throw new Error("Invalid config: coalesce_ms must be 0-5000");
      if (typeof parsed.custom_colors === "object") {
        for (const [key, c] of Object.entries(parsed.custom_colors)) {
          if (typeof c.r !== "number" || typeof c.g !== "number" || typeof c.b !== "number" ||
              c.r < 0 || c.r > 255 || c.g < 0 || c.g > 255 || c.b < 0 || c.b > 255)
            throw new Error(`Invalid config: color "${key}" has out-of-range RGB values`);
        }
      }
      if (!Array.isArray(parsed.webhooks))
        throw new Error("Invalid config: webhooks must be an array");
      if (!Array.isArray(parsed.sound_events))
        throw new Error("Invalid config: sound_events must be an array");
      // Cancel any pending debounced save before importing
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await invoke("save_config", { config: parsed });
      setConfig(parsed);
      configRef.current = parsed;
      showToast("Config imported!", "success");
    } catch (e) {
      showToast(`Import failed: ${e}`, "error");
    }
  };

  // Derived
  const isConnected = connectedPorts.length > 0;
  const availablePorts = ports.filter((p) => !connectedPorts.includes(p));

  useEffect(() => {
    if (availablePorts.length > 0 && !availablePorts.includes(selectedPort)) {
      setSelectedPort(availablePorts[0]);
    } else if (availablePorts.length === 0 && selectedPort) {
      setSelectedPort("");
    }
  }, [availablePorts.join(","), selectedPort]);

  return (
    <div className="app" data-theme={resolvedTheme} onContextMenu={(e) => e.preventDefault()}>
      <Header themePref={themePref} cycleTheme={cycleTheme} />
      <TabBar page={page} setPage={setPage} />

      {page === "about" ? (
        <AboutPage onReplayOnboarding={() => setShowOnboarding(true)} />
      ) : page === "settings" ? (
        <SettingsPage
          config={config}
          updateConfig={updateConfig}
          openSection={openSection}
          toggleSection={toggleSection}
          serverPort={serverPort}
          hookStatus={hookStatus}
          lastHookAt={lastHookAt}
          handleInstallHooks={handleInstallHooks}
          handleUninstallHooks={handleUninstallHooks}
          getColorForEvent={getColorForEvent}
          updateEventColor={updateEventColor}
          resetEventColor={resetEventColor}
          addWebhook={addWebhook}
          updateWebhook={updateWebhook}
          removeWebhook={removeWebhook}
          testWebhook={testWebhook}
          toggleWebhookEvent={toggleWebhookEvent}
          toggleSoundEvent={toggleSoundEvent}
          themePref={themePref}
          setThemePref={setThemePref}
          exportConfig={exportConfig}
          importConfig={importConfig}
        />
      ) : (
        <>
          <div className="home-top-bar">
            <StatusBar
              currentLedState={currentLedState}
              getColorForEvent={getColorForEvent}
              isConnected={isConnected}
              connectedPorts={connectedPorts}
              serverPort={serverPort}
              serverFallback={serverFallback}
              getBoardName={getBoardName}
            />
            <SessionStats logs={logs} />
          </div>
          <SerialPorts
            connectedPorts={connectedPorts}
            availablePorts={availablePorts}
            selectedPort={selectedPort}
            setSelectedPort={setSelectedPort}
            connectPort={connectPort}
            disconnectPort={disconnectPort}
            refreshPorts={refreshPorts}
            config={config}
            updateBoardName={updateBoardName}
            updateConfig={updateConfig}
            cleanStaleBoardNames={cleanStaleBoardNames}
          />
          <TestLed getColorForEvent={getColorForEvent} sendCommand={sendCommand} />
          <EventLog
            logs={logs}
            setLogs={setLogs}
            getColorForEvent={getColorForEvent}
            logFilter={logFilter}
            setLogFilter={setLogFilter}
          />
        </>
      )}

      <ToastContainer toasts={toasts} />
      {pendingHookDiff && (
        <HookDiffModal
          diff={pendingHookDiff}
          onConfirm={confirmHookChange}
          onCancel={() => setPendingHookDiff(null)}
        />
      )}
      {showOnboarding && (
        <OnboardingWizard
          serverPort={serverPort}
          hooksInstalled={hookStatus.installed && hookStatus.port_match}
          connectedPorts={connectedPorts}
          availablePorts={availablePorts}
          onInstallHooks={handleInstallHooks}
          onConnectPort={(p) => {
            setSelectedPort(p);
            invoke("set_serial_port", { port: p }).catch((e) =>
              addLog(`Connection failed: ${e}`),
            );
          }}
          onTestLed={() => sendCommand("done")}
          onFinish={() => {
            localStorage.setItem("lumicode-onboarded", "true");
            setShowOnboarding(false);
          }}
          onSkip={() => {
            localStorage.setItem("lumicode-onboarded", "true");
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
