mod config;
mod hooks;
mod serial;
mod server;
mod webhooks;

use config::{AppConfig, SharedConfig};
use serial::{SerialManager, SharedSerial};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};

// ── Serial commands ──────────────────────────────────────────────────

#[tauri::command]
fn list_serial_ports() -> Vec<String> {
    serial::SerialConnection::list_ports()
}

#[tauri::command]
fn set_serial_port(state: tauri::State<'_, SharedSerial>, port: String) -> Result<(), String> {
    let mut mgr = state.lock().unwrap_or_else(|e| e.into_inner());
    mgr.connect(&port)?;
    let _ = mgr.send_to(&port, "idle");
    Ok(())
}

#[tauri::command]
fn disconnect_serial_port(
    state: tauri::State<'_, SharedSerial>,
    port: Option<String>,
) -> Result<(), String> {
    let mut mgr = state.lock().unwrap_or_else(|e| e.into_inner());
    match port {
        Some(p) => mgr.disconnect(&p),
        None => mgr.disconnect_all(),
    }
    Ok(())
}

#[tauri::command]
fn send_led_command(
    state: tauri::State<'_, SharedSerial>,
    config_state: tauri::State<'_, SharedConfig>,
    command: String,
) -> Result<(), String> {
    // Check for custom color in config, use appropriate animation
    let serial_command = {
        let cfg = config_state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(color) = cfg.custom_colors.get(&command) {
            let prefix = match command.as_str() {
                "working" => "blink",
                "error" => "fblink",
                "thinking" => "pulse",
                _ => "rgb",
            };
            format!("{}:{},{},{}", prefix, color.r, color.g, color.b)
        } else {
            command
        }
    };
    let mut mgr = state.lock().unwrap_or_else(|e| e.into_inner());
    mgr.send_all(&serial_command)
}

#[tauri::command]
fn get_serial_status(state: tauri::State<'_, SharedSerial>) -> Vec<(bool, String)> {
    let mgr = state.lock().unwrap_or_else(|e| e.into_inner());
    mgr.list_connected()
}

// ── Config commands ──────────────────────────────────────────────────

#[tauri::command]
fn get_config(state: tauri::State<'_, SharedConfig>) -> config::AppConfig {
    let cfg = state.lock().unwrap_or_else(|e| e.into_inner());
    cfg.clone()
}

#[tauri::command]
fn save_config(
    state: tauri::State<'_, SharedConfig>,
    config: config::AppConfig,
) -> Result<(), String> {
    let mut cfg = state.lock().unwrap_or_else(|e| e.into_inner());
    *cfg = config;
    cfg.save()
}

// ── Server status ────────────────────────────────────────────────────

#[tauri::command]
fn get_server_status(state: tauri::State<'_, server::SharedServerPort>) -> Option<u16> {
    let port = state.lock().unwrap_or_else(|e| e.into_inner());
    *port
}

// ── Hook installer ───────────────────────────────────────────────────

#[tauri::command]
fn install_hooks(state: tauri::State<'_, SharedConfig>) -> Result<String, String> {
    let cfg = state.lock().unwrap_or_else(|e| e.into_inner());
    hooks::install_hooks(cfg.port)
}

#[tauri::command]
fn check_hooks_installed(state: tauri::State<'_, SharedConfig>) -> bool {
    let cfg = state.lock().unwrap_or_else(|e| e.into_inner());
    hooks::check_hooks_installed(cfg.port)
}

// ── Log persistence ──────────────────────────────────────────────────

