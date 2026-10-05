# Jambo — Design System

**Live showcase**: run `npm run dev` and open `/design-system.html` — every
token/component on that page is read from `src/index.css` and the app's real
classes at runtime, not re-typed.

## Direction

**"African Market" — warm wood, hand-tooled leather, market gold.** The
palette is drawn from a market stall at late afternoon: dark cocoa-wood
backgrounds, aged brass/gold accents, cream linen card stock, and the six
saturated ware colors (trinkets/hides/tea/silk/fruit/salt) that carry the
game's core resource identity. Type is a single serif (Judson) used for both
display and body, giving the whole app the feel of a hand-lettered market
ledger rather than a modern app UI.

The direction was already established in the codebase before this pass
(illustrated card art for all 51 unique designs, a full wood/gold token set,
five looping background-music tracks, an etched-wood-border motif, and an
extensive animation-timing system for market/gold/pile feedback). This pass
**documents that system for the first time**, makes it visible via a live
showcase page, fixes one real inconsistency (see Changelog), and flags one
functional gap that needs a follow-up (missing SFX files — see Sound).

Key moments the system already leans into:
- **Game start** — the "Welcome to the Market" / "You go first" reveal
  screens, using the full-bleed Jambo title illustration.
- **A ware trade** — the buy/sell dialog, card art + coin art + ware-color
  pips on linen card stock.
- **A gold change** — `gold-pop` / `gold-delta` float animations on the
  player's gold total.
- **An animal attack** — `attack` audio event + market/pile flash animations
  (Guard can cancel it).
- **Turn end** — `turn-end` audio event + phase pulse.

## Color

All tokens live in `src/index.css` under `:root`. Values below are the
default theme; `:root[data-contrast='high']` overrides a subset for a
higher-contrast mode (see Accessibility).

| Token | Value | Role |
|---|---|---|
| `--bg` | `#1e1208` | Page background (near-black cocoa) |
| `--surface` | `#2d1c12` | Panel/card surfaces |
| `--surface-light` | `#3d2a1a` | Raised surface variant |
| `--surface-accent` | `#4a3522` | Highlighted surface variant |
| `--text` | `#e8dcc8` | Primary text (warm cream) |
| `--text-muted` | `#a89070` | Secondary/label text |
| `--gold` | `#d4a850` | Primary accent — CTAs, focus rings, emphasis glow |
| `--gold-dim` | `#b88a38` | Recessed gold (borders, dim accents) |
| `--border` | `#5a4030` | Default hairline border |
| `--border-light` | `#7a5a3e` | Lighter hairline (hover, scrollbar thumb) |
| `--teal` | `#4a90a0` | Secondary interactive accent |
| `--teal-hover` | `#5aa0b0` | Teal hover state |
| `--accent-red` | `#c04030` | Danger/negative accent |
| `--accent-green` | `#6a8a40` | Positive accent |

**Ware colors** (map 1:1 to the 6 physical ware tokens in
`public/assets/tokens/`):

| Token | Value | Ware |
|---|---|---|
| `--ware-trinkets` | `#c2a8e0` | Trinkets (lavender) |
| `--ware-hides` | `#c29f7a` | Hides (tan) |
| `--ware-tea` | `#b1a64b` | Tea (olive) |
| `--ware-silk` | `#d45a4d` | Silk (red) |
| `--ware-fruit` | `#f3c35b` | Fruit (amber) |
| `--ware-salt` | `#fafafa` | Salt (white) |

**Card-type colors** (header accent per card type in `CardFace.tsx`):

| Token | Value | Card type |
|---|---|---|
| `--card-people` | `#5a8ab0` | People |
| `--card-animal` | `#D4A574` | Animal |
| `--card-utility` | `#6a9a50` | Utility |
| `--card-ware` | `#C9A84C` | Ware |
| `--card-stand` | `#8B7355` | Small Market Stand |

**High-contrast mode** (`data-contrast="high"`) brightens `--text`,
`--text-muted`, `--border`, `--border-light`, `--gold` and darkens
`--surface*` slightly, for better legibility without changing the palette's
character.

