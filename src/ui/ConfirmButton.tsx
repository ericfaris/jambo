import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * A button for something that can't be undone: the first press asks, in
 * place, and only the second (on "Yes") acts.
 */
export function ConfirmButton({ label, question, confirmLabel, cancelLabel = 'Cancel', onConfirm, className, style }: {
  label: ReactNode;
  /** Shown once pressed, e.g. "Abandon this game? It can't be resumed." */
  question: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" className={className} style={style} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="confirm-ask" role="group" aria-label="Confirm">
      <div className="confirm-ask-question">{question}</div>
      <div className="confirm-ask-actions">
        <button ref={confirmRef} type="button" className="confirm-ask-yes" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="confirm-ask-no" onClick={() => setAsking(false)}>{cancelLabel}</button>
      </div>
    </div>
  );
}
