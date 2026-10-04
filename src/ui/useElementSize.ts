import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks an element's content-box size via ResizeObserver (0×0 until measured).
 *
 * Returns a *callback* ref: observation (re)attaches whenever the element
 * mounts or changes. A plain useRef + mount-only effect misses elements that
 * appear later — e.g. GameScreen first renders the tutorial or the hotseat
 * pass-device screen, so the board didn't exist yet and stayed 0×0 forever.
 */
export function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const update = () => {
      const next = { width: node.clientWidth, height: node.clientHeight };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, size] as const;
}
