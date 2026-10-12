// ============================================================================
// Card tilt: the card leans toward the pointer (or a dragging finger), a soft
// glare follows it, and the picture shifts behind the frame like a window.
// Written as CSS variables on the element, so nothing re-renders while moving.
// ============================================================================

import { useCallback, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface TiltPose {
  /** rotateX / rotateY in degrees */
  rx: number;
  ry: number;
  /** Glare centre, in % of the card */
  gx: number;
  gy: number;
  /** Picture shift behind the frame, as a fraction (−1…1) of the depth budget */
  px: number;
  py: number;
}

export const FLAT_POSE: TiltPose = { rx: 0, ry: 0, gx: 50, gy: 50, px: 0, py: 0 };

/**
 * Pose for a pointer at (x, y), each 0…1 across the card. The top edge tips
 * toward a pointer above centre, as if the card were pressed under it.
 */
export function tiltFromPointer(x: number, y: number, maxDeg: number): TiltPose {
  const cx = Math.min(1, Math.max(0, x)) - 0.5;
  const cy = Math.min(1, Math.max(0, y)) - 0.5;
  // rounded, and never -0 (so a centred pointer reads as exactly flat)
  const r = (v: number, digits: number) => +v.toFixed(digits) + 0;
  return {
    rx: r(-cy * 2 * maxDeg, 2),
    ry: r(cx * 2 * maxDeg, 2),
    gx: r(cx * 100 + 50, 1),
    gy: r(cy * 100 + 50, 1),
    px: r(-cx * 2, 3),
    py: r(-cy * 2, 3),
  };
}

export function applyPose(el: HTMLElement, pose: TiltPose, active: boolean): void {
  el.style.setProperty('--rx', `${pose.rx}deg`);
  el.style.setProperty('--ry', `${pose.ry}deg`);
  el.style.setProperty('--gx', `${pose.gx}%`);
  el.style.setProperty('--gy', `${pose.gy}%`);
  el.style.setProperty('--px', String(pose.px));
  el.style.setProperty('--py', String(pose.py));
  el.classList.toggle('card-tilt-active', active);
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Pointer handlers that tilt the element they're attached to. `touch` also
 * follows a dragging finger (the zoomed card); otherwise only a mouse or pen
 * tilts it (hand cards, where a tap means "play").
 */
export function useCardTilt({ maxDeg, touch = false }: { maxDeg: number; touch?: boolean }) {
  const frame = useRef<number | null>(null);

  const move = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' && !touch) return;
    if (reducedMotion()) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const pose = tiltFromPointer((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, maxDeg);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      applyPose(el, pose, true);
    });
  }, [maxDeg, touch]);

  const leave = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    applyPose(e.currentTarget, FLAT_POSE, false);
  }, []);

  return useMemo(() => ({
    onPointerMove: move,
    onPointerDown: move,
    onPointerLeave: leave,
    onPointerCancel: leave,
    // a lifted finger lets the card settle back
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => { if (e.pointerType === 'touch') leave(e); },
  }), [move, leave]);
}
