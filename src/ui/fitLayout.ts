// ============================================================================
// Fit-to-box card layout — sizes a set of cards so every one of them is fully
// on screen inside a fixed box (no scrolling). Used by the phone PlayerScreen,
// where the hand/utilities must render inside 100dvh.
// ============================================================================

/** Base CardFace art size at scale 1 (see CardFace.tsx). */
export const CARD_BASE_WIDTH = 140;
export const CARD_BASE_HEIGHT = 187;

export interface FitOptions {
  count: number;
  /** Available box, px. */
  width: number;
  height: number;
  maxRows?: number;
  rowGap?: number;
  /** Gap between cards when they don't need to overlap. */
  gap?: number;
  /** Max fraction of a card's width hidden under its right neighbour. */
  maxOverlapRatio?: number;
  /** Largest scale we'll render at (keeps small hands from going huge). */
  maxScale?: number;
  /** Smallest scale; below this we accept overflow rather than illegible cards. */
  minScale?: number;
}

export interface FitResult {
  rows: number;
  perRow: number;
  scale: number;
  cardWidth: number;
  cardHeight: number;
  /** Positive = overlap between neighbours (negative margin); 0 = use `gap`. */
  overlapPx: number;
  gap: number;
}

export function fitCardsToBox({
  count,
  width,
  height,
  maxRows = 3,
  rowGap = 8,
  gap = 8,
  maxOverlapRatio = 0.55,
  maxScale = 1.4,
  minScale = 0.3,
}: FitOptions): FitResult {
  const aspect = CARD_BASE_WIDTH / CARD_BASE_HEIGHT;
  const empty: FitResult = {
    rows: 1, perRow: 0, scale: maxScale,
    cardWidth: Math.round(CARD_BASE_WIDTH * maxScale), cardHeight: Math.round(CARD_BASE_HEIGHT * maxScale),
    overlapPx: 0, gap,
  };
  if (count <= 0 || width <= 0 || height <= 0) return empty;

  let best: FitResult | null = null;
  let bestScore = -1;
  const rowLimit = Math.max(1, Math.min(maxRows, count));
  for (let rows = 1; rows <= rowLimit; rows++) {
    const perRow = Math.ceil(count / rows);
    // Height-bound card width
    const hBound = ((height - (rows - 1) * rowGap) / rows) * aspect;
    // Width-bound: cards side by side with `gap`, or overlapped up to the cap
    const spacedBound = (width - (perRow - 1) * gap) / perRow;
    const overlapBound = perRow > 1 ? width / (1 + (perRow - 1) * (1 - maxOverlapRatio)) : width;
    const wBound = Math.max(spacedBound, overlapBound);
    const cardW = Math.min(hBound, wBound, CARD_BASE_WIDTH * maxScale);
    if (cardW <= 0) continue;
    const w = Math.floor(cardW);
    const fitsSpaced = perRow <= 1 || perRow * w + (perRow - 1) * gap <= width;
    // Doesn't fit with the full gap: tighten the gap first, overlap only if
    // the cards don't fit edge to edge.
    const overlapPx = fitsSpaced ? 0 : Math.max(0, Math.ceil((perRow * w - width) / (perRow - 1)));
    const rowGapPx = fitsSpaced ? gap : overlapPx > 0 ? 0 : Math.floor((width - perRow * w) / (perRow - 1));
    // Score by the visible (un-overlapped) area of a card, so a big-but-buried
    // layout loses to a slightly smaller one where every card's art shows.
    const score = (w - overlapPx) * w;
    if (!best || score > bestScore) {
      bestScore = score;
      best = {
        rows,
        perRow,
        scale: w / CARD_BASE_WIDTH,
        cardWidth: w,
        cardHeight: Math.round(w / aspect),
        overlapPx,
        gap: rowGapPx,
      };
    }
  }
  if (!best) return empty;
  if (best.scale < minScale) {
    // Below the legibility floor: hold the card size and stack/overlap harder
    // (past maxOverlapRatio) rather than overflow the box.
    const w = Math.round(CARD_BASE_WIDTH * minScale);
    const h = Math.round(w / aspect);
    const rows = Math.max(1, Math.min(count, Math.floor((height + rowGap) / (h + rowGap))));
    const perRow = Math.ceil(count / rows);
    const overlapPx = perRow > 1 ? Math.max(0, Math.ceil((perRow * w - width) / (perRow - 1))) : 0;
    return { rows, perRow, scale: minScale, cardWidth: w, cardHeight: h, overlapPx, gap: overlapPx > 0 ? 0 : gap };
  }
  return best;
}

/** Split items into `rows` row-major chunks, as evenly as possible (earlier rows get the extra). */
export function splitIntoRows<T>(items: T[], rows: number): T[][] {
  const n = Math.max(1, rows);
  const perRow = Math.ceil(items.length / n);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) out.push(items.slice(i, i + perRow));
  return out;
}

/**
 * Market slots on a phone: one row while slots stay ≥ `minSlot`, else wrap to
 * two (or more) rows. A market can reach 21 slots (6 + 5 stands × 3).
 */
export function fitMarketSlots(count: number, width: number, { gap = 4, maxSlot = 32, minSlot = 24 } = {}): { columns: number; rows: number; slotSize: number } {
  if (count <= 0 || width <= 0) return { columns: Math.max(count, 1), rows: 1, slotSize: maxSlot };
  for (let rows = 1; rows <= 4; rows++) {
    const columns = Math.ceil(count / rows);
    const size = Math.floor((width - (columns - 1) * gap) / columns);
    if (size >= minSlot || rows === 4) {
      return { columns, rows, slotSize: Math.max(12, Math.min(maxSlot, size)) };
    }
  }
  return { columns: count, rows: 1, slotSize: minSlot };
}