Contrast: `--text` (`#e8dcc8`) on `--bg` (`#1e1208`) is ~13.7:1 — comfortably
AA/AAA for body text. `--text-muted` on `--bg` is ~6.2:1 — AA for normal text.
`--gold` on `--bg` is ~7.9:1.

## Type

Single family for both display and body — **Judson** (serif), self-hosted:

```css
--font-heading: 'Judson', Georgia, serif;
--font-body: 'Judson', Georgia, serif;
```

Files (in `public/assets/fonts/`, loaded via `@font-face` in `src/index.css`):
- `Judson-Regular.ttf` — weight 400, normal
- `Judson-Italic.ttf` — weight 400, italic
- `Judson-Bold.ttf` — weight 700, normal

All three declare `font-display: swap`. Fallback stack is `Georgia, serif` —
a metrically-similar serif so layout doesn't jump before Judson loads.

There is no formal numeric type scale (no `--font-size-*` tokens) — sizes are
set per-component in px, in a narrow practical range:

| Size | Used for |
|---|---|
| 12px | `.ui-helper-text`, `.disabled-hint` — smallest supporting text |
| 13px | `.center-row-recap` — center-row action recap |
| 14px | `.panel-section-title`, `.ui-prompt-text` — section labels, prompts |
| 1rem (16px) | Default body text, buttons |
| Larger (component-set) | Headings (`h1`–`h6`), inherit `--font-heading` at whatever size the component sets |

`h1`–`h6` share `line-height: 1.2` and `letter-spacing: 0.012em`. Body text
uses `line-height: 1.45` and `letter-spacing: 0.01em` (set on `:root`/body).

## Spacing & Radius

No formal spacing scale token set — components use literal px values
(4/6/8/10px small gaps, 12–18px section gaps). The two radius values that
recur as the system's actual "scale":

| Radius | Used for |
|---|---|
| `4px` | Scrollbar thumb/track |
| `7px` | `.center-row-recap` |
| `8px` | Card art / mega-view art corners |
| `10px` | Cards, dialogs (small), panels |
| `14px` | Dialogs (large) — `CardPlayDialog`, draw dialog, `PanelShell` |
| `999px` (pill) | `.center-row-action-tag` |

## Shadow

No token set — shadows are composed inline per component from a consistent
palette of black-alpha values:
- Small lift: `0 2px 6px rgba(0,0,0,0.3)` – `0 2px 8px rgba(0,0,0,0.3)`
- Card/panel: `0 4px 12px–16px rgba(0,0,0,0.24–0.3)`
- Dialog (large): `0 8px 32px rgba(0,0,0,0.45–0.5)`
- Gold emphasis glow: `0 0 24px rgba(212,168,80,0.35)` (`.turn-emphasis-active`)
- Inset "etched" bevel: `inset 0 1px 0 rgba(232,220,200,0.08), inset 0 -1px 0 rgba(15,8,4,0.4)` (`.etched-wood-border`)

## Motion

All duration/easing tokens live in `:root` and are overridden wholesale under
`:root[data-anim-speed='fast']` (roughly 65–75% of default duration). Every
animation respects `prefers-reduced-motion: reduce`, which disables all of
the decorative pulse/flash/float/trail animations outright (see the
`@media` block at the bottom of `index.css`).

**Easings:**
| Token | Curve | Use |
|---|---|---|
| `--anim-ease-standard` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Default for most transitions/animations |
| `--anim-ease-emphasis` | `cubic-bezier(0.18, 0.89, 0.32, 1.12)` | Overshoot — pulses/pops that need a "snap" |

**Base durations:**
| Token | Default | Fast mode | Use |
|---|---|---|---|
| `--motion-fast` | 150ms | 110ms | Micro-interactions (button hover, border-color) |
| `--motion-base` | 220ms | 160ms | Standard transitions (turn-emphasis glow) |
| `--motion-slow` | 320ms | 220ms | Slower/larger transitions |

