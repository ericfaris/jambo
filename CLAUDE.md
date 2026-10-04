# Jambo2 — Claude Code Rules

Digital implementation of "Jambo" card game by Rudiger Dorn.

## Deployment

- Production URL: `https://jambo.mooseflip.com`
- Self-hosted on the local Docker lab (`docker compose up -d --build`), exposed
  publicly via a Cloudflare Tunnel. No longer on Railway. Container port `3001`
  is bound to `127.0.0.1:8500` on the host; the tunnel is the only public entry
  point. See `docker-compose.yml`.

## Commands

```bash
npm run dev          # Start dev server
npx tsc --noEmit     # Type-check (run after every change)
npx vite build       # Production build
npm test             # Run Vitest tests (when tests exist)
```

## Git Commits

When committing, only use `git status` to see changes — **do NOT run `git diff`**. It wastes too many tokens on this codebase.

## Tech Stack

- **React 19 + TypeScript**, Vite, Zustand 5, Zod 4, Tailwind CSS 4, Vitest 4
- **Pure TypeScript game engine** — zero UI dependencies, fully immutable
- **Seeded Mulberry32 PRNG** for deterministic shuffles (`src/utils/rng.ts`)

## TypeScript Conventions

- **`verbatimModuleSyntax`**: Always use `import type` for type-only imports
- **`.ts` extensions**: Use `.ts`/`.tsx` extensions on all local imports
- **No `any`**: Use proper types or `unknown` with narrowing
- **Discriminated unions**: `pendingResolution` uses `type` field for tagged unions

## Architecture

```
src/
  engine/                    # Pure game engine (no React/UI imports)
    types.ts                 # All types, constants, interfaces
    GameEngine.ts            # processAction() — main dispatch
    GameState.ts             # createInitialState()
    cards/
      CardDatabase.ts        # 110-card definitions, buildCardDatabase(), isDesign()
      CardResolver.ts        # initializeResolution() — creates PendingResolution
      resolvers/             # 21 resolver files, one per resolution type
    deck/DeckManager.ts      # drawFromDeck, discardCard, reshuffleDiscard
    market/
      MarketManager.ts       # addWareToMarket, removeWareFromMarket, getEmptySlots
      WareSupply.ts          # takeFromSupply, returnToSupply, hasSupply
    validation/
      actionValidator.ts     # validateAction(), validatePlayCard(), getValidActions()
      invariants.ts          # checkInvariants() — 110-card count, gold >= 0, etc.
    endgame/EndgameManager.ts
  ai/RandomAI.ts             # getRandomAiAction(), getRandomInteractionResponse()
  ui/                        # React components
    GameScreen.tsx            # Main layout
    InteractionPanel.tsx      # Resolution UI panels (one per PendingResolution type)
    CardFace.tsx, HandDisplay.tsx, MarketDisplay.tsx, etc.
  hooks/useGameStore.ts       # Zustand store
```

## Immutable State — Critical Rule

**Never mutate state.** Every function returns a new state object via spread operators.

```typescript
// CORRECT
const newPlayers: [PlayerState, PlayerState] = [
  player === 0 ? { ...state.players[0], ...updates } : state.players[0],
  player === 1 ? { ...state.players[1], ...updates } : state.players[1],
];
return { ...state, players: newPlayers };

// WRONG — do NOT do this
state.players[0].gold += 5;
```

## Card & Resolution System

### Card play flow
1. Player dispatches `PLAY_CARD` or `ACTIVATE_UTILITY`
2. `GameEngine.processAction()` calls `initializeResolution()` from `CardResolver.ts`
3. Returns a `PendingResolution` (tagged union with `type` field) stored in `state.pendingResolution`
4. Player dispatches `RESOLVE_INTERACTION` with an `InteractionResponse`
5. `GameEngine` routes to the correct resolver based on `pendingResolution.type`
6. Resolver processes the response, may advance to next step or clear `pendingResolution`

