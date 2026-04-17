use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

/// Sentinel embedded in every LumiCode-installed hook command so we can
/// identify our entries without relying on fragile heuristics like
/// "contains localhost". Users who hand-edit a localhost hook won't be
/// touched; only commands containing this tag are added / removed.
const LUMICODE_TAG: &str = "#lumicode";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookStatus {
    pub installed: bool,
    pub hook_port: Option<u16>,
    pub port_match: bool,
}

fn settings_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())
        .map(|h| h.join(".claude").join("settings.json"))
}

/// Backup settings.json to settings.json.bak.YYYYMMDDHHMMSS before writing.
fn backup_settings(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let ts = chrono::Local::now().format("%Y%m%d%H%M%S").to_string();
    let backup = path.with_extension(format!("json.bak.{}", ts));
    fs::copy(path, &backup).map_err(|e| format!("Failed to back up settings.json: {}", e))?;
    // Keep only the 5 most recent backups
    prune_old_backups(path, 5);
    Ok(())
}

/// Keep the N most recent backup files, delete the rest.
fn prune_old_backups(settings_path: &Path, keep: usize) {
    let Some(parent) = settings_path.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    let mut backups: Vec<(PathBuf, std::time::SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_str()?.to_string();
            if name.starts_with("settings.json.bak.") {
                let modified = e.metadata().ok()?.modified().ok()?;
                Some((path, modified))
            } else {
                None
            }
        })
        .collect();
    // Newest first
    backups.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, _) in backups.into_iter().skip(keep) {
        let _ = fs::remove_file(path);
    }
}

/// Build the curl command for a single event, embedding the sentinel so
/// we can detect and remove it later.
fn build_hook_command(port: u16, event: &str) -> String {
    format!(
        "curl -s --fail -X POST http://localhost:{}/hook -H \"Content-Type: application/json\" -d \"{{\\\"event\\\": \\\"{}\\\", \\\"tag\\\": \\\"{}\\\"}}\"",
        port, event, LUMICODE_TAG
    )
}

/// Returns true if this hook entry was installed by LumiCode (contains our tag).
fn is_lumicode_entry(entry: &Value) -> bool {
    // A hook entry looks like: { "matcher": "", "hooks": [ { "command": "..." } ] }
    let hooks = match entry.get("hooks").and_then(|h| h.as_array()) {
        Some(h) => h,
        None => return false,
    };
    hooks.iter().any(|h| {
        h.get("command")
            .and_then(|c| c.as_str())
            .map(|s| s.contains(LUMICODE_TAG))
            .unwrap_or(false)
    })
}

fn make_hook_entry(port: u16, event: &str) -> Value {
    json!({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": build_hook_command(port, event)
        }]
    })
}

/// Install LumiCode hooks into ~/.claude/settings.json. Preserves all
/// non-LumiCode hooks; replaces any prior LumiCode entries.
pub fn install_hooks(port: u16) -> Result<String, String> {
    let path = settings_path()?;
    let mut settings = read_settings(&path)?;

    apply_lumicode_hooks(&mut settings, port);

    backup_settings(&path)?;
    write_settings(&path, &settings)?;
    Ok(format!("Hooks installed successfully (port {})", port))
}

/// Remove all LumiCode hook entries from ~/.claude/settings.json.
/// Leaves non-LumiCode hooks untouched.
pub fn uninstall_hooks() -> Result<String, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok("Nothing to uninstall".to_string());
    }
    let mut settings = read_settings(&path)?;

    let removed = remove_lumicode_hooks(&mut settings);

    backup_settings(&path)?;
    write_settings(&path, &settings)?;
    Ok(format!(
        "Removed {} LumiCode hook entr{}",
        removed,
        if removed == 1 { "y" } else { "ies" }
    ))
}

fn read_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        return Ok(json!({}));
    }
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read settings.json: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings.json: {}", e))
}

fn write_settings(path: &Path, settings: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write settings.json: {}", e))
}

