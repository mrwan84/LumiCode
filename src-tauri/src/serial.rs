use serialport::{SerialPort, SerialPortType};
use std::io::{BufRead, BufReader, Write};
use std::sync::Mutex;
use std::time::Duration;

pub struct SerialConnection {
    port: Option<Box<dyn SerialPort>>,
    port_name: String,
}

impl SerialConnection {
    pub fn new() -> Self {
        Self {
            port: None,
            port_name: String::new(),
        }
    }

    pub fn connect(&mut self, port_name: &str) -> Result<(), String> {
        let port = serialport::new(port_name, 9600)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

        self.port = Some(port);
        self.port_name = port_name.to_string();
        Ok(())
    }

    #[allow(dead_code)]
    pub fn disconnect(&mut self) {
        self.port = None;
        self.port_name.clear();
    }

    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    pub fn port_name(&self) -> &str {
        &self.port_name
    }

    pub fn send(&mut self, command: &str) -> Result<(), String> {
        if self.port.is_none() {
            return Err("Not connected to any serial port".to_string());
        }

        let data = format!("{}\n", command);
        let port = self.port.as_mut().unwrap();

        if let Err(e) = port.write_all(data.as_bytes()) {
            self.port = None;
            self.port_name.clear();
            return Err(format!("Write failed (disconnected): {}", e));
        }

        if let Err(e) = port.flush() {
            return Err(format!("Flush failed: {}", e));
        }

        Ok(())
    }

    pub fn check_alive(&mut self) -> bool {
        if self.port.is_none() {
            return false;
        }

        let still_exists = serialport::available_ports()
            .unwrap_or_default()
            .iter()
            .any(|p| p.port_name == self.port_name);

        if !still_exists {
            self.port = None;
            self.port_name.clear();
            return false;
        }

        true
    }

    pub fn list_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }

    pub fn adopt(&mut self, port: Box<dyn SerialPort>, port_name: String) {
        self.port = Some(port);
        self.port_name = port_name;
    }

    pub fn auto_detect() -> Option<(String, Box<dyn SerialPort>)> {
        let ports = serialport::available_ports().unwrap_or_default();

        for port_info in ports {
            if !matches!(port_info.port_type, SerialPortType::UsbPort(_)) {
                continue;
            }

            let name = &port_info.port_name;

            let port = serialport::new(name, 9600)
                .timeout(Duration::from_millis(2000))
                .open();

            let mut port = match port {
                Ok(p) => p,
                Err(_) => continue,
            };

            std::thread::sleep(Duration::from_millis(2000));

            if port.write_all(b"LUMICODE_PING\n").is_err() {
                continue;
            }
            let _ = port.flush();

            let mut reader = BufReader::new(&mut port);
            let mut line = String::new();
            if let Ok(n) = reader.read_line(&mut line) {
                if n > 0 && line.trim() == "LUMICODE_PONG" {
                    drop(reader);
                    let _ = port.set_timeout(Duration::from_millis(1000));
                    return Some((name.clone(), port));
                }
            }
        }

        None
    }
}

// ── Multi-LED Manager ────────────────────────────────────────────────

pub struct SerialManager {
    connections: Vec<SerialConnection>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            connections: Vec::new(),
        }
    }

    pub fn connect(&mut self, port_name: &str) -> Result<(), String> {
        // Don't connect if already connected to this port
        if self.is_port_connected(port_name) {
            return Err(format!("Already connected to {}", port_name));
        }

        let mut conn = SerialConnection::new();
        conn.connect(port_name)?;
        self.connections.push(conn);
        Ok(())
    }

    pub fn disconnect(&mut self, port_name: &str) {
        self.connections.retain(|c| c.port_name() != port_name);
    }

    pub fn disconnect_all(&mut self) {
        self.connections.clear();
    }

    pub fn has_connections(&self) -> bool {
        !self.connections.is_empty()
    }

    pub fn is_port_connected(&self, port_name: &str) -> bool {
        self.connections.iter().any(|c| c.port_name() == port_name)
    }

    pub fn send_all(&mut self, command: &str) -> Result<(), String> {
        if self.connections.is_empty() {
            return Err("Not connected to any serial port".to_string());
        }

        let mut errors = Vec::new();
        for conn in &mut self.connections {
            if let Err(e) = conn.send(command) {
                errors.push(e);
            }
        }

        // Remove dead connections
        self.connections.retain(|c| c.is_connected());

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    pub fn send_to(&mut self, port_name: &str, command: &str) -> Result<(), String> {
        if let Some(conn) = self.connections.iter_mut().find(|c| c.port_name() == port_name) {
            conn.send(command)
        } else {
            Err(format!("Not connected to {}", port_name))
        }
    }

    pub fn list_connected(&self) -> Vec<(bool, String)> {
        if self.connections.is_empty() {
            return vec![(false, String::new())];
        }
        self.connections
            .iter()
            .map(|c| (c.is_connected(), c.port_name().to_string()))
            .collect()
    }

    pub fn adopt(&mut self, port: Box<dyn SerialPort>, port_name: String) {
        let mut conn = SerialConnection::new();
        conn.adopt(port, port_name);
        self.connections.push(conn);
    }

    /// Check all connections, return names of disconnected ports
    pub fn check_alive_all(&mut self) -> Vec<String> {
        let mut disconnected = Vec::new();
        for conn in &mut self.connections {
            if !conn.check_alive() {
                disconnected.push(conn.port_name().to_string());
            }
        }
        self.connections.retain(|c| c.is_connected());
        disconnected
    }
}

pub type SharedSerial = Mutex<SerialManager>;
