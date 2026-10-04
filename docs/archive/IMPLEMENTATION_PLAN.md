# Digital Jambo - Implementation Plan

*Version 1.0 | February 7, 2026*

---

## 1. Technology Stack

### 1.1 Core Stack
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | React 18+ (TypeScript) | Component-based UI, huge ecosystem, SSR for SEO |
| **State Management** | Zustand | Lightweight, immutable-friendly, perfect for game state |
| **Animations** | Framer Motion | Physics-based springs, layout animations, gesture support |
| **Drag & Drop** | @dnd-kit | Modern, accessible, touch-friendly DnD |
| **Styling** | Tailwind CSS | Responsive breakpoints, utility-first, fast iteration |
| **Build Tool** | Vite | Fast HMR, optimized builds, PWA plugin |
| **PWA** | vite-plugin-pwa | Service worker generation, offline caching |
| **Testing** | Vitest + React Testing Library | Fast, Vite-native, excellent DX |
| **Schema Validation** | Zod | Runtime type safety for game state serialization |
| **Multiplayer** | Firebase Realtime Database | Low-latency sync, offline support, free tier |
| **Hosting** | Firebase Hosting + CloudFront CDN | Global CDN, easy deploy, SSL |
| **CI/CD** | GitHub Actions | Automated test, build, deploy pipeline |

### 1.2 Key Architecture Decisions
- **No backend server needed** -- Firebase handles multiplayer sync + hosting
- **No ML/AI library** -- Custom MCTS + heuristics in pure TypeScript (keeps bundle small)
- **Immutable state** -- All game state updates produce new objects (enables undo, replay, AI tree search)
- **Logical IDs only in state** -- Game state never references asset paths (enables theming, reduces serialization size)
- **Seeded RNG** -- Reproducible shuffles for testing, replays, and multiplayer sync

---

## 2. Project Structure