### Resolution types (22 variants)
`WARE_TRADE`, `WARE_SELECT_MULTIPLE`, `CARRIER_WARE_SELECT`, `WARE_THEFT_SINGLE`, `WARE_THEFT_SWAP`, `UTILITY_THEFT_SINGLE`, `HAND_SWAP`, `BINARY_CHOICE`, `OPPONENT_CHOICE`, `AUCTION`, `DECK_PEEK`, `DISCARD_PICK`, `WARE_CASH_CONVERSION`, `WARE_SELL_BULK`, `WARE_RETURN`, `OPPONENT_DISCARD`, `DRAFT`, `SUPPLIES_DISCARD`, `UTILITY_KEEP`, `CROCODILE_USE`, `UTILITY_EFFECT`, `DRAW_MODIFIER`, `TURN_MODIFIER`

### Design-to-resolver mapping
See `CardResolver.ts:initializeResolution()` for the full mapping. Key examples:
- Guard → no resolution (instant effect via `handlePlayPeople`)
- Crocodile → `CROCODILE_USE` → then inner `UTILITY_EFFECT`
- Elephant/Ape/Lion → `DRAFT` (wares/cards/utilities modes)
- Drums/Boat/Scale/Kettle/Weapons/Leopard Statue → `UTILITY_EFFECT`

## Stall Prevention Pattern — IMPORTANT

