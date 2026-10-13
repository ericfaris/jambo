// Cloudflare Turnstile challenge. Renders nothing when the server has no site
// key (dev), in which case the server skips the check too.

import { useEffect, useRef } from 'react';
import { getTurnstileSiteKey } from '../../config/runtimeConfig.ts';

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token, or '' when it expires or errors. */
  onToken: (token: string) => void;
  /** Bump to get a new token after a submit spends the old one. */
  resetKey?: number;
}

export function TurnstileWidget({ onToken, resetKey = 0 }: TurnstileWidgetProps) {
  const siteKey = getTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const element = containerRef.current;
    void loadTurnstile().then((turnstile) => {
      if (cancelled) return;
      widgetIdRef.current = turnstile.render(element, {
        sitekey: siteKey,
        theme: 'dark',
        appearance: 'interaction-only',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      });
    }).catch(() => onTokenRef.current(''));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      onTokenRef.current('');
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="auth-turnstile" />;
}

/** Whether a form must wait for a Turnstile token before it can submit. */
export function isTurnstileRequired(): boolean {
  return getTurnstileSiteKey() !== null;
}
