use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::config::SharedConfig;
use crate::serial::SharedSerial;
use crate::webhooks;

#[derive(Deserialize)]
pub struct HookPayload {
    event: String,
}

struct ServerState {
    app: AppHandle,
}

pub type SharedServerPort = Mutex<Option<u16>>;

pub fn start_server(app: AppHandle, port: u16) {
    let state = Arc::new(ServerState { app: app.clone() });

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            let router = Router::new()
                .route("/health", get(health))
                .route("/hook", post(handle_hook))
                .with_state(state);

            // Try configured port, then fallback to +1 and +2
            let mut bound_port = None;
            for try_port in [port, port + 1, port + 2] {
                let addr = format!("127.0.0.1:{}", try_port);
                match tokio::net::TcpListener::bind(&addr).await {
                    Ok(listener) => {
                        if try_port != port {
                            eprintln!(
                                "LumiCode: Port {} was in use, fell back to port {}",
                                port, try_port
                            );
                        }

                        // Store the actual bound port
                        let port_state = app.state::<SharedServerPort>();
                        {
                            let mut p = port_state.lock().unwrap_or_else(|e| e.into_inner());
                            *p = Some(try_port);
                        }

                        // Emit server status to frontend
                        let _ = app.emit(
                            "server-status",
                            serde_json::json!({
                                "port": try_port,
                                "configured_port": port,
                                "fallback": try_port != port,
                            }),
                        );

                        bound_port = Some(try_port);
                        if let Err(e) = axum::serve(listener, router).await {
                            eprintln!("LumiCode: HTTP server error: {}", e);
                        }
                        break;
                    }
                    Err(e) => {
                        eprintln!(
                            "LumiCode: Failed to bind to port {}: {}",
                            try_port, e
                        );
                    }
                }
            }

            if bound_port.is_none() {
                eprintln!("LumiCode: Could not bind to any port ({}-{})", port, port + 2);
                let _ = app.emit(
                    "server-status",
                    serde_json::json!({
                        "port": serde_json::Value::Null,
                        "configured_port": port,
                        "error": format!("Could not bind to ports {}-{}", port, port + 2),
                    }),
                );
            }
        });
    });
}

async fn health() -> &'static str {
    "LumiCode is running"
}

async fn handle_hook(
    State(state): State<Arc<ServerState>>,
    Json(payload): Json<HookPayload>,
) -> impl IntoResponse {
    let event = payload.event.to_lowercase();

    let (title, body) = match event.as_str() {
        "working" => ("LumiCode", "Claude Code — Task is running..."),
        "done" => ("LumiCode", "Claude Code — Task completed!"),
        "error" => ("LumiCode", "Claude Code — Task failed with an error."),
        "idle" => ("LumiCode", "Claude Code is idle."),
        "thinking" => ("LumiCode", "Claude Code — Thinking..."),
        _ => ("LumiCode", "Unknown event received."),
    };

    // Send native notification ONLY for "done" event
    if event == "done" {
        let notif = state.app.notification();
        let _ = notif.builder().title(title).body(body).show();
    }

    // Determine serial command: check for custom colors, use appropriate animation
    let serial_command = {
        let config = state.app.state::<SharedConfig>();
        let cfg = config.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(color) = cfg.custom_colors.get(&event) {
            let prefix = match event.as_str() {
                "working" => "blink",
                "error" => "fblink",
                "thinking" => "pulse",
                _ => "rgb",
            };
            format!("{}:{},{},{}", prefix, color.r, color.g, color.b)
        } else {
            event.clone()
        }
    };

    // Send serial command to all connected Arduinos
    let serial = state.app.state::<SharedSerial>();
    let serial_result = {
        let mut mgr = serial.lock().unwrap_or_else(|e| e.into_inner());
        mgr.send_all(&serial_command)
    };

    let serial_status = match &serial_result {
        Ok(()) => format!("LED: {}", serial_command),
        Err(e) => format!("LED skipped: {}", e),
    };

    // Emit event to frontend
    let _ = state.app.emit(
        "hook-event",
        serde_json::json!({
            "event": event,
            "message": format!("{} | {}", body, serial_status),
        }),
    );

    // Persist log entry to disk
    {
        let config = state.app.state::<SharedConfig>();
        let cfg = config.lock().unwrap_or_else(|e| e.into_inner());
        if cfg.log_to_disk {
            let now = chrono::Local::now();
            let log_entry = serde_json::json!({
                "time": now.format("%H:%M:%S").to_string(),
                "message": format!("{} | {}", body, serial_status),
                "event": event,
                "timestamp": now.to_rfc3339(),
            });
            // Fire-and-forget log append
            let path = crate::config::AppConfig::log_path();
            let _ = append_log_to_file(&path, &log_entry);
        }
    }

    // Forward to webhooks (fire-and-forget)
    {
        let config = state.app.state::<SharedConfig>();
        let cfg = config.lock().unwrap_or_else(|e| e.into_inner());
        if !cfg.webhooks.is_empty() {
            let webhook_list = cfg.webhooks.clone();
            let event_clone = event.clone();
            let body_str = body.to_string();
            tokio::spawn(async move {
                webhooks::forward_event(&webhook_list, &event_clone, &body_str).await;
            });
        }
    }

    (StatusCode::OK, format!("OK: {}", event))
}

fn append_log_to_file(path: &std::path::Path, entry: &serde_json::Value) -> Result<(), String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Log rotation: if file > 1MB, truncate
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > 1_000_000 {
            if let Ok(content) = fs::read_to_string(path) {
                let lines: Vec<&str> = content.lines().collect();
                let keep = &lines[lines.len().saturating_sub(500)..];
                let _ = fs::write(path, keep.join("\n") + "\n");
            }
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open log: {}", e))?;

    let line = serde_json::to_string(entry).map_err(|e| format!("Serialize error: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}