**Named event durations** (each has a `-soft`/base/`-strong` trio, tuned per
how big the underlying event is):
| Token family | Default range | Fires on |
|---|---|---|
| `--anim-trail-duration` | 920ms | Card draw/discard trail across the center row |
| `--anim-discard-reveal-delay` | 920ms | Discard pile reveal |
| `--anim-action-tag-duration` | 1100ms | "Played X" tag over the center row |
| `--anim-pile-pulse(-soft/-strong)` | 450–720ms | Deck/discard pile pulse on draw/discard |
| `--anim-phase-pulse` | 450ms | Phase indicator pulse on phase change |
| `--anim-market-flash(-soft/-strong)` | 850–1000ms | Market slot flash on ware add/remove |
| `--anim-gold-pop(-soft/-strong)` | 320–550ms | Gold total "pop" scale on change |
| `--anim-gold-delta(-soft/-strong)` | 950–4500ms | Floating +/-Ng delta text/arrow |

Keyframes are named descriptively (`pilePulse`, `marketSlotFlash`,
`goldDeltaArrowUp/Down`, `trailDrawTop/Bottom`, `trailDiscardTop/Bottom`,
`tvActionTagFade`, etc.) — see `src/index.css` for the full set.

## Components

- **Buttons** — base style: `--font-heading`, 10px radius, subtle white-alpha
  fill, gold border+tint on hover, 0.4 opacity when disabled.
  - `.primary` — green outline/fill, for the affirmative action (Buy, confirm).
  - `.danger` — red outline/fill, for negative/destructive actions.
  - `.brown` — warm-brown outline/fill, tertiary action.
  - Focus-visible on all interactive elements: 2px gold outline, 2px offset.
- **Cards (`CardFace.tsx`)** — art-backed where available (53 of 51 unique
  designs have art in `public/assets/cards/`, ware variants share a few
  images), linen-textured fallback face otherwise; type-colored header
  accent bar; four size variants (`small`/`medium`/default/`large`/
  `extraLarge`); lift-on-hover when clickable; gold ring when `selected`.
- **Card back** — dedicated `card_back.png` art (woven-basket motif), used
  for the deck and any face-down card.
- **Dialogs** (`CardPlayDialog`, draw-card dialog, `MegaView`, `PanelShell`)
  — consistent shape: dark scrim overlay (`overlay-fade`) → `linen-texture`
  panel with `dialog-pop`/`panel-slide` entrance, 2px `#a89880` border, large
  dialog shadow, card art + coin art + ware-color pips laid out the same way
  across buy/sell, resolution panels, and the zoom view.
- **`.etched-wood-border`** — a reusable bevel/border treatment (inset
  highlight + inset shadow + drop shadow) for wood-panel-style containers.
- **Turn emphasis** (`.turn-emphasis-active`/`-inactive`) — gold glow +
  border on the active player's panel, dimmed opacity on the inactive one.
- **Buttons on linen** — any `button` inside a `.linen-texture` surface
  (dialogs, resolve panels) automatically switches to an **ink palette**:
  default → `#3a2a1a` text / `#8a7560` 2px border; `.primary` → `#1f5a24`
  on `#2e7d32`; `.danger` → `#8f2016` on `#b8322a`; `.brown` → `#6a3e14`;
  no text-shadow; disabled 0.45 opacity. Never style a linen-surface button
  inline to fix contrast — the context rule owns it.
- **End Turn** (`.end-turn-button` + `.action-pips`/`.action-pip`/
  `.action-pip-spent`) — the signature commit control. Red gradient
  (`#c04030`→`#a03020`), `#ff6b5a` border, slow `endTurnShimmer` glow
  (2s alternate; off under reduced motion and when disabled), press physics
  (hover `scale(1.04)`, active `scale(0.97)`). Five gold pips under the
  label show actions left; spent pips go `rgba(90,64,48,0.5)`. Shared by
  `GameScreen` and `PlayerScreen` — previously two inline copies plus a
  `<style>` tag injected at runtime from `GameScreen.tsx`.
- **Cancel ✕ on resolve panels** (`.panel-cancel-x`) — 40px dark disc with
  a gold-dim ring, top-right of the panel over the card art; Esc does the
  same. Shown only while the active player can still back out of the card
  or utility they just started (engine `CANCEL_ACTION`, see
  `src/engine/cancelAction.ts` for exactly which cards and steps qualify).
  Label: "Cancel <card> and get your action back".
