export interface LogEntry {
  time: string;
  message: string;
  event?: string;
  timestamp?: string;
}

export interface ColorConfig {
  r: number;
  g: number;
  b: number;
}

export interface WebhookConfig {
  name: string;
  url: string;
  enabled: boolean;
  format: string;
  events: string[];
}

export interface AppConfig {
  port: number;
  start_minimized: boolean;
  sound_enabled: boolean;
  log_to_disk: boolean;
  custom_colors: Record<string, ColorConfig>;
  webhooks: WebhookConfig[];
  idle_timeout_minutes: number;
  board_names: Record<string, string>;
  sound_events: string[];
  hotkey: string | null;
  coalesce_ms: number;
  update_check_repo: string;
}

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  update_available: boolean;
  release_url: string | null;
  message: string;
}

export interface HookStatus {
  installed: boolean;
  hook_port: number | null;
  port_match: boolean;
}

export interface HookDiff {
  action: "install" | "uninstall";
  added: string[];
  removed: string[];
  kept: string[];
  settings_exists: boolean;
}

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export type ThemePref = "system" | "dark" | "light";
