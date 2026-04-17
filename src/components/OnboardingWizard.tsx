import { useState } from "react";

interface Props {
  serverPort: number | null;
  hooksInstalled: boolean;
  connectedPorts: string[];
  availablePorts: string[];
  onInstallHooks: () => void;
  onConnectPort: (port: string) => void;
  onTestLed: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

type Step = 0 | 1 | 2 | 3;

export default function OnboardingWizard({
  serverPort,
  hooksInstalled,
  connectedPorts,
  availablePorts,
  onInstallHooks,
  onConnectPort,
  onTestLed,
  onFinish,
  onSkip,
}: Props) {
  const [step, setStep] = useState<Step>(0);
  const [selectedPort, setSelectedPort] = useState(availablePorts[0] ?? "");
  const isConnected = connectedPorts.length > 0;

  const next = () => setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  const back = () => setStep((s) => (s > 0 ? ((s - 1) as Step) : s));

  return (
    <div className="modal-backdrop">
      <div className="modal wizard">
        <div className="wizard-header">
          <h3 className="modal-title">Welcome to LumiCode</h3>
          <button
            className="btn-icon"
            onClick={onSkip}
            title="Skip setup — you can re-run it from the About page"
          >
            ×
          </button>
        </div>

        <div className="wizard-progress">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`wizard-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-step">
            <p className="modal-body">
              LumiCode turns Claude Code's lifecycle events into an ambient
              light on an Arduino-powered LED. Let's get it set up in about a
              minute.
            </p>
            <ul className="wizard-list">
              <li>Verify the local HTTP server is running</li>
              <li>Install Claude Code hooks</li>
              <li>Connect your Arduino (optional)</li>
              <li>Send a test event</li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-step">
            <h4 className="wizard-step-title">1. HTTP server</h4>
            <p className="modal-body">
              LumiCode runs a small HTTP server locally so Claude Code hooks
              can reach it.
            </p>
            <div className="wizard-status-row">
              {serverPort ? (
                <>
                  <span className="wizard-ok">●</span>
                  <span>Listening on port {serverPort}</span>
                </>
              ) : (
                <>
                  <span className="wizard-warn">●</span>
                  <span>Server not running yet — check Settings → General</span>
                </>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h4 className="wizard-step-title">2. Claude Code hooks</h4>
            <p className="modal-body">
              LumiCode writes four hook entries (thinking / working / done /
              done) into <code>~/.claude/settings.json</code>. A backup is made
              first.
            </p>
            <div className="wizard-status-row">
              {hooksInstalled ? (
                <>
                  <span className="wizard-ok">●</span>
                  <span>Hooks installed</span>
                </>
              ) : (
                <>
                  <span className="wizard-warn">●</span>
                  <span>Not installed yet</span>
                </>
              )}
            </div>
            {!hooksInstalled && (
              <button className="btn btn-sm primary" onClick={onInstallHooks}>
                Install hooks
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <h4 className="wizard-step-title">3. Arduino &amp; test</h4>
            <p className="modal-body">
              Optional. Plug in your Arduino, pick a port, and send a test
              "done" event to confirm the LED lights up. You can skip this and
              do it later from the Home tab.
            </p>
            {!isConnected && availablePorts.length > 0 && (
              <div className="wizard-port-row">
                <select
                  className="settings-select"
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                >
                  {availablePorts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-sm"
                  onClick={() => selectedPort && onConnectPort(selectedPort)}
                >
                  Connect
                </button>
              </div>
            )}
            {isConnected && (
              <>
                <div className="wizard-status-row">
                  <span className="wizard-ok">●</span>
                  <span>Connected: {connectedPorts.join(", ")}</span>
                </div>
                <button className="btn btn-sm primary" onClick={onTestLed}>
                  Send test event
                </button>
              </>
            )}
            {!isConnected && availablePorts.length === 0 && (
              <p className="modal-body">
                No serial ports detected. Plug in an Arduino and click
                Refresh on the Home tab, or skip this step.
              </p>
            )}
          </div>
        )}

        <div className="modal-actions wizard-actions">
          <button className="btn btn-sm" onClick={onSkip}>
            Skip setup
          </button>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button className="btn btn-sm" onClick={back}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button className="btn btn-sm primary" onClick={next}>
              Next
            </button>
          ) : (
            <button className="btn btn-sm primary" onClick={onFinish}>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