/// Inject/replace LumiCode hook entries in a settings object. Pure function
/// — no I/O. Exposed for testability.
pub fn apply_lumicode_hooks(settings: &mut Value, port: u16) {
    let events: &[(&str, &str)] = &[
        ("UserPromptSubmit", "thinking"),
        ("PreToolUse", "working"),
        ("Stop", "done"),
        ("Notification", "done"),
    ];

    let obj = match settings.as_object_mut() {
        Some(o) => o,
        None => return,
    };
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    let hooks_obj = match hooks.as_object_mut() {
        Some(h) => h,
        None => return,
    };

    for (hook_event, lumicode_event) in events {
        let new_entry = make_hook_entry(port, lumicode_event);
        match hooks_obj.get_mut(*hook_event) {
            Some(existing) => {
                if let Some(arr) = existing.as_array_mut() {
                    // Drop only our tagged entries, preserve user hooks
                    arr.retain(|e| !is_lumicode_entry(e));
                    arr.push(new_entry);
                } else {
                    // Malformed: overwrite with an array containing just ours
                    *existing = json!([new_entry]);
                }
            }
            None => {
                hooks_obj.insert(hook_event.to_string(), json!([new_entry]));
            }
        }
    }
}

/// Remove LumiCode hooks from a settings object. Returns count removed.
/// Pure function — no I/O. Exposed for testability.
pub fn remove_lumicode_hooks(settings: &mut Value) -> usize {
    let mut removed = 0;
    let Some(obj) = settings.as_object_mut() else {
        return 0;
    };
    let Some(hooks) = obj.get_mut("hooks").and_then(|h| h.as_object_mut()) else {
        return 0;
    };
    // Collect keys to potentially drop if they become empty arrays
    let keys: Vec<String> = hooks.keys().cloned().collect();
    for key in keys {
        if let Some(entry) = hooks.get_mut(&key) {
            if let Some(arr) = entry.as_array_mut() {
                let before = arr.len();
                arr.retain(|e| !is_lumicode_entry(e));
                removed += before - arr.len();
                if arr.is_empty() {
                    hooks.remove(&key);
                }
            }
        }
    }
    removed
}

/// Summary of changes that an install or uninstall would make.
/// Returned to the frontend so the user can confirm before writing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookDiff {
    pub action: String, // "install" | "uninstall"
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub kept: Vec<String>,
    pub settings_exists: bool,
}

/// Compute what would change if we installed hooks at `port`, without
/// writing anything to disk.
pub fn preview_install(port: u16) -> Result<HookDiff, String> {
    let path = settings_path()?;
    let settings_exists = path.exists();
    let before = read_settings(&path)?;
    let mut after = before.clone();
    apply_lumicode_hooks(&mut after, port);

    let (added, removed, kept) = diff_lumicode_entries(&before, &after);
    Ok(HookDiff {
        action: "install".to_string(),
        added,
        removed,
        kept,
        settings_exists,
    })
}

/// Compute what would change if we uninstalled hooks, without writing.
pub fn preview_uninstall() -> Result<HookDiff, String> {
    let path = settings_path()?;
    let settings_exists = path.exists();
    if !settings_exists {
        return Ok(HookDiff {
            action: "uninstall".to_string(),
            added: vec![],
            removed: vec![],
            kept: vec![],
            settings_exists: false,
        });
    }
    let before = read_settings(&path)?;
    let mut after = before.clone();
    remove_lumicode_hooks(&mut after);

    let (added, removed, kept) = diff_lumicode_entries(&before, &after);
    Ok(HookDiff {
        action: "uninstall".to_string(),
        added,
        removed,
        kept,
        settings_exists,
    })
}