- **Resume Game** (`.menu-action-resume` + `.menu-action-sub`) — takes the
  primary slot on the main menu when an unfinished local game is saved, with a
  one-line summary ("vs Hard AI · turn 12 · you 34g · AI 28g"); Play Solo
  drops to a normal button. A refresh mid-game skips the menu entirely.
- **Rejoining screen** — while a refreshed Cast tab reconnects to its room:
  "Room 1234 / Rejoining your game…" with a Cancel, so the menu or code
  entry never flashes.
- **Keep & Buy / Keep & Sell** (`.keep-and-play`) — in the draw dialog when
  the drawn card is a ware card: keeps it and plays it in one tap (exactly
  `KEEP_CARD` then `PLAY_CARD`, same action cost). Validated against the
  post-keep state (`keepAndPlayOptions()` in `uiHints.ts`); an unavailable
  option is disabled with its reason as the tooltip, or as the hint line when
  neither works. The drawn card's coins carry BUY/SELL captions too.
- **Coin captions** (`.coin-caption`) — "BUY"/"SELL" under the coin art in
  `CardPlayDialog`. The coins were already the buttons; nothing said so.
- **Dialog / panel art** (`.dialog-card-art`, `.panel-source-art`,
  `.panel-source-art-compact`) — the card illustration at the top of the
  draw, buy/sell and resolve dialogs. Full card on tall screens; on short
  screens it becomes a cropped banner (`object-fit: cover`, focus 30% from
  top) so the controls below never leave the viewport.
- **Player toast** (`.player-toast`) — card-level validation errors are
  repeated as a bottom-center toast (5s, slides up), because the red
  overlay on a fitted phone card can be as small as ~45px wide. The overlay
  text now scales `clamp(10px, 3vw, 14px)` and clips instead of spilling.
- **Resolution breadcrumbs** — `formatResolutionBreadcrumb()` never shows raw
  enum codes any more ("WARE > SELECT > MULTIPLE" → "Choose a Ware Type",
  "Utility > kettle > SELECT_CARD" → "Kettle > Select Card"). New types need
  a `RESOLUTION_LABELS` entry or fall back to `humanizeToken()`.
- **Action tags / recap** (`.center-row-action-tag`, `.center-row-recap`) —
  pill/rounded-rect labels over the center row announcing the last action,
  gold-bordered when it's the opponent's.
- **Your market row** (`MarketSummary`, `.market-summary`) — every overlay
  that covers the board (draw dialog, Buy/Sell dialog, zoom view, resolve
  panels) shows the viewer's market stands: one 16px rounded square per slot
  in stand order, filled with the ware colour token, empty slots as a dashed
  outline, a 6px gap before each small stand, and "N free". Given a ware card
  it adds a sell check: green "✓ You have the wares to sell this" or "To sell,
  you still need: 1 trinket, 2 tea". `tone="onDark"` for the dark resolve
  overlay, default linen text otherwise. Dialog card art reserves +60px for it
  (`.dialog-pop:has(.market-summary) .dialog-card-art`).
- **Ware card tap target** — on a playable ware card the coin/pip strip is
  part of the card (opens Buy/Sell); it only acts as a zoom button when the
  card can't be played. Non-ware caption strips always zoom.

## Layout — Phone player view (Cast mode `PlayerScreen`)

**Rule: the phone player view never scrolls.** Everything renders inside
`100dvh` at every hand size (the official rules have no hand limit — a
20-card hand must still fit), on phones down to 360×640.

```
.player-shell            100dvh, flex column, safe-area padding, overflow hidden
├─ .player-topbar        50px: .player-gold · .player-turn-status (turn + .connection-dot
│                        + TV sync) · .end-turn-button; right 54px reserved for the
│                        fixed avatar/settings button (they used to overlap)
├─ .disabled-hint        optional one-liner
└─ .player-board         flex:1, wood panel; measured with useElementSize()
   ├─ .player-board-section-head   "Your Utilities" · n/3
   ├─ utilities row      height = min(27% of board, 200px), 1 row, fitted
   ├─ .player-board-section-head   "Your Hand · n" · "k actions left"
   └─ .player-hand-box   flex:1 → HandDisplay layoutMode="fitRows"
```

