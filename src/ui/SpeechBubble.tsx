import { useEffect } from 'react';

interface SpeechBubbleProps {
  message: string;
  visible: boolean;
  onHide: () => void;
}

export function SpeechBubble({ message, visible, onHide }: SpeechBubbleProps) {
  useEffect(() => {
    if (visible) {
      const isTurnDone = message === "My turn is done, your move!";
      const timeout = isTurnDone ? 2000 : 4000; // Faster fade for turn done message
      const timer = setTimeout(onHide, timeout);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide, message]);

  if (!visible || !message) return null;

  return (
    <div role="status" aria-live="polite" style={{
      position: 'absolute',
      top: 60,
      // Sit left of the opponent's gold / card-count block (bottom-right of the panel)
      right: 'clamp(160px, 22vw, 260px)',
      zIndex: 2000,
      pointerEvents: 'none',
      animation: 'speechBubbleFadeIn 0.3s ease-out',
    }}>
      <img
        src="/assets/bubble/speech_bubble.png"
        alt=""
        style={{
          width: 240,
          height: 'auto',
          maxWidth: 240,
          display: 'block',
        }}
        draggable={false}
      />
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, calc(-50% + 25px))',
        color: 'black',
        fontSize: 17,
        fontWeight: 600,
        textAlign: 'center',
        maxWidth: 200,
        lineHeight: 1.4,
        textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
      }}>
        {message}
      </div>
      <style>{`
        @keyframes speechBubbleFadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}