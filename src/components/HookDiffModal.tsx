import type { HookDiff } from "../types";

interface Props {
  diff: HookDiff;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function HookDiffModal({ diff, onConfirm, onCancel }: Props) {
  const hasChanges =
    diff.added.length > 0 || diff.removed.length > 0;
  const title =
    diff.action === "install" ? "Install hooks?" : "Uninstall hooks?";

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-body">
          {diff.settings_exists
            ? "This will update ~/.claude/settings.json. A timestamped backup will be created first."
            : "~/.claude/settings.json will be created."}
        </p>

        <div className="diff-section">
          {diff.added.length > 0 && (
            <div className="diff-group">
              <span className="diff-label diff-added">+ Add</span>
              <ul className="diff-list">
                {diff.added.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {diff.removed.length > 0 && (
            <div className="diff-group">
              <span className="diff-label diff-removed">− Remove</span>
              <ul className="diff-list">
                {diff.removed.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {diff.kept.length > 0 && (
            <div className="diff-group">
              <span className="diff-label diff-kept">~ Replace</span>
              <ul className="diff-list">
                {diff.kept.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {!hasChanges && diff.kept.length === 0 && (
            <p className="modal-body">No changes needed.</p>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-sm primary"
            onClick={onConfirm}
            disabled={!hasChanges && diff.kept.length === 0}
          >
            {diff.action === "install" ? "Install" : "Uninstall"}
          </button>
        </div>
      </div>
    </div>
  );
}
