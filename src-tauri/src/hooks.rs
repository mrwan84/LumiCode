use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookStatus {
    pub installed: bool,
    pub hook_port: Option<u16>,
    pub port_match: bool,
}

pub fn install_hooks(port: u16) -> Result<String, String> {
    let settings_path = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".claude")
        .join("settings.json");

    // Read existing settings or start with empty object
    let mut settings: Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings.json: {}", e))?
    } else {
        // Create .claude directory if needed
        if let Some(parent) = settings_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        json!({})
    };

    let base_cmd = format!(
        "curl -s --fail -X POST http://localhost:{}/hook -H \"Content-Type: application/json\"",
        port
    );

    let make_hook = |event: &str| -> Value {
        json!([{
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": format!(
                    "{} -d \"{{\\\"event\\\": \\\"{}\\\"}}\"",
                    base_cmd, event
                )
            }]
        }])
    };

    // LumiCode hook entries to install
    let lumicode_hooks = vec![
        ("UserPromptSubmit", make_hook("thinking")),
        ("PreToolUse", make_hook("working")),
        ("Stop", make_hook("done")),
        ("Notification", make_hook("done")),
    ];

    // Merge into existing settings, preserving non-LumiCode hooks
    if let Some(obj) = settings.as_object_mut() {
        let hooks = obj
            .entry("hooks")
            .or_insert_with(|| json!({}));

        if let Some(hooks_obj) = hooks.as_object_mut() {
            for (event_name, lumicode_entry) in lumicode_hooks {
                if let Some(existing) = hooks_obj.get_mut(event_name) {
                    if let Some(arr) = existing.as_array_mut() {
                        // Remove any existing LumiCode entries (contain "lumicode" or our port)
                        arr.retain(|entry| {
                            let s = entry.to_string();
                            !s.contains("/hook") || !s.contains("localhost")
                        });
                        // Append our new entry
                        if let Some(new_arr) = lumicode_entry.as_array() {
                            arr.extend(new_arr.iter().cloned());
                        }
                    }
                } else {
                    hooks_obj.insert(event_name.to_string(), lumicode_entry);
                }
            }
        }
    }

    // Write back with pretty formatting
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(format!("Hooks installed successfully (port {})", port))
}

pub fn check_hooks_installed(port: u16) -> bool {
    let status = check_hooks_status(port);
    status.installed && status.port_match
}

pub fn check_hooks_status(configured_port: u16) -> HookStatus {
    let settings_path = dirs::home_dir()
        .map(|h| h.join(".claude").join("settings.json"))
        .unwrap_or_default();

    if !settings_path.exists() {
        return HookStatus {
            installed: false,
            hook_port: None,
            port_match: false,
        };
    }

    let content = match fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => {
            return HookStatus {
                installed: false,
                hook_port: None,
                port_match: false,
            }
        }
    };

    let settings: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => {
            return HookStatus {
                installed: false,
                hook_port: None,
                port_match: false,
            }
        }
    };

    // Check if hooks exist
    let hooks_str = settings
        .get("hooks")
        .and_then(|h| h.get("Stop"))
        .map(|s| s.to_string());

    let hooks_str = match hooks_str {
        Some(s) => s,
        None => {
            return HookStatus {
                installed: false,
                hook_port: None,
                port_match: false,
            }
        }
    };

    // Extract port from "localhost:NNNN"
    let hook_port = extract_port_from_hooks(&hooks_str);

    HookStatus {
        installed: true,
        hook_port,
        port_match: hook_port == Some(configured_port),
    }
}

fn extract_port_from_hooks(hooks_str: &str) -> Option<u16> {
    // Look for "localhost:NNNN" pattern
    let marker = "localhost:";
    if let Some(pos) = hooks_str.find(marker) {
        let after = &hooks_str[pos + marker.len()..];
        let port_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        port_str.parse().ok()
    } else {
        None
    }
}