```
jambo/
├── docs/                          # Design documents (existing)
├── public/
│   ├── assets/
│   │   ├── cards/                 # 51 unique card PNGs (825x1125 @2x) — 110 cards in deck
│   │   ├── wares/                 # 6 ware token PNGs
│   │   ├── tokens/                # Gold, action markers
│   │   ├── components/            # Market stands, backgrounds
│   │   └── card-back.png
│   ├── audio/                     # SFX and ambient tracks
│   ├── manifest.json              # PWA manifest
│   └── index.html
├── src/
│   ├── engine/                    # Pure game logic (zero UI dependencies)
│   │   ├── GameState.ts           # Core state interface + factory
│   │   ├── GameEngine.ts          # Turn logic, action dispatch, rules enforcement
│   │   ├── cards/
│   │   │   ├── CardDatabase.ts    # 110-card deck (51 unique designs, JSON-driven)
│   │   │   ├── CardResolver.ts    # Card play resolution dispatcher
│   │   │   └── resolvers/         # 15 state model resolvers
│   │   │       ├── wareResolver.ts
│   │   │       ├── shamanResolver.ts
│   │   │       ├── auctionResolver.ts
│   │   │       ├── draftResolver.ts
│   │   │       ├── theftResolver.ts
│   │   │       └── ... (15 total)
│   │   ├── market/
│   │   │   ├── MarketManager.ts   # Ware slot management, 6th slot penalty
│   │   │   └── WareSupply.ts      # Global ware supply tracking
│   │   ├── endgame/
│   │   │   └── EndgameManager.ts  # Win condition checking, final turn logic
│   │   ├── deck/
│   │   │   └── DeckManager.ts     # Draw, discard, reshuffle, seeded RNG
│   │   ├── validation/
│   │   │   ├── invariants.ts      # 27 game rule invariant checks
│   │   │   └── actionValidator.ts # Pre-play validation for each card
│   │   └── types.ts               # Core TypeScript interfaces
│   │
│   ├── ai/                        # AI opponent (zero UI dependencies)
│   │   ├── AIEngine.ts            # Top-level AI decision coordinator
│   │   ├── difficulties/
│   │   │   ├── EasyAI.ts          # Random legal moves + basic heuristics
│   │   │   ├── MediumAI.ts        # Heuristic scoring + 1-ply lookahead
│   │   │   └── HardAI.ts          # MCTS 3-ply + market optimization
│   │   ├── heuristics/
│   │   │   ├── GoldEfficiency.ts  # Gold per action scoring (40% weight)
│   │   │   ├── MarketHealth.ts    # Ware positioning scoring (25% weight)
│   │   │   ├── OpponentPressure.ts # Disruption scoring (20% weight)
│   │   │   └── HandHealth.ts      # Hand quality scoring (15% weight)
│   │   ├── resolvers/             # AI decision logic per state model
│   │   │   ├── aiShamanResolver.ts
│   │   │   ├── aiAuctionResolver.ts
│   │   │   └── ... (15 total)
│   │   ├── MCTS.ts                # Monte Carlo Tree Search implementation
│   │   └── DeckEstimator.ts       # Hidden information modeling (deck probabilities)
│   │
│   ├── ui/                        # React UI layer
│   │   ├── App.tsx                # Root component, routing
│   │   ├── screens/
│   │   │   ├── MainMenu.tsx       # Title screen, mode selection
│   │   │   ├── GameScreen.tsx     # Main game board
│   │   │   ├── SettingsScreen.tsx # Preferences, accessibility
│   │   │   └── RulesScreen.tsx    # Interactive rules/tutorial
│   │   ├── board/
│   │   │   ├── GameBoard.tsx      # Overall board layout
│   │   │   ├── MarketStand.tsx    # Player's 6-slot market
│   │   │   ├── WareSlot.tsx       # Individual ware slot (drag target)
│   │   │   ├── WareToken.tsx      # Ware token display
│   │   │   ├── HandCards.tsx      # Player's hand (fan/carousel)
│   │   │   ├── CardComponent.tsx  # Individual card rendering
│   │   │   ├── ActionTracker.tsx  # 5-action token display
│   │   │   ├── GoldDisplay.tsx    # Gold counter with animation
│   │   │   ├── PhaseBanner.tsx    # Draw/Play phase indicator
│   │   │   ├── DeckPile.tsx       # Draw deck with count
│   │   │   ├── DiscardPile.tsx    # Discard pile (top card visible)
│   │   │   ├── UtilityArea.tsx    # 3 utility card slots
│   │   │   └── OpponentArea.tsx   # Opponent's visible state
│   │   ├── interactions/
│   │   │   ├── CardPlayModal.tsx  # Card play confirmation
│   │   │   ├── WareSelector.tsx   # Select wares from market
│   │   │   ├── AuctionPanel.tsx   # Bidding UI for auctions
│   │   │   ├── DraftPanel.tsx     # Alternating-pick draft UI
│   │   │   ├── GuardReaction.tsx  # 2-second Guard reaction prompt
│   │   │   ├── DrawPhaseUI.tsx    # Keep/discard decision UI
│   │   │   └── EndgameOverlay.tsx # Final score + winner announcement
│   │   ├── animations/
│   │   │   ├── CardAnimations.tsx # Card play, draw, discard motions
│   │   │   ├── WareAnimations.tsx # Ware buy/sell/trade effects
│   │   │   ├── GoldAnimations.tsx # Gold earn/spend particles
│   │   │   └── SpecialFX.tsx      # Elephant earthquake, Guard lightning, etc.
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Tooltip.tsx
│   │       └── AccessibleIcon.tsx
│   │
│   ├── multiplayer/               # Online play via Firebase
│   │   ├── FirebaseConfig.ts      # Firebase initialization
│   │   ├── GameRoom.ts            # Room creation, joining, matchmaking
│   │   ├── StateSyncer.ts         # Delta compression + hash integrity
│   │   └── ReconnectHandler.ts    # Connection drop recovery
│   │
│   ├── persistence/               # Save/load system
│   │   ├── SaveManager.ts         # IndexedDB save/load
│   │   ├── Serializer.ts          # State → JSON (2.1KB)
│   │   ├── Deserializer.ts        # JSON → State (7-layer pipeline)
│   │   ├── Migrator.ts            # Version migration functions
│   │   └── IntegrityChecker.ts    # HMAC SHA-256 tamper detection
│   │
│   ├── assets/                    # Asset management
│   │   ├── AssetManager.ts        # 5-tier cache, progressive loading
│   │   ├── AssetManifest.ts       # Card ID → asset path mapping
│   │   ├── SpriteCache.ts         # LRU memory cache (50MB)
│   │   ├── TextureAtlas.ts        # GPU canvas atlas (2048x2048)
│   │   └── FallbackRenderer.ts    # SVG text fallback for missing assets
│   │
│   ├── audio/
│   │   ├── AudioManager.ts        # SFX playback, volume control
│   │   └── sounds.ts              # Sound effect definitions
│   │
│   ├── hooks/                     # React hooks
│   │   ├── useGameState.ts        # Zustand game state hook
│   │   ├── useAI.ts               # AI move computation (web worker)
│   │   ├── useAnimationSpeed.ts   # Animation speed preferences
│   │   └── useAccessibility.ts    # A11y preferences
│   │
│   └── utils/
│       ├── rng.ts                 # Seeded pseudo-random number generator
│       ├── dateUtils.ts
│       └── constants.ts           # Game constants (GOLD_TARGET=60, MAX_ACTIONS=5, etc.)
│
├── tests/
│   ├── engine/                    # Pure game logic tests (~500 tests)
│   │   ├── gameState.test.ts
│   │   ├── turnFlow.test.ts
│   │   ├── cards/                 # Per-card tests (275 card + 412 edge case)
│   │   │   ├── wareCards.test.ts
│   │   │   ├── shaman.test.ts
│   │   │   ├── elephant.test.ts
│   │   │   ├── throne.test.ts
│   │   │   └── ...
│   │   ├── reshuffle.test.ts      # 22 reshuffle tests
│   │   ├── endgame.test.ts
│   │   └── validation.test.ts     # 187 deserialization tests
│   ├── ai/                        # AI behavior tests (~30 tests)
│   │   ├── easyAI.test.ts
│   │   ├── mediumAI.test.ts
│   │   ├── hardAI.test.ts
│   │   └── winRate.test.ts        # Statistical win rate verification
│   └── ui/                        # Component tests
│       ├── GameBoard.test.tsx
│       └── interactions.test.tsx
│
├── scripts/
│   ├── generate-states.ts         # Generate 275 card state variant images
│   ├── validate-assets.ts         # Check all 68 assets present and valid
│   └── ai-benchmark.ts            # Run 1000 games per difficulty, report stats
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 3. Implementation Phases

### Phase 1: Core Engine (Week 1 -- Feb 8-14)

The game engine is the foundation. It must be 100% correct before any UI is built. All engine code is pure TypeScript with zero UI dependencies -- fully testable in isolation.

#### 3.1.1 Game State & Types
**Files**: `src/engine/types.ts`, `src/engine/GameState.ts`

```typescript
// Core interfaces to define
interface GameState {
  version: string;
  rngSeed: number;
  turn: number;
  currentPlayer: 0 | 1;
  phase: 'DRAW' | 'PLAY' | 'GAME_OVER';
  actionsLeft: number;          // 0-5
  deck: CardId[];               // Ordered array
  discardPile: CardId[];
  reshuffleCount: number;
  wareSupply: Record<WareType, number>;
  players: [PlayerState, PlayerState];
  pendingResolution: PendingResolution | null;
  endgame: EndgameState | null;
}

