use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorConfig {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub format: WebhookFormat,
    #[serde(default = "default_all_events")]
    pub events: Vec<String>,
}

fn default_all_events() -> Vec<String> {
    vec![
        "working".into(),
        "done".into(),
        "error".into(),
        "idle".into(),
        "thinking".into(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WebhookFormat {
    Discord,
    Slack,
    #[serde(rename = "homeassistant")]
    HomeAssistant,
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default)]
    pub sound_enabled: bool,
    #[serde(default = "default_true")]
    pub log_to_disk: bool,
    #[serde(default)]
    pub custom_colors: HashMap<String, ColorConfig>,
    #[serde(default)]
    pub webhooks: Vec<WebhookConfig>,
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_minutes: u32,
    #[serde(default)]
    pub board_names: HashMap<String, String>,
    #[serde(default = "default_sound_events")]
    pub sound_events: Vec<String>,
    #[serde(default)]
    pub hotkey: Option<String>,
    /// Suppress identical consecutive events fired within this many
    /// milliseconds. 0 disables coalescing. Defaults to 100ms, which
    /// absorbs bursts from rapid tool calls without losing meaningful
    /// state transitions.
    #[serde(default = "default_coalesce_ms")]
    pub coalesce_ms: u64,
    /// GitHub "owner/repo" to query for releases. Empty disables the
    /// "Check for updates" button.
    #[serde(default)]
    pub update_check_repo: String,
}

fn default_coalesce_ms() -> u64 {
    100
}

fn default_idle_timeout() -> u32 {
    5
}

fn default_sound_events() -> Vec<String> {
    vec!["done".into()]
}

fn default_port() -> u16 {
    9999
}

fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: 9999,
            start_minimized: false,
            sound_enabled: false,
            log_to_disk: true,
            custom_colors: HashMap::new(),
            webhooks: Vec::new(),
            idle_timeout_minutes: 5,
            board_names: HashMap::new(),
            sound_events: vec!["done".into()],
            hotkey: None,
            coalesce_ms: 100,
            update_check_repo: String::new(),
        }
    }
}

impl AppConfig {
    pub fn config_dir() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".lumicode")
    }

    pub fn config_path() -> PathBuf {
        Self::config_dir().join("config.json")
    }

    pub fn log_path() -> PathBuf {
        Self::config_dir().join("events.jsonl")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(config) => return config,
                    Err(e) => eprintln!("LumiCode: Failed to parse config: {}", e),
                },
                Err(e) => eprintln!("LumiCode: Failed to read config: {}", e),
            }
        }

        let config = Self::default();
        let _ = config.save();
        config
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(Self::config_path(), content)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        Ok(())
    }
}

pub type SharedConfig = Mutex<AppConfig>;
