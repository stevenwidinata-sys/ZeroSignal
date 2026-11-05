import { useEffect, useRef, useState } from "react";
import type { TutorialStep } from "../platform/types";

interface Props {
  title: string;
  steps: TutorialStep[];
  open: boolean;
  onClose: () => void;
}

/** Short step-by-step "how to play" (native <dialog>: Esc closes, focus is trapped). */
export default function TutorialDialog({ title, steps, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setI(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <dialog
      ref={ref}
      className="settings-dialog tutorial-dialog"
      aria-labelledby="tutorial-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {step && (
        <div className="settings-body">
          <div className="settings-head">
            <h2 id="tutorial-title">How to play {title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close tutorial">
              ✕
            </button>
          </div>
          <div className="tutorial-step" aria-live="polite">
            <span className="tutorial-icon" aria-hidden="true">
              {step.icon}
            </span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
          <ol className="tutorial-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((s, k) => (
              <li key={s.title} className={k === i ? "on" : ""} />
            ))}
          </ol>
          <div className="settings-foot">
            {i > 0 ? (
              <button className="btn-ghost btn-sm" onClick={() => setI(i - 1)}>
                ← Back
              </button>
            ) : (
              <button className="btn-ghost btn-sm" onClick={onClose}>
                Skip
              </button>
            )}
            <button className="btn-green btn-sm" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? "Let's play!" : "Next →"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
