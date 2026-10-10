import { useEffect } from 'react';

interface SpeechBubbleProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  /** Phone: a small pill on the opponent strip instead of the 240px bubble art. */
  compact?: boolean;
}

export function SpeechBubble({ message, visible, onHide, compact = false }: SpeechBubbleProps) {
  useEffect(() => {
    if (visible) {
      const isTurnDone = message === "My turn is done, your move!";
      const timeout = isTurnDone ? 2000 : 4000; // Faster fade for turn done message
      const timer = setTimeout(onHide, timeout);
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
      right: 'clamp(200px, 22vw, 260px)',
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  );
}