interface PlayerState {
  gold: number;
  hand: CardId[];               // Max 5 at end of turn
  market: (WareType | null)[];  // 6 slots
  utilities: UtilityState[];    // Max 3
  usedThisTurn: string[];       // Utility IDs used this turn
}

type WareType = 'trinkets' | 'hides' | 'tea' | 'silk' | 'fruit' | 'salt';

type PendingResolution =
  | { type: 'OPPONENT_DISCARD'; ... }
  | { type: 'AUCTION'; ... }
  | { type: 'DRAFT'; ... }
  | { type: 'WARE_THEFT_SWAP'; ... }
  | { type: 'WARE_THEFT_SINGLE'; ... }
  | { type: 'UTILITY_THEFT_SINGLE'; ... }
  | { type: 'WARE_TRADE'; ... }
  | { type: 'BINARY_CHOICE'; ... }
  | { type: 'DECK_PEEK'; ... }
  | { type: 'WARE_CASH_CONVERSION'; ... }
  | { type: 'DISCARD_PICK'; ... }
  | { type: 'WARE_SELECT_MULTIPLE'; ... }
  | { type: 'WARE_SELL_BULK'; ... }
  | { type: 'WARE_RETURN'; ... }
  | { type: 'TURN_MODIFIER'; ... }
  | { type: 'DRAW_MODIFIER'; ... };
