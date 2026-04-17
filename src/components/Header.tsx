import type { ThemePref } from "../types";

interface Props {
  themePref: ThemePref;
  cycleTheme: () => void;
}

export default function Header({ themePref, cycleTheme }: Props) {
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
      <span className="version">v1.5.1</span>
      <div className="header-spacer" />
      <button className="theme-toggle" onClick={cycleTheme} title={tooltip}>
        {icon}
      </button>
    </div>
  );
}