/// For each Claude hook event key, compare the LumiCode-tagged entries
/// before and after. Returns human-readable labels grouped into
/// (added, removed, kept). User-authored entries are ignored.
fn diff_lumicode_entries(before: &Value, after: &Value) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut added = vec![];
    let mut removed = vec![];
    let mut kept = vec![];

    let before_hooks = before
        .get("hooks")
        .and_then(|h| h.as_object())
        .cloned()
        .unwrap_or_default();
    let after_hooks = after
        .get("hooks")
        .and_then(|h| h.as_object())
        .cloned()
        .unwrap_or_default();

    let mut events: Vec<String> = before_hooks
        .keys()
        .chain(after_hooks.keys())
        .cloned()
        .collect();
    events.sort();
    events.dedup();

    for event in events {
        let before_has = event_has_lumicode(before_hooks.get(&event));
        let after_has = event_has_lumicode(after_hooks.get(&event));
        match (before_has, after_has) {
            (false, true) => added.push(event),
            (true, false) => removed.push(event),
            (true, true) => kept.push(event),
            (false, false) => {}
        }
    }
    (added, removed, kept)
}

fn event_has_lumicode(entry: Option<&Value>) -> bool {
    let Some(arr) = entry.and_then(|e| e.as_array()) else {
        return false;
    };
    arr.iter().any(is_lumicode_entry)
}

pub fn check_hooks_installed(port: u16) -> bool {
    let status = check_hooks_status(port);
    status.installed && status.port_match
}

pub fn check_hooks_status(configured_port: u16) -> HookStatus {
    let path = match settings_path() {
        Ok(p) => p,
        Err(_) => {
            return HookStatus {
                installed: false,
                hook_port: None,
                port_match: false,
            }
        }
    };

    if !path.exists() {
        return HookStatus {
            installed: false,
            hook_port: None,
            port_match: false,
        };
    }

    let settings = match read_settings(&path) {
        Ok(v) => v,
        Err(_) => {
            return HookStatus {
                installed: false,
                hook_port: None,
                port_match: false,
            }
        }
    };

    let hook_port = find_lumicode_port(&settings);

    HookStatus {
        installed: hook_port.is_some(),
        hook_port,
        port_match: hook_port == Some(configured_port),
    }
}

/// Walk the settings object for a LumiCode-tagged hook command and extract
/// its port. Pure function — no I/O. Exposed for testability.
pub fn find_lumicode_port(settings: &Value) -> Option<u16> {
    let hooks = settings.get("hooks")?.as_object()?;
    for (_event_name, entries) in hooks {
        let arr = match entries.as_array() {
            Some(a) => a,
            None => continue,
        };
        for entry in arr {
            if !is_lumicode_entry(entry) {
                continue;
            }
            let cmds = match entry.get("hooks").and_then(|h| h.as_array()) {
                Some(h) => h,
                None => continue,
            };
            for cmd in cmds {
                let s = cmd.get("command").and_then(|c| c.as_str()).unwrap_or("");
                if !s.contains(LUMICODE_TAG) {
                    continue;
                }
                if let Some(port) = extract_port(s) {
                    return Some(port);
                }
            }
        }
    }
    None
}