```

**Deliverables**:
- [ ] `GameState` interface and all sub-interfaces
- [ ] `createInitialState(seed: number): GameState` factory
- [ ] `WareType`, `CardId`, `CardType` enums
- [ ] `PendingResolution` discriminated union (15 variants)
- [ ] Seeded RNG utility (`src/utils/rng.ts`)

#### 3.1.2 Card Database
**Files**: `src/engine/cards/CardDatabase.ts`

Define all 110 cards (51 unique designs) as JSON-driven data:
```typescript
interface CardDefinition {
  id: CardId;
  name: string;
  type: 'ware' | 'people' | 'animal' | 'utility';
  playCost: number;
  interactionType: StateModelType;
  wares?: { types: WareType[]; buyPrice: number; sellPrice: number };
  flowSteps: string[];
  validation: ValidationRule[];
  uiPrompts: string[];
  aiHeuristic: string;  // Named heuristic key
}
```

**Deliverables**:
- [ ] All 110 card definitions (51 unique designs with duplicate copies)
- [ ] Card lookup by ID, type, and interaction type
- [ ] Ware card per-card fixed pricing (3-or-6 wares, buy OR sell)
- [ ] Card count validation (must total exactly 110)

#### 3.1.3 Game Engine & Turn Logic
**Files**: `src/engine/GameEngine.ts`

```typescript
class GameEngine {
  // Turn management
  startTurn(state: GameState): GameState;
  endTurn(state: GameState): GameState;

  // Draw phase
  drawCard(state: GameState): GameState;      // Reveal top card
  keepCard(state: GameState): GameState;      // Add to hand, end draw phase
  discardDrawn(state: GameState): GameState;  // Discard, continue drawing

  // Action phase
  playCard(state: GameState, cardId: CardId, params?: any): GameState;
  activateUtility(state: GameState, utilityIndex: number): GameState;
  drawAction(state: GameState): GameState;    // Action-phase draw (must keep)

  // Pending resolution
  resolveInteraction(state: GameState, response: any): GameState;

