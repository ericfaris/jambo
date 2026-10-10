import { useEffect, useState } from 'react';

/** Phone layout breakpoint for the solo/hotseat GameScreen (see DESIGN.md › Layout). */
export const PHONE_MEDIA_QUERY = '(max-width: 640px)';
/** Desktop/laptop screens too short for full-size cards (e.g. 1366×768). */
export const SHORT_DESKTOP_MEDIA_QUERY = '(min-width: 641px) and (max-height: 860px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
