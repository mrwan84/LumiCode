import { useEffect, useState } from "react";
import type {
  AppConfig,
  ColorConfig,
  WebhookConfig,
  HookStatus,
  ThemePref,
} from "../types";
import { ALL_EVENTS, EVENT_LABELS, LED_BUTTONS } from "../constants";

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

interface Props {
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  openSection: string | null;
  toggleSection: (id: string) => void;
  serverPort: number | null;
  hookStatus: HookStatus;
  lastHookAt: number | null;
  handleInstallHooks: () => void;
  handleUninstallHooks: () => void;
  getColorForEvent: (event: string) => ColorConfig;
  updateEventColor: (event: string, color: ColorConfig) => void;
  resetEventColor: (event: string) => void;
  addWebhook: () => void;
  updateWebhook: (index: number, partial: Partial<WebhookConfig>) => void;
  removeWebhook: (index: number) => void;
  testWebhook: (wh: WebhookConfig) => void;
  toggleWebhookEvent: (index: number, event: string) => void;
  toggleSoundEvent: (event: string) => void;
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
  exportConfig: () => void;
  importConfig: () => void;
}

export default function SettingsPage({
  config,
  updateConfig,
  openSection,
  toggleSection,
  serverPort,
  hookStatus,
  lastHookAt,
  handleInstallHooks,
  handleUninstallHooks,
  getColorForEvent,
  updateEventColor,
  resetEventColor,
  addWebhook,
  updateWebhook,
  removeWebhook,
  testWebhook,
  toggleWebhookEvent,
  toggleSoundEvent,
  themePref,
  setThemePref,
  exportConfig,
  importConfig,
}: Props) {
  // Tick once a second so the "Ns ago" label stays fresh
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="settings-page">
      {/* General */}
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
            {/* Row 1: Port + Theme */}
            <div className="settings-row-dual">
              <div className="settings-cell">
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
              <div className="settings-cell">
                <span className="settings-label">Theme</span>
                <select
                  className="settings-select"
                  value={themePref}
                  onChange={(e) => setThemePref(e.target.value as ThemePref)}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
            {/* Row 2: Start minimized + Persist log */}
            <div className="settings-row-dual">
              <div className="settings-cell">
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
              <div className="settings-cell">
                <span className="settings-label">Persist log</span>
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
            </div>
            {/* Row 3: Sound + events */}
            <div className="settings-row">
              <span className="settings-label">Sound</span>
              <div className="sound-inline">
                {config.sound_enabled && (
                  <div className="event-checks">
                    {ALL_EVENTS.map((ev) => (
                      <label key={ev} className="event-check" title={ev}>
                        <input
                          type="checkbox"
                          checked={config.sound_events.includes(ev)}
                          onChange={() => toggleSoundEvent(ev)}
                        />
                        <span>{EVENT_LABELS[ev]}</span>
                      </label>
                    ))}
                  </div>
                )}
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
            </div>
            {/* Row 4: Idle timeout + Hotkey */}
            <div className="settings-row-dual">
              <div className="settings-cell">
                <span className="settings-label">Idle (min)</span>
                <input
                  type="number"
                  className="settings-input"
                  value={config.idle_timeout_minutes}
                  min={0}
                  max={60}
                  onChange={(e) =>
                    updateConfig({
                      idle_timeout_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="settings-cell">
                <span className="settings-label">Hotkey</span>
                <span className="settings-value-text">Ctrl+Shift+L</span>
              </div>
            </div>
            {/* Row 5: Event coalescing + Update check repo */}
            <div className="settings-row-dual">
              <div className="settings-cell">
                <span
                  className="settings-label"
                  title="Drop duplicate consecutive events fired within this window (0 = disabled). Prevents LED thrashing during rapid tool calls."
                >
                  Coalesce (ms)
                </span>
                <input
                  type="number"
                  className="settings-input"
                  value={config.coalesce_ms}
                  min={0}
                  max={5000}
                  step={50}
                  onChange={(e) =>
                    updateConfig({
                      coalesce_ms: Math.max(
                        0,
                        Math.min(5000, parseInt(e.target.value) || 0),
                      ),
                    })
                  }
                />
              </div>
              <div className="settings-cell">
                <span
                  className="settings-label"
                  title="GitHub 'owner/repo' to query for new releases. Leave empty to disable the update check."
                >
                  Update repo
                </span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="owner/repo"
                  value={config.update_check_repo}
                  onChange={(e) =>
                    updateConfig({ update_check_repo: e.target.value })
                  }
                />
              </div>
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
            {LED_BUTTONS.map((btn) => {
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
            {LED_BUTTONS.map((btn) => {
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
                    className="btn btn-sm"
                    onClick={() => testWebhook(wh)}
                    disabled={!wh.url}
                    title="Send test event"
                  >
                    Test
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => removeWebhook(i)}
                  >
                    ×
                  </button>
                </div>
                <div className="webhook-events">
                  {ALL_EVENTS.map((ev) => (
                    <label key={ev} className="event-check" title={ev}>
                      <input
                        type="checkbox"
                        checked={wh.events?.includes(ev) ?? true}
                        onChange={() => toggleWebhookEvent(i, ev)}
                      />
                      <span>{EVENT_LABELS[ev]}</span>
                    </label>
                  ))}
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
          <span
            className={`accordion-badge ${
              hookStatus.installed
                ? hookStatus.port_match
                  ? "badge-ok"
                  : "badge-warn"
                : "badge-warn"
            }`}
          >
            {hookStatus.installed
              ? hookStatus.port_match
                ? "installed"
                : "port mismatch"
              : "not set"}
          </span>
        </button>
        {openSection === "hooks" && (
          <div className="accordion-body">
            <div className="settings-row">
              <span className="settings-label">
                {hookStatus.installed
                  ? hookStatus.port_match
                    ? `Installed on :${hookStatus.hook_port}`
                    : `Hooks on :${hookStatus.hook_port}, app on :${config.port}`
                  : "Not installed"}
              </span>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  className="btn btn-sm primary"
                  onClick={handleInstallHooks}
                >
                  {hookStatus.installed ? "Reinstall" : "Install"}
                </button>
                {hookStatus.installed && (
                  <button
                    className="btn btn-sm"
                    onClick={handleUninstallHooks}
                    title="Remove LumiCode hooks from settings.json"
                  >
                    Uninstall
                  </button>
                )}
              </div>
            </div>
            {hookStatus.installed && (
              <div className="settings-row">
                <span className="settings-label">Last event</span>
                <span className="settings-value-text">
                  {lastHookAt
                    ? formatAgo(now - lastHookAt)
                    : "none this session"}
                </span>
              </div>
            )}
            {hookStatus.installed && !hookStatus.port_match && (
              <div className="settings-hint" style={{ color: "var(--yellow)" }}>
                Hooks point to a different port — click Reinstall to fix
              </div>
            )}
            <div className="settings-hint">
              Writes hooks to ~/.claude/settings.json (backed up before changes)
            </div>
          </div>
        )}
      </div>

      {/* Config Export/Import */}
      <div className="config-actions">
        <button className="btn btn-sm" onClick={exportConfig}>
          Export Config
        </button>
        <button className="btn btn-sm" onClick={importConfig}>
          Import Config
        </button>
      </div>
    </div>
  );
}