  // Queries
  getValidActions(state: GameState): Action[];
  canPlayCard(state: GameState, cardId: CardId): boolean;
}
```

**Deliverables**:
- [ ] Complete turn flow: Draw Phase → Play Phase → End Turn
- [ ] 5-action tracking with action bonus (+1g for 2+ unused)
- [ ] Phase transitions with validation
- [ ] Hand limit enforcement (5 cards end of turn)
- [ ] `getValidActions()` for AI and UI

#### 3.1.4 Card Resolvers (15 State Models)
**Files**: `src/engine/cards/resolvers/` (15 files)

Each resolver handles one state model type. Implementation order by complexity:

| Priority | Resolver | Cards Using It |
|----------|----------|---------------|
| 1 | `NONE` (auto-resolve) | Simple ware buy/sell, stands |
| 2 | `ACTIVE_SELECT` | Throne (steal), Parrot (steal) |
| 3 | `WARE_TRADE` | Shaman |
| 4 | `OPPONENT_DISCARD` | Tribal Elder, Snake |
| 5 | `REACTION` | Guard, Rain Maker |
| 6 | `AUCTION` | Traveling Merchant |
| 7 | `DRAFT` | Elephant, Ape |
| 8 | `BINARY_CHOICE` | Carrier, Supplies |
| 9 | `WARE_CASH_CONVERSION` | Dancer |
| 10 | `DISCARD_PICK` | Drummer |
| 11 | `DECK_PEEK` | Psychic |
| 12 | `WARE_SELECT_MULTIPLE` | Basket Maker |
| 13 | `WARE_SELL_BULK` | Portuguese |
| 14 | `WARE_RETURN` | Drums (utility) |
| 15 | `TURN_MODIFIER` | Wise Man |
| 16 | `DRAW_MODIFIER` | Mask of Transformation |

**Deliverables**:
- [ ] 15 resolver implementations (pure functions, no side effects)
- [ ] Each resolver: validate → execute → produce new state
- [ ] `pendingResolution` management (set, check, clear)
- [ ] Guard reaction window integration

#### 3.1.5 Market & Ware Supply
**Files**: `src/engine/market/MarketManager.ts`, `WareSupply.ts`

**Deliverables**:
- [ ] Add/remove wares from 6-slot market
- [ ] 6th slot penalty tracking (-2g)
- [ ] First-empty-slot placement logic
- [ ] Ware supply pool (finite, shared between players)
- [ ] Validation: slot occupancy checks, supply availability

#### 3.1.6 Deck & Discard
**Files**: `src/engine/deck/DeckManager.ts`

**Deliverables**:
- [ ] Seeded shuffle algorithm
- [ ] Draw card (remove from top of deck)
- [ ] Discard card (add to discard pile)
- [ ] Reshuffle (discard → new deck when empty)
- [ ] Reshuffle count tracking
- [ ] Deadlock detection (both empty)

#### 3.1.7 Endgame Manager
**Files**: `src/engine/endgame/EndgameManager.ts`

**Deliverables**:
- [ ] 60g threshold check at turn end (not mid-action)
- [ ] Endgame trigger: set `endgame.triggerPlayer`, grant opponent final turn
- [ ] Tie-breaking: final-turn player wins on tie
- [ ] Pause endgame check during `pendingResolution`
- [ ] No recursive endgame trigger during final turn
- [ ] Final scoring calculation

#### 3.1.8 Engine Tests
Write tests alongside implementation. Target: **~700 tests** by end of Week 1.

**Deliverables**:
- [ ] Turn flow tests (15 cases)
- [ ] Market management tests (12 cases)
- [ ] Ware buy/sell tests (192 cases across 24 cards)
- [ ] Per-card tests (275+ cases across 51 unique card designs)
- [ ] Edge case tests (412 cases)
- [ ] Reshuffle tests (22 cases)
- [ ] Endgame tests (8 cases)
- [ ] Validation/invariant tests (27 checks)

---

### Phase 2: AI Engine + Basic UI (Week 2 -- Feb 15-21)

#### 3.2.1 AI Decision Engine
**Files**: `src/ai/`

**Easy AI** (`EasyAI.ts`):
- Pick random legal action from `getValidActions()`
- Basic heuristic: prefer selling over buying, prefer playing cards over drawing
- 40% mistake rate (sometimes picks suboptimal move intentionally)
- Target: 30% win rate, 500ms think time

**Medium AI** (`MediumAI.ts`):
- Score each legal action using 12-heuristic system (0-100)
- 1-turn lookahead: simulate each action, score resulting state
- 15% mistake rate
- Shaman trades: always trade lowest-value for highest-value
- Endgame awareness: rush when < 10g from 60g
- Target: 55% win rate, 1.2s think time

**Hard AI** (`HardAI.ts`):
- Monte Carlo Tree Search with 3-ply depth
- 50-300 simulations per decision
- Score = Expected Value x (1 - Risk)
- Hidden information modeling: estimate opponent hand via observed discards
- Phase-based strategy weights (Early/Mid/Late/Endgame)
- Optimal Shaman trading, auction bidding, draft ordering
- Target: 75% win rate, 2.5s think time

**AI Card Resolvers** (`src/ai/resolvers/` -- 15 files):
Each maps to an engine resolver and provides the AI's decision:
- Shaman: trade min sell-value → max sell-value
- Throne: steal max value, give min value
- Elephant: snake-draft ordering (highest value first)
- Auction: bid aggressively on high-value wares
- Tribal Elder: discard mode when opponent has 5+ cards
- Guard: always play if available

**Deliverables**:
- [ ] `AIEngine.ts` coordinator with difficulty selection
- [ ] Easy, Medium, Hard AI implementations
- [ ] 15 AI resolver handlers
- [ ] MCTS implementation (HardAI)
- [ ] Deck probability estimator
- [ ] AI think time delays (artificial, for UX)
- [ ] Web Worker wrapper for non-blocking AI computation
- [ ] AI benchmark script (1000 games per difficulty)

#### 3.2.2 Basic Game UI
**Files**: `src/ui/`

Build the core playable UI. Minimal visual polish -- focus on function.

**Game Board Layout** (`GameBoard.tsx`):
```
┌──────────────────────────────────┐
│  Opponent: Gold | Market | Utils │  (face-down hand)
├──────────────────────────────────┤
│  [Deck]  [Discard]  Phase Banner │
│                                  │
│  Action Tracker: ● ● ● ○ ○      │
├──────────────────────────────────┤
│  Your Market: [1][2][3][4][5][6] │
│  Your Utilities: [U1][U2][U3]    │
├──────────────────────────────────┤
│  Your Hand: [Card] [Card] [Card] │
│  Gold: 25g                       │
└──────────────────────────────────┘
```

**Deliverables**:
- [ ] `GameBoard.tsx` -- responsive layout (desktop/tablet/mobile)
- [ ] `MarketStand.tsx` -- 6 ware slots with visual tokens
- [ ] `HandCards.tsx` -- fan/carousel card display
- [ ] `CardComponent.tsx` -- card rendering with tap-to-play
- [ ] `ActionTracker.tsx` -- 5 action tokens
- [ ] `GoldDisplay.tsx` -- gold counter
- [ ] `PhaseBanner.tsx` -- Draw/Play phase indicator
- [ ] `DrawPhaseUI.tsx` -- keep/discard decision
- [ ] `WareSelector.tsx` -- select wares for complex cards
- [ ] `EndgameOverlay.tsx` -- winner announcement
- [ ] `MainMenu.tsx` -- mode selection (vs AI, hotseat)
- [ ] Zustand store wiring (`useGameState.ts`)
- [ ] AI integration hook (`useAI.ts`)

#### 3.2.3 Asset Pipeline (Placeholder)
For Week 2, use placeholder card images (colored rectangles with text) so the game is fully playable. Real assets will be integrated in Phase 3.

**Deliverables**:
- [ ] `FallbackRenderer.ts` -- SVG text-based card rendering
- [ ] `AssetManifest.ts` -- card ID → placeholder mapping
- [ ] Ware token placeholder icons (colored circles)

---

### Phase 3: Polish, Assets & Save System (Week 3 -- Feb 22-28)

#### 3.3.1 Real Asset Integration
**Files**: `src/assets/`, `scripts/`

**Deliverables**:
- [ ] Source or create 51 unique card PNGs + 6 ware tokens + stands + backgrounds
- [ ] `generate-states.ts` script: produce 275 state variant images
- [ ] `validate-assets.ts` script: verify all 68 assets present, correct dimensions, < 500KB each
- [ ] `AssetManager.ts` -- progressive loading (critical path → background)
- [ ] `SpriteCache.ts` -- LRU memory cache (50MB max)
- [ ] `TextureAtlas.ts` -- GPU canvas atlas for hot sprites
- [ ] Service Worker caching for offline play

#### 3.3.2 Animation System
**Files**: `src/ui/animations/`

Implement physics-based Framer Motion animations:

| Animation | Duration | Priority |
|-----------|----------|----------|
| Card draw (deck → hand) | 300ms | P0 |
| Card play (hand → board) | 400ms | P0 |
| Card discard (hand → discard) | 250ms | P0 |
| Ware buy (supply → market slot) | 500ms | P0 |
| Ware sell (market → supply + gold) | 600ms | P0 |
| Gold earn/spend (particle burst) | 400ms | P1 |
| Shaman trade (morph animation) | 900ms | P1 |
| Elephant draft (dramatic with shake) | 1400ms | P1 |
| Guard reaction (lightning fast) | 450ms | P1 |
| Endgame reveal (score tally) | 2000ms | P1 |

**Deliverables**:
- [ ] `CardAnimations.tsx` -- draw, play, discard motions
- [ ] `WareAnimations.tsx` -- buy, sell, trade, steal effects
- [ ] `GoldAnimations.tsx` -- earn/spend particle system
- [ ] `SpecialFX.tsx` -- Elephant earthquake, Guard lightning
- [ ] Speed control system (4 modes + adaptive after turn 15)
- [ ] Skip animation (spacebar / double-tap)
- [ ] Haptic feedback integration

#### 3.3.3 Audio System
**Files**: `src/audio/`

**Deliverables**:
- [ ] Card draw/play/discard SFX
- [ ] Gold coin sounds
- [ ] Dramatic animal card sounds (Elephant trumpet, etc.)
- [ ] Ambient marketplace background track
- [ ] Endgame victory/defeat stings
- [ ] Volume control in settings

#### 3.3.4 Save/Load System
**Files**: `src/persistence/`

**Deliverables**:
- [ ] `Serializer.ts` -- GameState → JSON (target: 2.1KB, < 2ms)
- [ ] `Deserializer.ts` -- 7-layer validation pipeline:
  1. JSON.parse
  2. Zod schema validation
  3. Version migration
  4. HMAC SHA-256 integrity check
  5. 27 Jambo rule invariants
  6. Normalization (auto-fix invalid values)
  7. Asset prefetch trigger
- [ ] `SaveManager.ts` -- IndexedDB save/load with 3 save slots
- [ ] Auto-save on every turn end
- [ ] Resume game on app launch
- [ ] Corrupt save → fresh game (graceful degradation)

#### 3.3.5 Interaction Modals for Complex Cards
**Files**: `src/ui/interactions/`

**Deliverables**:
- [ ] `AuctionPanel.tsx` -- bidding UI with raise/pass buttons
- [ ] `DraftPanel.tsx` -- alternating pick interface for Elephant
- [ ] `GuardReaction.tsx` -- 2-second countdown, auto-dismiss
- [ ] `CardPlayModal.tsx` -- confirmation for high-cost actions
- [ ] Multi-step flow for Throne (steal → give), Dancer (select card → return wares)
- [ ] Undo system (3s for card plays, 8s for draws)

---

### Phase 4: Multiplayer, Accessibility & Launch (Week 4 -- Mar 1-7)

#### 3.4.1 Online Multiplayer
**Files**: `src/multiplayer/`

**Deliverables**:
- [ ] Firebase project setup (Realtime Database + Hosting)
- [ ] `GameRoom.ts` -- create room, share code, join room
- [ ] `StateSyncer.ts` -- delta compression (184 bytes per action), hash integrity
- [ ] `ReconnectHandler.ts` -- automatic reconnection on network drop
- [ ] Turn-based sync: player submits action → validate on both clients → apply
- [ ] Spectator mode (read-only state subscription)
- [ ] Online lobby UI (create/join game)

#### 3.4.2 Hotseat Mode
**Deliverables**:
- [ ] Screen transition between players (hide hand, "Pass device" prompt)
- [ ] Shared state on single device
- [ ] No hidden information leaks during handoff

#### 3.4.3 Accessibility
**Deliverables**:
- [ ] Color-blind ware patterns (stripes, diamonds, checker, crosshatch, circles, dots)
- [ ] Keyboard navigation (Tab through cards, Enter to play, Escape to cancel)
- [ ] ARIA labels for all interactive elements
- [ ] Screen reader announcements for game events
- [ ] 48dp minimum touch targets
- [ ] Information density slider (Settings)
- [ ] Adaptive tooltips (full rules → summary → disabled)

#### 3.4.4 PWA & Offline
**Deliverables**:
- [ ] PWA manifest (`manifest.json`)
- [ ] Service Worker (vite-plugin-pwa)
- [ ] Install prompt on mobile
- [ ] Offline indicator in UI
- [ ] Full offline play with IndexedDB state

#### 3.4.5 Settings & Preferences
**Deliverables**:
- [ ] Animation speed (Casual/Expert/Turbo/Cinematic)
- [ ] Audio volume (SFX, Music, Master)
- [ ] Color-blind mode toggle
- [ ] Information density slider
- [ ] Accessibility options
- [ ] AI difficulty selection
- [ ] Game statistics (games played, win rate per difficulty)

#### 3.4.6 Final Testing & QA
**Deliverables**:
- [ ] All ~960 automated tests passing
- [ ] AI benchmark: 1000 games per difficulty, verify win rates
- [ ] Manual QA: 20 critical card flows (Throne, Elephant, Shaman, Guard, Endgame, etc.)
- [ ] Performance audit: 60fps, < 2s load, < 128MB memory
- [ ] Cross-browser testing (Chrome, Safari, Firefox, Edge)
- [ ] Mobile testing (iOS Safari, Android Chrome)
- [ ] Accessibility audit (keyboard nav, screen reader, color contrast)

---

## 4. Data Flow Architecture

```
┌─────────────┐     actions      ┌──────────────┐
│   React UI   │ ──────────────► │  Game Engine  │
│  (Zustand)   │ ◄────────────── │  (Pure TS)    │
│              │    new state     │              │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       │  render                        │  getValidActions()
       ▼                                ▼
