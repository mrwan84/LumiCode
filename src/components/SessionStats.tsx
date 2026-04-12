import { useMemo } from "react";
import type { LogEntry } from "../types";

interface Props {
  logs: LogEntry[];
}

export default function SessionStats({ logs }: Props) {
  const stats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString();
    const todayLogs = logs.filter((l) => {
      if (l.timestamp) {
        return new Date(l.timestamp).toLocaleDateString() === todayStr;
      }
      return true;
    });

    const tasksToday = todayLogs.filter((l) => l.event === "done").length;
    const errorsToday = todayLogs.filter((l) => l.event === "error").length;

    let totalDuration = 0;
    let durationCount = 0;
    let lastThinkingTime: number | null = null;
    for (const l of todayLogs) {
      if (l.event === "thinking" && l.timestamp) {
        lastThinkingTime = new Date(l.timestamp).getTime();
      } else if (l.event === "done" && lastThinkingTime && l.timestamp) {
        const duration = new Date(l.timestamp).getTime() - lastThinkingTime;
        if (duration > 0 && duration < 3600000) {
          totalDuration += duration;
          durationCount++;
        }
        lastThinkingTime = null;
      }
    }
    const avgMs = durationCount > 0 ? totalDuration / durationCount : 0;
    const avgMin = Math.floor(avgMs / 60000);
    const avgSec = Math.floor((avgMs % 60000) / 1000);
    const avgStr =
      durationCount > 0
        ? avgMin > 0
          ? `${avgMin}m ${avgSec}s`
          : `${avgSec}s`
        : "\u2014";

    return { tasksToday, errorsToday, avgStr };
  }, [logs]);

  return (
    <div className="stats-bar">
      <div className="stat-card">
        <span className="stat-value">{stats.tasksToday}</span>
        <span className="stat-label">Tasks</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{stats.errorsToday}</span>
        <span className="stat-label">Errors</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{stats.avgStr}</span>
        <span className="stat-label">Avg</span>
      </div>
    </div>
  );
}
