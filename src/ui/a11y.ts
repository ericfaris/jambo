// ============================================================================
// Accessibility helpers for clickable non-button elements (cards, coins, slots)
// ============================================================================

import type { KeyboardEvent } from 'react';

/**
 * Props that make a clickable div/img behave like a button for keyboard and
 * screen-reader users: role, accessible name, focusability, Enter/Space.
 * Returns nothing when the element isn't interactive.
 */
export function buttonProps(onActivate: (() => void) | undefined, label: string) {
  if (!onActivate) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Nested controls (e.g. a card's zoom icon) must not also trigger the card
        e.stopPropagation();
        onActivate();
      }
    },
  };
}
