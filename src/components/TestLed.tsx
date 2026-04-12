import type { ColorConfig } from "../types";
import { LED_BUTTONS } from "../constants";

interface Props {
  getColorForEvent: (event: string) => ColorConfig;
  sendCommand: (command: string) => void;
}

export default function TestLed({ getColorForEvent, sendCommand }: Props) {
  return (
    <div className="section">
      <div className="section-title">Test LED</div>
      <div className="led-grid">
        {LED_BUTTONS.map((btn) => {
          const c = getColorForEvent(btn.command);
          return (
            <button
              key={btn.command}
              className="led-btn"
              onClick={() => sendCommand(btn.command)}
            >
              <div
                className="dot"
                style={{
                  background: `rgb(${c.r}, ${c.g}, ${c.b})`,
                  boxShadow: `0 0 10px rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`,
                }}
              />
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
