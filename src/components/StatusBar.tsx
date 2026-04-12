import type { ColorConfig } from "../types";

interface Props {
  currentLedState: string;
  getColorForEvent: (event: string) => ColorConfig;
  isConnected: boolean;
  connectedPorts: string[];
  serverPort: number | null;
  serverFallback: boolean;
  getBoardName: (port: string) => string;
}

export default function StatusBar({
  currentLedState,
  getColorForEvent,
  isConnected,
  connectedPorts,
  serverPort,
  serverFallback,
  getBoardName,
}: Props) {
  const c = getColorForEvent(currentLedState);
  const rgb = `rgb(${c.r}, ${c.g}, ${c.b})`;
  const glow = `0 0 12px rgba(${c.r}, ${c.g}, ${c.b}, 0.6)`;
  const animClass =
    currentLedState === "error"
      ? "led-anim-blink-fast"
      : currentLedState === "working"
        ? "led-anim-blink-slow"
        : currentLedState === "thinking"
          ? "led-anim-pulse"
          : "";

  return (
    <div className="status-bar">
      <div
        className={`led-preview ${animClass}`}
        style={{ background: rgb, boxShadow: glow }}
      />
      <div className="status-info">
        <div className="status-row">
          <div className={`status-dot ${isConnected ? "connected" : "disconnected"}`} />
          <span className="status-text">
            <span className="label">Arduino: </span>
            {isConnected
              ? connectedPorts.map((p) => getBoardName(p)).join(", ")
              : "Scanning..."}
          </span>
        </div>
        <div className="status-row">
          <div className={`status-dot ${serverPort ? "connected" : "disconnected"}`} />
          <span className="status-text">
            <span className="label">Server: </span>
            {serverPort
              ? `:${serverPort}${serverFallback ? " (fallback)" : ""}`
              : "Not running"}
          </span>
        </div>
      </div>
    </div>
  );
}
