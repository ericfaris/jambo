import { describe, it, expect } from 'vitest';
import { onlineLabels, rematchStatusLine, revealedGameKey, friendServerError } from '../../src/ui/onlineScreenLogic.ts';
import { friendlyPlayError } from '../../src/ui/uiHints.ts';

describe('onlineLabels', () => {
  it('puts You at your seat and the friend opposite', () => {
    expect(onlineLabels(0, 'Sam')).toEqual(['You', 'Sam']);
    expect(onlineLabels(1, 'Sam')).toEqual(['Sam', 'You']);
  });

  it('tells apart a friend literally named "You"', () => {
    expect(onlineLabels(0, 'you')).toEqual(['You', 'you (friend)']);
  });
});

describe('rematchStatusLine', () => {
  const base = { slot: 0 as const, name: 'Sam', friendLeft: false };
  it('is empty before anyone votes and once both have', () => {
    expect(rematchStatusLine({ ...base, votes: [] })).toBeNull();
    expect(rematchStatusLine({ ...base, votes: [0, 1] })).toBeNull();
  });
  it('says who is still to answer', () => {
    expect(rematchStatusLine({ ...base, votes: [0] })).toBe('Waiting for Sam…');
    expect(rematchStatusLine({ ...base, votes: [1] })).toBe('Sam wants a rematch');
    expect(rematchStatusLine({ ...base, slot: 1, votes: [1] })).toBe('Waiting for Sam…');
  });
  it('explains a missing rematch when the friend left', () => {
    expect(rematchStatusLine({ ...base, votes: [0], friendLeft: true })).toBe('Sam left the table');
  });
});

describe('revealedGameKey', () => {
  it('is per room', () => {
    expect(revealedGameKey('4821')).toBe('jambo:revealed:4821');
  });
});

describe('friendServerError', () => {
  it('names the friend on a turn race', () => {
    expect(friendServerError('Not your turn', 'Sam', friendlyPlayError)).toBe("It's Sam's move.");
  });
  it('stays quiet about room lifecycle noise', () => {
    for (const m of ['Room not found', 'Not in an active game', 'Rematch is only available after the game ends']) {
      expect(friendServerError(m, 'Sam', friendlyPlayError)).toBeNull();
    }
  });
  it('strips the engine prefix before the friendly mapping', () => {
    const seen: string[] = [];
    friendServerError('Invalid action PLAY_CARD: Not enough gold', 'Sam', (r) => { seen.push(r); return r; });
    expect(seen).toEqual(['Not enough gold']);
  });
  it('turns a malformed message into a retry hint', () => {
    expect(friendServerError('Invalid message', 'Sam', friendlyPlayError)).toMatch(/try again/);
  });
});
