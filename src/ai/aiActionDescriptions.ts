import type { GameAction, GameState } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';

export function getAiActionDescription(action: GameAction, state: GameState): string {
  switch (action.type) {
    case 'DRAW_CARD':
      return "Let me draw a card to see what I get!";

    case 'KEEP_CARD':
      return "This card looks useful, I'll keep it.";

    case 'DISCARD_DRAWN':
      return "Not what I need right now, discarding it.";

    case 'SKIP_DRAW':
      return "I'll hold off on drawing this turn.";

    case 'PLAY_CARD': {
      const card = getCard(action.cardId);
      if (card.type === 'ware') {
        const mode = action.wareMode === 'buy' ? 'buy' : 'sell';
        return `I'll ${mode} some ${card.name} wares.`;
      } else {
        return `Playing my ${card.name} card.`;
      }
    }

    case 'ACTIVATE_UTILITY': {
      const player = state.players[state.currentPlayer];
      const utility = player.utilities[action.utilityIndex];
      if (utility) {
        return `Activating my ${utility.designId.replace(/_/g, ' ')}.`;
      }
      return "Activating a utility.";
    }

    case 'END_TURN':
      return "My turn is done, your move!";

    case 'RESOLVE_INTERACTION':
      return "Making my choice...";

    case 'GUARD_REACTION':
      return action.play ? "Playing Guard to block that!" : "Not playing Guard this time.";

    case 'WARE_CARD_REACTION':
      return action.play ? "I'll take that ware card!" : "I'll pass on that ware card.";

    default:
      return "Making a move...";
  }
}