┌─────────────┐                 ┌──────────────┐
│  Framer      │                 │   AI Engine   │
│  Motion      │                 │  (Web Worker) │
│  Animations  │                 │              │
└─────────────┘                 └──────────────┘
                                        │
                                        │  chooseAction()
                                        ▼
                                ┌──────────────┐
                                │    MCTS /     │
                                │  Heuristics   │
                                └──────────────┘
```

**Key Principle**: The Game Engine is the single source of truth. The UI reads state and dispatches actions. The AI reads state and returns actions. No state mutation happens outside the engine.

---

## 5. State Management (Zustand)

```typescript
interface GameStore {
  // State
  gameState: GameState | null;
  gameMode: 'ai' | 'hotseat' | 'online' | null;
  aiDifficulty: 'easy' | 'medium' | 'hard';
  animating: boolean;

  // Actions
  newGame: (mode: GameMode, difficulty?: AIDifficulty) => void;
  dispatchAction: (action: GameAction) => void;
  resolveInteraction: (response: any) => void;
  undoLastAction: () => void;
  saveGame: () => Promise<void>;
  loadGame: (slot: number) => Promise<void>;

  // UI state
  selectedCard: CardId | null;
  highlightedSlots: number[];
  showModal: ModalType | null;
}
```

---

## 6. Card Implementation Template

Every card follows this exact implementation pattern:

```typescript
// 1. Card Definition (CardDatabase.ts)
{
  id: 'shaman',
  name: 'Shaman',
  type: 'people',
  playCost: 0,
  interactionType: 'WARE_TRADE',
  flowSteps: ['SELECT_GIVE_TYPE', 'SELECT_RECEIVE_TYPE', 'EXECUTE_TRADE'],
  validation: ['hasWaresOfOneType', 'supplyHasRequestedType'],
  uiPrompts: [
    'Select a ware type to trade away (all of that type)',
    'Select a ware type to receive',
  ],
  aiHeuristic: 'tradeMinSellForMaxSell',
}