Resolution stalls are the #1 recurring bug. A stall happens when:
1. A resolver expects a response, but
2. The AI returns `null` (can't find valid items), or
3. The UI shows empty lists with nothing clickable

### Three-prong defense (always apply all three):

**1. Validation** — Prevent playing cards/utilities when preconditions aren't met:
- Add checks in `validatePlayCard()` and `validateActivateUtility()` in `actionValidator.ts`
- `getValidActions()` uses these to filter, so UI and AI only see valid options
- Example: Boat requires `hand.length > 0 && emptyMarketSlots >= 1`

**2. Resolver guards** — Auto-resolve when state is empty, BEFORE the response type check:
```typescript
// CORRECT — guard before type check
if (state.players[cp].hand.length === 0) {
  return { ...state, pendingResolution: null };  // auto-resolve
}
if (response.type !== 'SELECT_CARD') {
  throw new Error('Expected SELECT_CARD');
}

// WRONG — type check blocks the guard
if (response.type !== 'SELECT_CARD') {
  throw new Error('Expected SELECT_CARD');  // throws before guard runs!
}
if (state.players[cp].hand.length === 0) {
  return { ...state, pendingResolution: null };
}
```

**3. AI dummy responses** — Never return `null` when a resolver has an auto-resolve guard:
```typescript
// CORRECT
if (player.hand.length === 0) return { type: 'SELECT_CARD', cardId: '' };  // dummy triggers guard

// WRONG
if (player.hand.length === 0) return null;  // game stalls forever!
```

**4. UI Continue buttons** — Show a "Continue" button when the player has nothing to interact with:
```tsx
if (hand.length === 0) {
  return <button onClick={() => resolve(dispatch, dummyResponse)}>Continue</button>;
}
```

### When adding a new card or resolver:
1. Add precondition validation in `actionValidator.ts`
2. Put auto-resolve guard BEFORE response type check in resolver
3. Handle empty state in AI (`RandomAI.ts:getRandomInteractionResponse`)
4. Handle empty state in UI (`InteractionPanel.tsx`)
5. Decide whether its first step can be cancelled — add it to
   `isAtFirstStep()` in `src/engine/cancelAction.ts` only if backing out
   reveals no hidden info and undoes no opponent decision (never animals)
6. Run `npx tsc --noEmit` to verify

## Draft Panel Visibility — IMPORTANT

Draft resolutions (Elephant/Ape/Lion) alternate between players picking items from a shared pool. The resolve panel **stays visible** during the opponent's pick so the human player can watch the pool shrink in real time.

Implementation:
- **GameScreen.tsx**: The `ResolveMegaView` renders when `hasPendingInteraction && (!isAiTurn || state.pendingResolution?.type === 'DRAFT')`
- **InteractionPanel.tsx `DraftPanel`**: When `isMyPick === false`, shows the available pool read-only (wares at 0.6 opacity, cards non-clickable) with "Opponent is picking..." prompt
- Card/utility drafts render the same `SelectableCardArea` but with a no-op `onSelect` so `onMegaView` (zoom) still works during opponent's turn

## Card Design IDs

### Animals
`crocodile`, `parrot`, `hyena`, `snake`, `elephant`, `ape`, `lion`, `cheetah`

### Utilities
`well`, `drums`, `throne`, `boat`, `scale`, `mask_of_transformation`, `supplies`, `kettle`, `leopard_statue`, `weapons`

### Ware types
`'trinkets'`, `'hides'`, `'tea'`, `'silk'`, `'fruit'`, `'salt'` (NOT single-letter codes)

## Game Rules

Full card reference: `docs/CARD_REFERENCE.md`

### Setup
- 2 players, 110-card deck, 20g starting gold each
- 6 market slots per player (expandable with Small Market Stand cards)
- Deal 5 cards to each player
- Random first player

### Turn Structure

**Phase 1 — Draw Phase** (costs 1 action per draw attempt):
- Draw top card of deck, look at it
- **Keep it** (add to hand, phase ends) OR **Discard it** (face-up on discard pile, may draw again)
- Up to 5 draw attempts per turn
- Drawing a card costs 1 action

**Phase 2 — Action Phase** (5 actions total, shared with draws):
Each costs 1 action:
- **Play a Ware card** (buy or sell — player chooses)
- **Play a People card** (one-time effect, discarded after)
- **Play an Animal card** (attack — opponent may play Guard to cancel)
- **Play a Utility card** from hand (place face-up, max 3 in play)
- **Activate a Utility** already in play (1 use per utility per turn)

**End of turn**: If 2+ actions unused, earn +1g bonus. There is **no hand limit** (official rules: "players can have as many cards in their hands as they want").

### Card Types (110 cards, 51 unique designs)

**Ware Cards (40)** — 19 unique designs, many duplicates:
- Every ware card can **buy** (pay gold, get wares from supply) OR **sell** (return wares, get gold)
- 6-ware cards (KHTLFS): buy 10g / sell 18g (4 copies)
- 3-of-a-kind: buy 3g / sell 10g (12 copies, 2 per ware type)
- Pair+one: buy 4g / sell 11g (12 copies)
- Three different: buy 5g / sell 12g (12 copies)
- All ware tokens are equal — prices are per-card, not per-type

**Small Market Stand (5)** — the first stand built *in the game* costs 6g; every later stand (either player) costs 3g. Adds 3 market slots.

**6th space**: filling the 6th space of the large market stand costs 2g each time. Wares fill the large stand's free spaces, then small stands, then the 6th space (`MarketManager.getPlacementPlan`). Swaps (Throne, Shaman) exchange in place and never pay the fee.

**Not enough room for wares from people/animal cards**: the player takes what fits; the rest stays in the supply (`placeWaresUpToCapacity`).

**People Cards (29)** — 13 unique designs. One-time effects, discarded after use.
- **Guard (x6)**: Reaction — cancel opponent's animal card (both discarded)
- **Rain Maker (x3)**: Reaction — after opponent buys/sells, take that ware card from discard
- **Shaman (x2)**: Trade all of 1 ware type for same count of different type from supply
- **Psychic (x2)**: Look at top 6 deck cards, take 1, replace rest in order
- **Tribal Elder (x2)**: Choose: opponent discards to 3, OR you draw to 5
- **Wise Man from Afar (x2)**: This turn: buys cost 2g less, sells earn 2g more
- **Portuguese (x2)**: Return any wares from market to supply, get 2g per ware
- **Basket Maker (x2)**: Pay 2g, take 2 of same ware type from supply
- **Traveling Merchant (x2)**: Select 2 ware types from supply to auction; winner pays bid and receives both wares
- **Arabian Merchant (x2)**: Reveal top 3 deck cards, auction them
- **Dancer (x2)**: Pick ware card from hand, sell any 3 market wares at that card's sell price
- **Carrier (x1)**: Choose: take 2 same-type wares OR draw 2 cards. Opponent gets the other.
- **Drummer (x1)**: Take 1 utility from discard pile to hand

**Animal Cards (14)** — 8 unique designs. Can be blocked by Guard.
- **Crocodile (x5)**: Use 1 of opponent's utilities for free, then discard it
- **Parrot (x2)**: Steal 1 ware from opponent's market
- **Hyena (x2)**: Look at opponent's hand, take 1 card, give them 1 of yours
- **Snake (x1)**: Both players keep 1 utility, discard the rest
- **Elephant (x1)**: Pool all wares from both markets, draft alternating (you first)
- **Ape (x1)**: Pool all hand cards, draft alternating (you first)
- **Lion (x1)**: Pool all utilities, draft alternating (you first, max 3 each)
- **Cheetah (x1)**: Opponent chooses: pay you 2g, OR you draw 2 cards

**Utility Cards (22)** — 10 unique designs. Placed face-up (max 3). Reusable each turn (1 use/turn, costs 1 action).
- **Well (x3)**: Pay 1g, draw 1 card
- **Drums (x3)**: Return 1 ware from market to supply, draw 1 card
- **Throne (x2)**: Swap 1 ware from your market with 1 from opponent's
- **Boat (x2)**: Discard 1 hand card, take 1 ware of choice from supply
- **Scale (x2)**: Draw 2 cards, keep 1, give other to opponent
- **Mask of Transformation (x2)**: Trade 1 hand card for top of discard pile
- **Supplies (x2)**: Pay 1g or discard 1 card, then draw until ware found (discard non-wares)
- **Kettle (x2)**: Discard 1-2 hand cards, draw same number
- **Leopard Statue (x2)**: Pay 2g, take 1 ware of choice from supply
- **Weapons (x2)**: Discard 1 hand card, receive 2g

### Ware Supply
Each ware type has a shared supply pool (not unlimited). When wares are bought, they come from supply. When sold/returned, they go back. If supply is empty, that type cannot be obtained.

### Reactions (played during opponent's turn, cost 0 actions)
- **Guard**: Cancel any animal card
- **Rain Maker**: Take opponent's just-used ware card from discard

### Cancelling (digital-only convenience)
`CANCEL_ACTION` backs out of a card/utility the active player just started,
before its first choice: refunds the action, returns the card to the same
hand slot or clears the utility's used flag. Allowed: Boat, Kettle, Weapons,
Drums, Leopard Statue, Throne, Mask, Supplies, Scale (before drawing),
Shaman, Tribal Elder, Carrier, Portuguese, Basket Maker, Dancer, Drummer,
Traveling Merchant (before any bid), choosing a utility to replace. Never:
Psychic, Arabian Merchant (reveal deck cards), animals (Guard window already
offered). Not in `getValidActions()` — the AI never cancels.

### Endgame
- **Trigger**: Player ends turn with >= 60g
- **Final turn**: Opponent gets 1 final turn (5 actions)
- **Winner**: Most gold after final turn
- **Tiebreaker**: Final-turn player wins ties
- Final-turn player cannot trigger recursive endgame

### Deck Exhaustion
When draw deck is empty and discard pile has cards, shuffle discard to form new deck.

## Common Mistakes

- Using `'K'` or `'H'` for ware types — correct values are `'trinkets'`, `'hides'`, etc.
- `'leopard'` is not a card — the animal is `'cheetah'`, the utility is `'leopard_statue'`
- Forgetting `.ts` extension on local imports (TS5097 error)
- Using `import { Foo }` for type-only imports instead of `import type { Foo }`
- Mutating state arrays (push/splice) instead of spreading new arrays
- Checking response type before checking empty-state guards in resolvers
- Returning `null` from AI when resolver has auto-resolve guard (causes permanent stall)
- Referencing `activePlayer` variable after refactoring — use `state.currentPlayer`
