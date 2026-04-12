import type {
  AppConfig,
  ColorConfig,
  WebhookConfig,
  HookStatus,
  ThemePref,
} from "../types";
import { ALL_EVENTS, EVENT_LABELS, LED_BUTTONS } from "../constants";

interface Props {
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  openSection: string | null;
  toggleSection: (id: string) => void;
  serverPort: number | null;
  hookStatus: HookStatus;
  handleInstallHooks: () => void;
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
  handleInstallHooks,
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
              <button
                className="btn btn-sm primary"
                onClick={handleInstallHooks}
              >
                {hookStatus.installed ? "Reinstall" : "Install"}
              </button>
            </div>
            {hookStatus.installed && !hookStatus.port_match && (
              <div className="settings-hint" style={{ color: "var(--yellow)" }}>
                Hooks point to a different port — click Reinstall to fix
              </div>
            )}
            <div className="settings-hint">
              Writes hooks to ~/.claude/settings.json
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