// 2. Engine Resolver (resolvers/shamanResolver.ts)
export function resolveShamanTrade(state: GameState, params: ShamanParams): GameState {
  // Validate: player has wares of giveType, supply has receiveType
  // Execute: remove all giveType from market, add same count of receiveType
  // Return: new state with pendingResolution cleared
}

// 3. AI Resolver (ai/resolvers/aiShamanResolver.ts)
export function aiShamanDecision(state: GameState): ShamanParams {
  // Find ware type with lowest sell value → giveType
  // Find ware type with highest sell value available in supply → receiveType
  // Return { giveType, receiveType }
}

// 4. UI Component (handled by WareSelector.tsx via interactionType dispatch)

// 5. Tests (tests/engine/cards/shaman.test.ts -- 18 test cases)
```

---

## 7. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Card interactions have bugs | High | High | 960 automated tests, TDD approach |
| AI too easy or too hard | Medium | Medium | 1000-game benchmark per difficulty, tunable weights |
| Asset creation takes too long | Medium | Medium | SVG fallback renderer, placeholder art for MVP |
| Firebase costs at scale | Low | Medium | Free tier covers ~100 concurrent users; upgrade path clear |
| Performance on low-end mobile | Medium | Medium | Progressive loading, animation speed controls, LOD system |
| Complex cards confuse players | Medium | Low | Guided multi-step flows, contextual tooltips, tutorial |

---

## 8. Development Priorities (Ordered)

If time is tight, build in this order:

1. **Game Engine + 110 cards (51 unique designs)** (non-negotiable -- this IS the game)
2. **Easy AI** (immediately makes it playable and fun)
3. **Basic UI** (functional, not pretty -- placeholder art fine)
4. **Medium + Hard AI** (increases replayability dramatically)
5. **Save/Load** (prevents lost progress, essential for mobile)
6. **Animations + Audio** (makes it feel premium)
7. **Real card art** (visual polish)
8. **Online multiplayer** (network effect, but AI covers single-player)
9. **Accessibility** (important but can be iterative)
10. **PWA offline** (enhances mobile experience)

---

## 9. Definition of Done (v1.0)

- [ ] All 110 cards (51 unique designs) fully implemented and tested
- [ ] 3 AI difficulty levels with verified win rates
- [ ] Complete game flow: start → play → endgame → results
- [ ] Save/load with corruption recovery
- [ ] Responsive UI (desktop + tablet + mobile)
- [ ] Animations for all card types
- [ ] Audio SFX
- [ ] Hotseat 2-player mode
- [ ] Online multiplayer via Firebase
- [ ] PWA installable with offline support
- [ ] 960/960 tests passing
- [ ] 60fps performance target met
- [ ] < 2 second first playable load
- [ ] Accessibility: keyboard nav + color-blind mode
