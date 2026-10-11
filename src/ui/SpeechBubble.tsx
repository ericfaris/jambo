import { useEffect } from 'react';

interface SpeechBubbleProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  /** Phone: a small pill on the opponent strip instead of the 240px bubble art. */
  compact?: boolean;
  /** Desktop: distance from the panel's right edge (clears a portrait). */
  right?: string;
}

/** Long enough to read: short asides go quickly, a full sentence stays. */
export function speechBubbleMs(message: string): number {
  return Math.min(4500, Math.max(1800, 1200 + message.length * 55));
}

export function SpeechBubble({ message, visible, onHide, compact = false, right = 'clamp(200px, 22vw, 260px)' }: SpeechBubbleProps) {
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
    // Left of the opponent's name/gold block (and inside their panel, so it
    // never covers End Turn on the centre row); the tail points at the name.
    <div role="status" aria-live="polite" className="speech-bubble" key={message} style={{
      top: 26,
      right,
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  );
}
