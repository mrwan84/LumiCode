import { useEffect, useRef, useMemo } from "react";
import type { LogEntry, ColorConfig } from "../types";

interface Props {
  logs: LogEntry[];
  setLogs: (logs: LogEntry[]) => void;
  getColorForEvent: (event: string) => ColorConfig;
  logFilter: string;
  setLogFilter: (filter: string) => void;
}

export default function EventLog({
  logs,
  setLogs,
  getColorForEvent,
  logFilter,
  setLogFilter,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(
    () =>
      logFilter === "all" ? logs : logs.filter((e) => e.event === logFilter),
    [logs, logFilter],
  );

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  return (
    <div className="log-section">
      <div className="log-header">
        <div className="section-title">Event Log</div>
        <div className="log-controls">
          <select
            className="settings-select log-filter"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="working">Working</option>
            <option value="done">Done</option>
            <option value="error">Error</option>
            <option value="idle">Idle</option>
            <option value="thinking">Thinking</option>
          </select>
          {logs.length > 0 && (
            <button className="btn btn-sm" onClick={() => setLogs([])}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="log" ref={logRef}>
        {filteredLogs.map((entry, i) => {
          const logColor = entry.event ? getColorForEvent(entry.event) : null;
          return (
            <div
              key={i}
              className="log-entry"
              style={
                logColor
                  ? { color: `rgb(${logColor.r}, ${logColor.g}, ${logColor.b})` }
                  : undefined
              }
            >
              <span className="time">{entry.time}</span>
              {entry.message}
            </div>
          );
        })}
        {filteredLogs.length === 0 && (
          <div className="log-entry">
            {logFilter === "all" ? "Waiting for events..." : `No ${logFilter} events`}
          </div>
        )}
      </div>
    </div>
  );
}
