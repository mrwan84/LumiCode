import type { ColorConfig } from "./types";

export const DEFAULT_COLORS: Record<string, ColorConfig> = {
  working: { r: 0, g: 255, b: 238 },
  done: { r: 0, g: 180, b: 0 },
  error: { r: 255, g: 0, b: 0 },
  idle: { r: 30, g: 80, b: 220 },
  thinking: { r: 255, g: 0, b: 180 },
};

export const ALL_EVENTS = ["working", "done", "error", "idle", "thinking"];

export const EVENT_LABELS: Record<string, string> = {
  working: "W",
  done: "D",
  error: "E",
  idle: "I",
  thinking: "T",
};

export const LED_BUTTONS = [
  { command: "working", label: "Working" },
  { command: "done", label: "Done" },
  { command: "error", label: "Error" },
  { command: "idle", label: "Idle" },
  { command: "thinking", label: "Thinking" },
];
