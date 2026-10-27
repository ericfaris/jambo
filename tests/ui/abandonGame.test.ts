import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ConfirmButton } from '../../src/ui/ConfirmButton.tsx';
import { MainMenu } from '../../src/ui/screens/MainMenu.tsx';
import { saveLocalGame, loadLocalGame, clearLocalGame } from '../../src/persistence/savedGame.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { AuthSession } from '../../src/ui/useAuthSession.ts';

const auth = { authUser: null, avatarUrl: null, avatarLabel: 'U', isLoading: false, authError: null, logout: async () => {}, refresh: async () => {} } as unknown as AuthSession;

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('abandoning a game', () => {
  it('the button asks before it acts: at rest it is a single button, no "yes" yet', () => {
    const html = renderToStaticMarkup(createElement(ConfirmButton, { label: 'Abandon Game', question: 'Abandon this game?', confirmLabel: 'Abandon', onConfirm: () => {} }));
    expect(html).toContain('Abandon Game');
    expect(html).not.toContain('confirm-ask-yes');
    expect(html).not.toContain('Abandon this game?');
  });

  it('the main menu offers to abandon a saved game only when there is one to resume', () => {
    const withSave = renderToStaticMarkup(createElement(MainMenu, { onSelectOption: () => {}, onPlayTrader: () => {}, onJoinTv: () => {}, auth, resumeLabel: 'vs Baraka (Hard) · turn 12', onResume: () => {}, onAbandon: () => {} }));
    expect(withSave).toContain('Resume game');
    expect(withSave).toContain('Abandon saved game');
    const none = renderToStaticMarkup(createElement(MainMenu, { onSelectOption: () => {}, onPlayTrader: () => {}, onJoinTv: () => {}, auth, resumeLabel: null, onResume: () => {}, onAbandon: () => {} }));
    expect(none).not.toContain('Abandon saved game');
  });

  it('abandoning deletes the save, so nothing is left to resume', () => {
    const storage = memoryStorage();
    saveLocalGame({ mode: 'solo', aiDifficulty: 'hard', state: createTestState(), replayActions: [], taggedActions: [], startingPlayer: 0 }, storage);
    expect(loadLocalGame(storage)).not.toBeNull();
    clearLocalGame(storage);
    expect(loadLocalGame(storage)).toBeNull();
  });
});