Card sizing is done by `fitCardsToBox()` (`src/ui/fitLayout.ts`): for 1…
`maxRows` rows it computes the largest card that fits the box by height and
by width (side by side with an 8px gap, tightening the gap, then overlapping
up to **55%** of a card), and picks the layout with the largest **visible**
card area (`(width − overlap) × width`) — so a big-but-buried single row
loses to two rows of slightly smaller cards. Hands cap at scale 1.4,
utilities at 1.1; floor 0.3 (a 24-card hand on a 360×640 phone still
fits). Unit-tested for 1–24 cards across three real phone box sizes
(`tests/ui/fitLayout.test.ts`).

Dialogs layered on top (draw, buy/sell, resolve panels) keep their controls
on screen via the cropped-banner art classes above.

**Dev preview**: `/?player=1` renders `PlayerScreen` from the local store
with no server (like `/?tv=1`). Staging params: `hand=N`, `utils=N` (≤3),
`phase=play`. Cards are moved out of the deck, so invariants hold and the
game stays playable.

## Layout — Phone solo / hotseat board (`GameScreen` ≤ 640px)

Same rule as the Cast player view: **never scrolls**, 100dvh, down to
360×640. `useMediaQuery(PHONE_MEDIA_QUERY)` (`(max-width: 640px)`) swaps
GameScreen's main area for a phone layout; desktop is untouched, and every
overlay (dialogs, resolve panels, settings, endgame) is shared. The game-log
sidebar is hidden on phones.

```
.player-shell.phone-game
├─ .player-topbar        your gold (+delta) · "You · your turn" / hand count or
│                        Wise Man modifiers · End Turn
├─ .phone-opp-wrap       OpponentArea compact: name · gold · cards, market
│  [data-center-target=top]   (fitMarketSlots, ≤26px, wraps), .utility-chips,
│                        AI chatter as .speech-pill
├─ CenterRow compact     piles at 0.62× (60×79), slim phase box, recap over it
├─ .disabled-hint
└─ .player-board         [data-center-target=bottom]
   ├─ Your Market n/total   fitMarketSlots (≤30px, wraps to 2 rows past ~10)
   ├─ Your Utilities n/3    fitted row; share of board height 24% → 20% → 16%
   │                        as the hand passes 8 / 12 cards
   └─ Your Hand · n         .player-hand-box, measured, fitCardsToBox(fitRows)
```

`fitMarketSlots()` keeps a market on one row while slots stay ≥ 24px, then
wraps (a market can reach 21 slots). At the legibility floor (scale 0.3,
42px cards — e.g. 20 cards + two 21-slot markets on 360×640)
`fitCardsToBox()` holds the size and overlaps past 55% instead of
overflowing. Both screens measure the hand box directly
(`useElementSize`) and only fall back to an estimate before first paint.

New phone components:
- **`.utility-chips` / `.utility-chip`** (`UtilityChips` in
  `UtilityArea.tsx`) — the opponent's utilities as 26px pills: round art
  thumb + name; used ones dimmed + struck through; tap to zoom.
- **`.speech-pill`** (`SpeechBubble compact`) — AI chatter as a cream pill
  hanging off the opponent strip; the 240px bubble art covered the whole
  center row on phones.
- **Compact center row** (`CenterRow compact`, `.center-row-compact`).
- **Adaptive card captions** (`CardFace`) — below 100px rendered width the
  caption drops the description and ellipsizes the name; below 70px pips are
  9px and coins 12px. Named sizes on desktop (140/120/96) render exactly as
  before.

## Backgrounds & Texture

- **Page background**: `wood_1.png` (a wood-grain panel photo/illustration)
  under a dark scrim (`rgba(20,10,5,0.85)` double-layered), `background-size:
  cover`, fixed to `--bg` as fallback.
- **Main menu background**: `main_menu.png` at 25% opacity behind the menu
  content, over the same dark scrim.
- **`.linen-texture`** (added this pass, see Changelog) — a 4-layer CSS
  crosshatch gradient (`0deg`/`90deg` at 0.08 alpha, `135deg`/`45deg` at 0.04
  alpha, 1–1.5px tile) over an `#e8e4df` base — the cream "card stock" finish
  used on every ware-card face and every dialog/panel body. Defined once in
  `src/index.css`; apply via `className="linen-texture"` rather than
  reconstructing the gradient inline.