#[tauri::command]
fn load_log_history() -> Vec<serde_json::Value> {
    let path = AppConfig::log_path();
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => content
            .lines()
            .rev()
            .take(200)
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
fn append_log(entry: serde_json::Value) -> Result<(), String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;

    let path = AppConfig::log_path();
    let dir = AppConfig::config_dir();
    let _ = fs::create_dir_all(&dir);

    // Log rotation: if file > 1MB, truncate
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 1_000_000 {
            if let Ok(content) = fs::read_to_string(&path) {
                let lines: Vec<&str> = content.lines().collect();
                let keep = &lines[lines.len().saturating_sub(500)..];
                let _ = fs::write(&path, keep.join("\n") + "\n");
            }
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let line =
        serde_json::to_string(&entry).map_err(|e| format!("Failed to serialize log: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to write log: {}", e))?;

    Ok(())
}

// ── App entry ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = AppConfig::load();
    let start_minimized = app_config.start_minimized;
    let server_port = app_config.port;

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(SerialManager::new()) as SharedSerial)
        .manage(Mutex::new(app_config) as SharedConfig)
        .manage(Mutex::new(None::<u16>) as server::SharedServerPort)
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            set_serial_port,
            disconnect_serial_port,
            send_led_command,
            get_serial_status,
            get_config,
            save_config,
            get_server_status,
            install_hooks,
            check_hooks_installed,
            load_log_history,
            append_log,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            // Build tray menu
            let about = MenuItem::with_id(app, "about", "About LumiCode", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let settings =
                MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit LumiCode", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&about, &sep1, &show, &settings, &sep2, &quit])?;

            let icon = app.default_window_icon().cloned().expect("no app icon");
            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("LumiCode")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "about" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("navigate", "about");
                        }
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("navigate", "settings");
                        }
                    }
                    "quit" => {
                        let serial = app.state::<SharedSerial>();
                        let mut mgr = serial.lock().unwrap_or_else(|e| e.into_inner());
                        let _ = mgr.send_all("error");
                        drop(mgr);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Request notification permission
            {
                use tauri::plugin::PermissionState;
                use tauri_plugin_notification::NotificationExt;
                let notif = app.notification();
                if notif.permission_state().unwrap_or(PermissionState::Prompt)
                    != PermissionState::Granted
                {
                    let _ = notif.request_permission();
                }
            }

            // Start HTTP server with configured port
            server::start_server(app.handle().clone(), server_port);

            // Start auto-detect polling thread with exponential backoff
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut backoff_secs: u64 = 2;

                loop {
                    std::thread::sleep(std::time::Duration::from_secs(backoff_secs));

                    let serial = app_handle.state::<SharedSerial>();
                    let mut mgr = serial.lock().unwrap_or_else(|e| e.into_inner());

                    if mgr.has_connections() {
                        // Send heartbeat to all connected boards
                        let _ = mgr.send_all("heartbeat");
                        // Check which boards are still alive
                        let disconnected = mgr.check_alive_all();
                        for port_name in disconnected {
                            let _ = app_handle.emit(
                                "serial-status",
                                serde_json::json!({
                                    "connected": false,
                                    "port": port_name,
                                    "message": format!("Arduino disconnected ({})", port_name),
                                }),
                            );
                        }
                        backoff_secs = 2; // Reset backoff when we have connections
                    } else {
                        drop(mgr); // Release lock during scan
                        if let Some((port_name, port)) =
                            serial::SerialConnection::auto_detect()
                        {
                            let mut mgr = serial.lock().unwrap_or_else(|e| e.into_inner());
                            if !mgr.is_port_connected(&port_name) {
                                mgr.adopt(port, port_name.clone());
                                let _ = mgr.send_to(&port_name, "idle");
                                let _ = app_handle.emit(
                                    "serial-status",
                                    serde_json::json!({
                                        "connected": true,
                                        "port": port_name,
                                        "message": format!("Auto-connected to {}", port_name),
                                    }),
                                );
                                backoff_secs = 2; // Reset on success
                            }
                        } else {
                            // Increase backoff on failed detect: 2 -> 4 -> 8 -> 16 -> 30 max
                            backoff_secs = (backoff_secs * 2).min(30);
                        }
                    }
                }
            });

            // Show window unless start_minimized is set
            if !start_minimized {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LumiCode");
}
