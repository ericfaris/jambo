import { useCallback, useEffect, useState } from 'react';

/** The fixed profile/settings button in GameScreen's top-right corner. */
export const CORNER_BUTTON = { top: 12, right: 16, size: 42, gap: 8 } as const;
/** The top panel's horizontal padding (plus its 1px border). */
const PANEL_CONTENT_INSET = 17;

/**
 * How far (px) the top panel's right-hand content must step in to clear the
 * fixed corner button: 0 when the panel ends left of it (wide screens), or
 * when the panel starts below it.
 */
export function cornerButtonInset(panel: { top: number; right: number }, viewportWidth: number): number {
  const buttonBottom = CORNER_BUTTON.top + CORNER_BUTTON.size;
  if (panel.top >= buttonBottom) return 0;
  const buttonLeft = viewportWidth - CORNER_BUTTON.right - CORNER_BUTTON.size - CORNER_BUTTON.gap;
  const contentRight = panel.right - PANEL_CONTENT_INSET;
  return Math.max(0, Math.ceil(contentRight - buttonLeft));
}

/**
 * Measures the top panel and returns the inset both player blocks share, so
 * the opponent's block clears the corner button and the player's block below
 * stays lined up with it.
 */
export function useCornerButtonInset<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [inset, setInset] = useState(0);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setInset(cornerButtonInset(rect, window.innerWidth));
    };
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [node]);

  return [ref, inset] as const;
}