## Generated Art Inventory

All illustrated art already existed in the repo before this pass (not
generated during it). For reference/continuity, the visual register is:
warm painterly illustration, African-market subject matter (people, produce,
textiles, wildlife), consistent linework and palette across all pieces.

| Path | Role |
|---|---|
| `public/assets/menu/main_menu.png` | Main menu backdrop |
| `public/assets/panels/wood_1.png` | Page background wood panel |
| `public/assets/cards/*.png` (53 files) | Per-card-design illustrations + `card_back.png` + `cards_fanned_out.png` (tutorial/menu use) |
| `public/assets/tokens/{trinkets,hides,tea,silk,fruit,salt}.png` | Ware token icons |
| `public/assets/coins/coin_{3,4,5,10,11,12,18}.png`, `coins.png` | Gold-value coin art used in buy/sell dialogs |
| `public/assets/bubble/speech_bubble.png` | AI/opponent speech bubble chrome |

## Sound

**Background music** (`useBackgroundMusic.ts`) — 5 tracks in
`public/audio/`, shuffled into a playlist, one DOM-attached `<audio>`
element (required for Chromecast compatibility), 0.15 base volume, singleton
guard against double-playback:
- `African_Village_Afternoon_Soundscape.mp3`
- `Market_Morning_Mosaic.mp3`
- `River_Paths_Village_Hearts_Voice.mp3`
- `Sun_In_Our_Hands.mp3`
- `Sun_on_the_Courtyard.mp3`

**Sound effects** — 6 short clips in `public/audio/sfx/`, played in **every
mode**. `detectAudioEvent()` (`src/multiplayer/audioEvents.ts`) maps a game
action to an event; the Cast server broadcasts it to phones + TV, and the
solo/hotseat `GameScreen` plays it locally via `useLocalActionAudio()`
(`src/ui/useAudioEvents.ts`) for every applied action, human or AI. Played at
50% of the user's volume (`SFX_BASE_VOLUME`), never when muted.

| Event | Fires on | File | Length | Peak | Sound |
|---|---|---|---|---|---|
| `card-draw` | `DRAW_CARD` / `KEEP_CARD` | `card-draw.mp3` | 0.47s | -6 dB | soft paper swish |
| `coin` | playing a ware card (buy or sell) | `coin.mp3` | 0.94s | -3 dB | brass coins clinking onto a pile |
| `card-play` | playing a people/utility card | `card-play.mp3` | 0.50s | -4 dB | card tapped onto a wooden table |
| `attack` | playing an animal card | `attack.mp3` | 1.44s | -2 dB | short big-cat growl |
| `turn-end` | `END_TURN` | `turn-end.mp3` | 1.23s | -2 dB | single deep djembe hit |
| `guard` | Guard played as a reaction | `guard.mp3` | 0.73s | -1.5 dB | spear shaft on a hide shield |

Mix intent: table sounds (draw, play) sit low so a busy turn never gets
noisy; the confrontations (attack, guard) and the turn boundary are loudest.