/// Extract `localhost:PORT` from a command string.
fn extract_port(cmd: &str) -> Option<u16> {
    let marker = "localhost:";
    let pos = cmd.find(marker)?;
    let after = &cmd[pos + marker.len()..];
    let port_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    port_str.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn install_into_empty() {
        let mut settings = json!({});
        apply_lumicode_hooks(&mut settings, 9999);
        let hooks = settings.get("hooks").unwrap().as_object().unwrap();
        assert_eq!(hooks.len(), 4);
        for event in ["UserPromptSubmit", "PreToolUse", "Stop", "Notification"] {
            let arr = hooks.get(event).unwrap().as_array().unwrap();
            assert_eq!(arr.len(), 1);
            assert!(is_lumicode_entry(&arr[0]));
        }
    }

    #[test]
    fn install_preserves_user_hooks() {
        let mut settings = json!({
            "hooks": {
                "Stop": [{
                    "matcher": "",
                    "hooks": [{
                        "type": "command",
                        "command": "echo user wrote this"
                    }]
                }]
            }
        });
        apply_lumicode_hooks(&mut settings, 9999);
        let stop = settings["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2, "user hook + lumicode hook");
        assert!(stop.iter().any(|e| !is_lumicode_entry(e)));
        assert!(stop.iter().any(is_lumicode_entry));
    }

    #[test]
    fn reinstall_replaces_not_duplicates() {
        let mut settings = json!({});
        apply_lumicode_hooks(&mut settings, 9999);
        apply_lumicode_hooks(&mut settings, 8888);
        apply_lumicode_hooks(&mut settings, 7777);
        let stop = settings["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 1, "only one LumiCode entry after reinstall");
        assert_eq!(find_lumicode_port(&settings), Some(7777));
    }

    #[test]
    fn uninstall_removes_only_lumicode() {
        let user_hook = json!({
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": "curl http://localhost:3000/my-hook"
            }]
        });
        let mut settings = json!({
            "hooks": {
                "Stop": [user_hook.clone()]
            }
        });
        apply_lumicode_hooks(&mut settings, 9999);
        assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 2);

        let removed = remove_lumicode_hooks(&mut settings);
        assert_eq!(removed, 4, "one per event");
        assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert_eq!(settings["hooks"]["Stop"][0], user_hook);
    }

    #[test]
    fn uninstall_drops_empty_event_keys() {
        let mut settings = json!({});
        apply_lumicode_hooks(&mut settings, 9999);
        remove_lumicode_hooks(&mut settings);
        let hooks = settings.get("hooks").unwrap().as_object().unwrap();
        assert!(hooks.is_empty(), "empty event arrays pruned");
    }

    #[test]
    fn find_port_ignores_user_localhost_hooks() {
        let mut settings = json!({
            "hooks": {
                "Stop": [{
                    "matcher": "",
                    "hooks": [{
                        "type": "command",
                        "command": "curl http://localhost:3000/not-lumicode"
                    }]
                }]
            }
        });
        assert_eq!(find_lumicode_port(&settings), None);
        apply_lumicode_hooks(&mut settings, 9999);
        assert_eq!(find_lumicode_port(&settings), Some(9999));
    }

    #[test]
    fn no_error_echo_in_installed_commands() {
        let mut settings = json!({});
        apply_lumicode_hooks(&mut settings, 9999);
        let cmd = settings["hooks"]["Stop"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(!cmd.contains("ERROR"));
        assert!(!cmd.contains("echo"));
    }

    #[test]
    fn check_status_matches_port() {
        let mut settings = json!({});
        apply_lumicode_hooks(&mut settings, 9999);
        assert_eq!(find_lumicode_port(&settings), Some(9999));
    }

    #[test]
    fn diff_fresh_install() {
        let before = json!({});
        let mut after = before.clone();
        apply_lumicode_hooks(&mut after, 9999);
        let (added, removed, kept) = diff_lumicode_entries(&before, &after);
        assert_eq!(added.len(), 4);
        assert!(removed.is_empty());
        assert!(kept.is_empty());
    }

    #[test]
    fn diff_reinstall_shows_kept() {
        let mut before = json!({});
        apply_lumicode_hooks(&mut before, 9999);
        let mut after = before.clone();
        apply_lumicode_hooks(&mut after, 8888);
        let (added, removed, kept) = diff_lumicode_entries(&before, &after);
        assert!(added.is_empty());
        assert!(removed.is_empty());
        assert_eq!(kept.len(), 4);
    }

    #[test]
    fn diff_uninstall_shows_removed() {
        let mut before = json!({});
        apply_lumicode_hooks(&mut before, 9999);
        let mut after = before.clone();
        remove_lumicode_hooks(&mut after);
        let (added, removed, kept) = diff_lumicode_entries(&before, &after);
        assert!(added.is_empty());
        assert_eq!(removed.len(), 4);
        assert!(kept.is_empty());
    }

    #[test]
    fn extract_port_basic() {
        assert_eq!(extract_port("curl http://localhost:9999/hook"), Some(9999));
        assert_eq!(extract_port("localhost:1024"), Some(1024));
        assert_eq!(extract_port("no port here"), None);
    }
}
