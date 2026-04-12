import type { AppConfig } from "../types";

interface Props {
  connectedPorts: string[];
  availablePorts: string[];
  selectedPort: string;
  setSelectedPort: (port: string) => void;
  connectPort: () => void;
  disconnectPort: (port?: string) => void;
  refreshPorts: () => void;
  config: AppConfig;
  updateBoardName: (port: string, name: string) => void;
  updateConfig: (partial: Partial<AppConfig>) => void;
  cleanStaleBoardNames: () => void;
}

export default function SerialPorts({
  connectedPorts,
  availablePorts,
  selectedPort,
  setSelectedPort,
  connectPort,
  disconnectPort,
  refreshPorts,
  config,
  updateBoardName,
  updateConfig,
  cleanStaleBoardNames,
}: Props) {
  const hasBoardNames = Object.keys(config.board_names).length > 0;
  return (
    <div className="section">
      <div className="section-title">Serial Ports</div>
      {connectedPorts.map((port) => (
        <div key={port} className="port-connected">
          <div className="status-dot connected" />
          <input
            className="board-name-input"
            value={config.board_names[port] || ""}
            placeholder={port}
            onChange={(e) => updateBoardName(port, e.target.value)}
            onBlur={(e) => {
              if (!e.target.value.trim()) {
                const names = { ...config.board_names };
                delete names[port];
                updateConfig({ board_names: names });
              }
            }}
          />
          <span className="port-name-secondary">
            {config.board_names[port] ? port : ""}
          </span>
          <button className="btn btn-sm" onClick={() => disconnectPort(port)}>
            Disconnect
          </button>
        </div>
      ))}
      <div className="port-select">
        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
        >
          {availablePorts.length === 0 && (
            <option value="">No ports available</option>
          )}
          {availablePorts.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn" onClick={refreshPorts}>
          Refresh
        </button>
        <button
          className="btn primary"
          onClick={connectPort}
          disabled={!selectedPort || connectedPorts.includes(selectedPort)}
        >
          Connect
        </button>
        {hasBoardNames && (
          <button
            className="btn btn-sm"
            onClick={cleanStaleBoardNames}
            title="Remove names for ports no longer detected"
          >
            Clean Names
          </button>
        )}
      </div>
    </div>
  );
}
