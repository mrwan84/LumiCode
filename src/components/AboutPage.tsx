import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateCheckResult } from "../types";

interface Props {
  onReplayOnboarding?: () => void;
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: UpdateCheckResult }
  | { status: "error"; error: string };

export default function AboutPage({ onReplayOnboarding }: Props) {
  const [version, setVersion] = useState<string>("");
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    invoke<string>("get_version")
      .then(setVersion)
      .catch(() => {});
  }, []);

  const checkUpdates = async () => {
    setUpdate({ status: "checking" });
    try {
      const result = await invoke<UpdateCheckResult>("check_for_updates");
      setUpdate({ status: "done", result });
    } catch (e) {
      setUpdate({ status: "error", error: String(e) });
    }
  };

  return (
    <div className="about-page">
      <div className="about-icon">
        <div className="about-ring">
          <div className="about-dot" />
        </div>
      </div>
      <h2 className="about-title">LumiCode</h2>
      <p className="about-desc">Claude Code RGB Notifier</p>
      <div className="about-divider" />
      <div className="about-info">
        <div className="about-row">
          <span className="about-label">Author</span>
          <span className="about-value">M.Alsouki</span>
        </div>
        <div className="about-row">
          <span className="about-label">Version</span>
          <span className="about-value">{version || "..."}</span>
        </div>
        <div className="about-row">
          <span className="about-label">License</span>
          <span className="about-value">MIT</span>
        </div>
      </div>

      <div className="about-updates">
        <button
          className="btn btn-sm"
          onClick={checkUpdates}
          disabled={update.status === "checking"}
        >
          {update.status === "checking" ? "Checking..." : "Check for updates"}
        </button>
        {update.status === "done" && (
          <div
            className={
              update.result.update_available
                ? "about-update-msg about-update-new"
                : "about-update-msg"
            }
          >
            <span>{update.result.message}</span>
            {update.result.update_available && update.result.release_url && (
              <a
                href={update.result.release_url}
                target="_blank"
                rel="noreferrer"
                className="about-update-link"
              >
                Open release ↗
              </a>
            )}
          </div>
        )}
        {update.status === "error" && (
          <div className="about-update-msg about-update-err">
            {update.error}
          </div>
        )}
      </div>

      {onReplayOnboarding && (
        <button
          className="btn btn-sm about-replay"
          onClick={onReplayOnboarding}
        >
          Run setup again
        </button>
      )}
    </div>
  );
}
