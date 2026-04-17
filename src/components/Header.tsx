import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ThemePref } from "../types";

interface Props {
  themePref: ThemePref;
  cycleTheme: () => void;
}

export default function Header({ themePref, cycleTheme }: Props) {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    invoke<string>("get_version")
      .then(setVersion)
      .catch(() => {});
  }, []);

  const icon = themePref === "system" ? "◐" : themePref === "dark" ? "🌙" : "☀️";
  const tooltip =
    themePref === "system"
      ? "Theme: System"
      : themePref === "dark"
        ? "Theme: Dark"
        : "Theme: Light";

  return (
    <div className="header">
      <h1>LumiCode</h1>
      {version && <span className="version">v{version}</span>}
      <div className="header-spacer" />
      <button className="theme-toggle" onClick={cycleTheme} title={tooltip}>
        {icon}
      </button>
    </div>
  );
}