**How they were made** (ElevenLabs `eleven_text_to_sound_v2`, flow "Jambo
SFX", 3 takes each, 2026-10-04). Register: warm, organic, hand-made market —
paper, brass, wood, hide, drum; never synth/sci-fi. Prompts:

| Event | Prompt | Take used |
|---|---|---|
| card-draw | Single paper playing card sliding off a deck, crisp soft swish, close-mic | c, cut to the swish (0.24–0.66s) |
| coin | A few brass coins dropped onto a pile of coins, bright metallic clink, close-mic | b |
| card-play | Thick playing card slapped down onto a wooden table, firm soft tap, close-mic | b |
| attack | Short aggressive big cat snarl, quick throaty growl, close-mic | a |
| turn-end | Two soft djembe drum hits, warm deep wooden resonance, short | c (one hit + tail) |
| guard | Wooden spear shaft striking a taut hide shield, solid thud with a leather slap | b |

Takes were chosen from waveform/spectrogram + loudness analysis (duds at
-48/-55 LUFS, multi-hit or 4–7s takes rejected), then: leading silence
removed, trimmed, faded out, peak-normalized to the levels above, mono
44.1 kHz VBR MP3 (`-q:a 4`). Regenerating one: same prompt, then the same
trim/fade/peak treatment; keep each under ~1.5s.

Volume/mute are user-controlled and persisted via `audioSettings.ts`
(`localStorage`, keys `jambo.volume`/`jambo.muted`), read by both hooks
through `getEffectiveVolume()`.

## Accessibility

- **Contrast**: default theme is already high-contrast by nature (dark wood
  + cream text); a `data-contrast="high"` mode exists for further brightening.
- **Linen contrast** (2026-10-03): default buttons on linen were cream on
  `#e8e4df` (1.07:1) and `.primary` green `#4caf50` 2.2:1. Ink palette on
  linen: default 10.9:1, primary 6.5:1, danger 7.0:1, brown 7.2:1,
  coin caption 7.0:1 (≥5.9:1 even over the primary button's green tint).
- **Focus**: every interactive element gets a 2px gold `outline` with 2px
  offset on `:focus-visible`.
- **Reduced motion**: `prefers-reduced-motion: reduce` disables every
  decorative animation (pulses, flashes, floats, trails, action tags) via a
  single `@media` block — motion is purely additive polish, never load-bearing
  for reading game state.
- **Mute control**: `audioSettings.ts` exposes mute/volume, surfaced in the
  Settings screen.

## Asset Inventory (this pass)

| File | Role | Status |
|---|---|---|
| `public/audio/sfx/{coin,card-play,card-draw,turn-end,attack,guard}.mp3` | Sound effects, all modes (see Sound) | Generated 2026-10-04 (ElevenLabs), 3–15 KB each |
| `design-system.html` | Static showcase page, tokens/components rendered live from `src/index.css` | Added this pass |

No new illustrated art, fonts, or background music were generated — the
existing set already covers the full identity; this pass's job was
documenting it, fixing one duplication, and identifying the SFX gap.

## Changelog

### 2026-10-04 — Market visible under dialogs; coin strip opens Buy/Sell
- New `MarketSummary` row in the draw, Buy/Sell, zoom and resolve overlays,
  so the player can see their wares (and what a card still needs to sell)
  while the board is covered.
- Tapping a ware card's coins opens Buy/Sell (was a dead-end zoom).
- Zoom view width is `min(380px, 100vw - 16px)` (overflowed 360px phones) and
  its art is capped at `100dvh - 260px`.

### 2026-10-04 — Playtest fixes
- Phone layout no longer breaks after the tutorial / pass-device screen
  (late-mounted board was never measured; see LESSONS.md).
- Auctions stay visible read-only during the AI's bid (`shouldShowResolvePanel`).
- `.panel-source-art` keeps a 45vh cap on tall screens (was uncapped ≥900px,
  pushing Dancer's Confirm below the fold).

### 2026-10-04 — Drawn ware cards can be bought straight from the draw dialog
- Reported: on turn 1 a drawn six-ware card "had no buy or sell indicator".
  The draw dialog showed its coins unlabelled with only Keep/Discard; buying
  required keeping it, then finding it in the hand. Added coin captions and
  Keep & Buy / Keep & Sell. The dialog now reserves the hand strip's height
  (it overlapped on short phones) and ware dots shrink on narrow screens
  (`clamp(30px, 9vw, 44px)`) so six fit in two rows.
- Error wording: one shared `friendlyPlayError()`; selling without the wares
  no longer says "no wares available to buy or sell", and gold errors quote
  the real cost (incl. the 6th-space fee).

### 2026-10-04 — Refresh-proof games
- Resume Game button and a Rejoining screen (see Components). A refresh no
  longer returns to the menu in solo, hotseat, or Cast play.

### 2026-10-04 — Sound effects generated and playing in every mode
- Closed the long-standing SFX gap: 6 clips generated with ElevenLabs (3 takes
  each), best take picked per event, trimmed/faded/peak-balanced (see Sound).
- They were Cast-only; solo and pass-and-play now play them too, via the
  shared `detectAudioEvent()` mapping. Tests assert the mapping and that every
  file exists and stays small.
- Showcase: the Sound section has a play control per effect.

### 2026-10-04 — Cancel a just-started card or utility
- New `.panel-cancel-x` on resolve panels, backed by a `CANCEL_ACTION` engine
  action that refunds the action and the card / utility use. Offered only
  before the first choice and only where backing out reveals nothing and
  undoes no opponent decision.

### 2026-10-04 — Phone solo/hotseat board fits the screen
- `GameScreen` gets a phone layout (≤640px): top bar, compact opponent strip
  (wrapping market, utility chips, speech pill), compact center row, fitted
  board. Before: 1048px page on an 894px phone and the center row clipped
  the deck off-screen below ~420px. Verified 0px overflow at 360×640,
  375×667, 390×844 for 5/10/20-card hands, 3 utilities each side, and 6/12/21
  slot markets; hotseat checked on 375×667; desktop unchanged.
- `fitCardsToBox` overlaps past the cap at the legibility floor instead of
  overflowing; new `fitMarketSlots`; both screens size the hand from the
  measured hand box; utilities yield height to big hands.
- `CardFace` captions adapt to rendered width (no more full descriptions
  spilling out of 45px cards).

### 2026-10-03 — Polish pass: phone player view fits the screen, linen contrast, End Turn component
- **Phone player view never scrolls** (user priority for this pass). Before:
  fixed 1.25× cards in a hard-coded two-row layout — 8+ cards overflowed to
  849px on a 667px phone, the hand clipped off the right edge, and the
  avatar button sat on top of End Turn. Now: `.player-shell` (100dvh) +
  top bar + measured board, with `fitCardsToBox()` sizing utilities and hand
  (see Layout). Verified 0px overflow at 360×640, 360×740, 375×667, 390×844
  for hands of 0–20 and 0–3 utilities, and for every reachable resolve /
  draw / buy-sell dialog.
- **Top bar** replaces the floating gold/End-Turn/connection bits: gold,
  turn status, connection dot (was a fixed "Connected" label over the
  cards), TV-sync status (was a fixed label over the cards).
- **Linen-surface buttons** get an ink palette via a context rule — fixes
  unreadable (1.07:1) Skip Draw Phase / Decline / Pass and low-contrast primary/danger.
- **End Turn** promoted to `.end-turn-button` (+ `.action-pips`), shared by
  both screens; removed `GameScreen.tsx`'s runtime-injected `shimmer`
  keyframes; shimmer now respects reduced motion.
- **Buy/Sell captions** under the coin buttons; dialog/panel art crops to a
  banner on short screens; card-error toast + scaled overlay text;
  human-readable resolution breadcrumbs.
- Added `/?player=1` dev preview, `HandDisplay` `fitRows` mode,
  `UtilityArea` `gapPx`, `useElementSize()`. Tests: `fitLayout`,
  `devPlayerPreview`, breadcrumb humanization.
- Showcase: new "Components — 2026-10-03 polish pass" section.

### 2026-09-24 — Initial `DESIGN.md`, showcase page, linen-texture consolidation
- Wrote this document from scratch (none existed before) by reading
  `src/index.css`, `CardFace.tsx`, `ActionButtons.tsx`, `InteractionPanel.tsx`,
  `MegaView.tsx`, the audio hooks, and the asset directories.
- **Fixed**: the "linen finish" background (crosshatch gradient over an
  `#e8e4df` base) was hand-duplicated as local `LINEN_BG`/`LINEN_BG_SIZE`/
  `LINEN_BASE` constants in 6 separate places across `CardFace.tsx`,
  `ActionButtons.tsx` (×2), `InteractionPanel.tsx` (×2), and `MegaView.tsx`.
  Consolidated into a single `.linen-texture` class in `src/index.css`;
  all 6 call sites now use `className="linen-texture"`. Purely a
  consistency/maintainability fix — no visual change.
- **Identified but not fixed**: `useAudioEvents.ts` / `server.ts` wire a
  complete SFX system end-to-end, but the 6 audio files it expects don't
  exist in the repo. Generation attempted via ElevenLabs, blocked by
  account credit quota — see Sound section for the exact prompts/mapping to
  use on retry.
- Added `design-system.html` as a static, build-step-free showcase of the
  above tokens/components, pulling real values from `src/index.css`.
