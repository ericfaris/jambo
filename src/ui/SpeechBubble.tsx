import { useEffect } from 'react';

interface SpeechBubbleProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  /** Phone: a small pill on the opponent strip instead of the 240px bubble art. */
  compact?: boolean;
}

/** Long enough to read: short asides go quickly, a full sentence stays. */
export function speechBubbleMs(message: string): number {
  return Math.min(4500, Math.max(1800, 1200 + message.length * 55));
}

export function SpeechBubble({ message, visible, onHide, compact = false }: SpeechBubbleProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, speechBubbleMs(message));
      return () => clearTimeout(timer);
    }
  }, [visible, onHide, message]);

  if (!visible || !message) return null;

  if (compact) {
    return (
      <div role="status" aria-live="polite" className="speech-pill">
        {message}
      </div>
    );
  }

  return (
    // Anchored beside the opponent's avatar (SeatInfo places it), its tail
    // pointing at their face; clear of the gold, inside their panel so it
    // never covers End Turn on the centre row.
    <div role="status" aria-live="polite" className="speech-bubble" key={message} style={{ pointerEvents: 'none' }}>
      {message}
    </div>
  );
}
