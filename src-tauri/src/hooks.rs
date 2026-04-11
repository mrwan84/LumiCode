use serde_json::{json, Value};
use std::fs;

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
    let error_suffix = " || echo \"ERROR: LumiCode is not running\"";

    let make_hook = |event: &str| -> Value {
        json!([{
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": format!(
                    "{} -d \"{{\\\"event\\\": \\\"{}\\\"}}\"{}",
                    base_cmd, event, error_suffix
                )
            }]
        }])
    };

    // Build hooks object
    let hooks = json!({
        "UserPromptSubmit": make_hook("thinking"),
        "PreToolUse": make_hook("working"),
        "Stop": make_hook("done"),
        "Notification": make_hook("done"),
    });

    // Merge into existing settings
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("hooks".to_string(), hooks);
    }

    // Write back with pretty formatting
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(format!("Hooks installed successfully (port {})", port))
}

pub fn check_hooks_installed(port: u16) -> bool {
    let settings_path = dirs::home_dir()
        .map(|h| h.join(".claude").join("settings.json"))
        .unwrap_or_default();

    if !settings_path.exists() {
        return false;
    }

    let content = match fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let settings: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };

    // Check if hooks exist and reference our port
    let port_str = format!("localhost:{}", port);
    settings
        .get("hooks")
        .and_then(|h| h.get("Stop"))
        .map(|s| s.to_string().contains(&port_str))
        .unwrap_or(false)
}
