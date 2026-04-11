# LumiCode

Claude Code RGB Notifier — a system tray app that notifies you when Claude Code finishes a task using native notifications and an RGB LED connected to an Arduino Nano.

## How It Works

1. Claude Code triggers a **hook** upon completion
2. The hook sends an **HTTP POST** to LumiCode at `localhost:9999` (configurable)
3. LumiCode sends a **native notification** (on `done` events only)
4. LumiCode sends a **serial command** to Arduino to control the **RGB LED**
5. Arduino is **auto-detected** when plugged in via USB
6. Events are optionally forwarded to **webhooks** (Discord, Slack, Home Assistant)

## LED Behavior

### Default Commands

| Command    | Color  | Effect     |
| ---------- | ------ | ---------- |
| `working`  | Cyan   | Slow blink |
| `done`     | Green  | Solid      |
| `error`    | Red    | Fast blink |
| `idle`     | Blue   | Solid      |
| `thinking` | Purple | Slow pulse |

### Custom Color Commands

Custom colors preserve the animation style of the original event:

| Command             | Effect     | Use case            |
| ------------------- | ---------- | ------------------- |
| `rgb:R,G,B`         | Solid      | Custom done/idle    |
| `blink:R,G,B`       | Slow blink | Custom working      |
| `fblink:R,G,B`      | Fast blink | Custom error        |
| `pulse:R,G,B`       | Slow pulse | Custom thinking     |

Colors are configurable in the Settings tab. When a custom color is set, LumiCode automatically sends the appropriate animation command.

## Hardware Setup

### Components

- Arduino Nano (ATmega328P)
- HW-479 RGB LED Module (common cathode, built-in resistors)

### Wiring

```
HW-479 Module         Arduino Nano
─────────────         ────────────
R  ──────────────────  D9
G  ──────────────────  D10
B  ──────────────────  D11
GND (-)  ────────────  GND
```

### Upload Firmware

1. Close LumiCode if running (the app holds the serial port)
2. Open `arduino/lumicode/lumicode.ino` in Arduino IDE
3. Select **Board:** `Arduino Nano`
4. Select **Processor:** `ATmega328P` (or `Old Bootloader` variant)
5. Select **Port:** your COM port
6. Click **Upload**

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.70
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/)

### Build & Run

```bash
npm install
npm run tauri:dev      # development
npm run tauri:build    # production build
```

## Claude Code Hook Setup

You can install hooks automatically or manually.

### Automatic Installation

1. Open LumiCode and go to the **Settings** tab
2. Scroll to **Claude Code Hooks**
3. Click **Install** — hooks are written to `~/.claude/settings.json`

### Manual Installation

Add the following hooks to your Claude Code settings file (`~/.claude/settings.json`).

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --fail -X POST http://localhost:9999/hook -H \"Content-Type: application/json\" -d \"{\\\"event\\\": \\\"thinking\\\"}\" || echo \"ERROR: LumiCode is not running\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --fail -X POST http://localhost:9999/hook -H \"Content-Type: application/json\" -d \"{\\\"event\\\": \\\"working\\\"}\" || echo \"ERROR: LumiCode is not running\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --fail -X POST http://localhost:9999/hook -H \"Content-Type: application/json\" -d \"{\\\"event\\\": \\\"done\\\"}\" || echo \"ERROR: LumiCode is not running\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --fail -X POST http://localhost:9999/hook -H \"Content-Type: application/json\" -d \"{\\\"event\\\": \\\"done\\\"}\" || echo \"ERROR: LumiCode is not running\""
          }
        ]
      }
    ]
  }
}
```

> **Note:** If you changed the HTTP port in Settings, replace `9999` with your configured port. The automatic installer handles this for you.

### Hook Events

| Hook               | Event sent | LED Effect   | When it fires                |
| ------------------ | ---------- | ------------ | ---------------------------- |
| `UserPromptSubmit` | `thinking` | Purple pulse | You send a message to Claude |
| `PreToolUse`       | `working`  | Cyan blink   | Claude starts using a tool   |
| `Stop`             | `done`     | Green solid  | Claude finishes responding   |
| `Notification`     | `done`     | Green solid  | Claude sends a notification  |

### Merging with existing settings

If you already have other settings in `settings.json`, merge the `hooks` key into your existing file.

## Settings

LumiCode stores its configuration at `~/.lumicode/config.json`. All settings are accessible from the in-app **Settings** tab.

### General

| Setting          | Default | Description                                     |
| ---------------- | ------- | ----------------------------------------------- |
| HTTP Port        | 9999    | Port for the hook server (restart required)      |
| Start minimized  | Off     | Launch directly to system tray                   |
| Sound notifications | Off  | Play a tone when a task completes                |
| Persist event log | On     | Save events to `~/.lumicode/events.jsonl`        |

### LED Colors

Set custom RGB colors per event. The animation style (blink, pulse, solid) is preserved automatically. Click the color swatch to open a color picker, or use the reset button to restore defaults.

### Webhooks

Forward events to external services. Supported formats:

| Format         | Payload shape                                      |
| -------------- | -------------------------------------------------- |
| Generic        | `{"event": "done", "message": "...", "app": "lumicode"}` |
| Discord        | `{"content": "**LumiCode** \| done — ..."}` |
| Slack          | `{"text": "*LumiCode* \| done — ..."}` |
| Home Assistant | `{"event": "done", "source": "lumicode", "message": "..."}` |

### API Endpoints

| Method | Endpoint  | Description             |
| ------ | --------- | ----------------------- |
| GET    | `/health` | Check if app is running |
| POST   | `/hook`   | Send event to LumiCode  |

#### POST `/hook` body

```json
{ "event": "done" }
```

Valid events: `working`, `done`, `error`, `idle`, `thinking`

## Multi-LED Support

LumiCode can control multiple Arduino boards simultaneously. Each board appears in the Serial Ports section on the Home tab. Events are broadcast to all connected boards.

1. Connect multiple Arduino Nano boards via USB
2. Each board is auto-detected via the LUMICODE_PING/PONG handshake
3. Use the port dropdown to manually connect additional boards
4. Each board can be disconnected independently

## Tech Stack

- **Frontend:** React + TypeScript
- **Backend:** Rust (Tauri v2)
- **HTTP Server:** Axum
- **Serial:** serialport crate
- **Webhooks:** reqwest
- **Arduino:** C++ (Arduino framework)

## Tray Menu

Right-click the tray icon:

- **About LumiCode** — show the about page
- **Show** — show the app window
- **Settings** — open the Settings tab
- **Quit LumiCode** — exit the app

Clicking the X button hides the window to tray. The app keeps running in the background.

## Version History

### v1.3.0

- **Settings page** with collapsible accordion layout (General, LED Colors, Webhooks, Hooks)
- **Config file** at `~/.lumicode/config.json` for persistent settings
- **Configurable HTTP port** (default 9999, with automatic fallback on conflict)
- **Port conflict resolution** — tries next 2 ports if configured port is in use
- **Multi-LED support** — connect and control multiple Arduino boards simultaneously
- **Custom LED colors** — set custom RGB values per event via color picker in Settings
- **Custom colors preserve animations** — working blinks, error fast-blinks, thinking pulses
- **Arduino `rgb`, `blink`, `fblink`, `pulse` commands** for custom color control
- **LED preview** — animated circle in status bar mirrors the current LED state with custom colors
- **Sound notifications** — optional tone on task completion (done event only)
- **Webhook forwarding** — forward events to Discord, Slack, Home Assistant, or generic endpoints
- **Hook installer** — one-click button to install Claude Code hooks in `~/.claude/settings.json`
- **Notification history** — event log persists to `~/.lumicode/events.jsonl` across restarts
- **Clear log button** — clear the event log with one click
- **Connection toasts** — brief visual feedback on Arduino connect/disconnect
- **Start minimized** — option to launch directly to system tray
- **Exponential reconnect backoff** — reduces polling frequency when no Arduino is found (2s -> 30s)
- **Health check indicator** — shows HTTP server status in the status bar
- **Native notifications** now only fire on `done` events (no more spam on working/thinking)
- **Sound notifications** only fire on `done` events
- **Port dropdown** auto-selects the first available unconnected port
- Tray menu "Settings" now opens the in-app Settings tab

### v1.2.0

- Disabled right-click context menu and text selection in the app window
- Fixed version mismatch between header and About page
- Fixed mutex poisoning crashes across all serial lock sites
- HTTP server no longer crashes the app if port 9999 is already in use
- Fixed Arduino serial buffer overflow on long/malformed input
- Fixed optimistic connection state causing UI flicker on connect
- Fixed event listener churn caused by unstable `refreshPorts` dependency

### v1.1.0

- Top tab navigation (Home / About)
- Light and dark theme support (follows OS preference, manual toggle)
- `UserPromptSubmit` hook for thinking state (purple pulse)
- LED defaults to error (red blink) when app is not running
- Sends idle on connect, error on quit
- Error message when hooks fire while LumiCode is not running

### v1.0.0

- Initial release
- System tray app with hide-to-tray on close
- Arduino Nano auto-detection via USB with LUMICODE_PING/PONG handshake
- Automatic reconnection when Arduino is unplugged and re-plugged
- Native Windows notifications on Claude Code events
- HTTP server on `localhost:9999` for Claude Code hook integration
- RGB LED control with 5 modes: working, done, error, idle, thinking
- Manual serial port selector as fallback
- Event log with color-coded entries
- About page with author info and spinning RGB ring animation
- Tray menu: About, Show, Settings, Quit

## License

MIT
