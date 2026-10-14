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
  same. Shown on **every** screen of a card or utility the active player
  started, until the opponent is involved: a Guard decision, a bid, a draft
  pick, or an opponent choice (2026-10-12, cancel-anywhere). Cancelling
  restores the state from just before the play (`cancellableAction.restore`),
  so cards a step already showed you (Scale, Psychic, Arabian Merchant) go
  back where they were. Scale draws its two cards as it starts. Label:
  "Cancel <card> and get your action back".
- **Landing page** (`MainMenu.tsx` + `screens/Landing.css`, all `.landing-*`;
  2026-10-12, from the web-game landing research) — two columns on desktop
  (framed hero art with the wordmark, a fan of real cards hanging off its
  bottom edge, and a looping "sell 3 tea · 10 gold" demo tray; then a plate
  with the pitch line and the buttons), one column on phones with Play inside
  the first screen.
  - **One gold button** (`.landing-cta`, the only filled button): *Resume
    game* (with the save summary) when a local game is saved, otherwise
    *Play vs {trader}* — one click, against the trader picked in the row of
    four portraits below it (remembered in `jambo.lastTrader`). With a save,
    *New game vs …* and *Pass & play* ask before overwriting it.
  - **Modes named by task** (`.landing-secondary`, outlined): Pass & play,
    Play a friend (opens the friend lobby; never asks about a saved game,
    because it doesn't touch it), Play on TV (only when Cast is configured;
    opens the TV setup modal), Join a TV game (`#/play`).
  - **Footer links**: How to play · Settings · Sound on/off. The win/loss
    chip only shows once a game exists — never a 0–0.
  - **Account chip** (`.landing-account`, top right) is the one sign-in /
    sign-out point.
  - Motion: art and panel fade up, cards deal in, then breathe; the demo card
    lifts as its tea leaves and +10g rises; the gold button glints every
    ~6.5s. All of it pauses while a modal is open (`.landing-dimmed`) and is
    off under reduced motion / `data-ambient="off"`.
  - The Cast "Rejoining…" screen and settings shell still use the older
    `.main-menu-*` / `.menu-action` classes — restyling the landing never
    touches them.
- **Player tableau** (`.tableau`, `TableauCorners` in `Tableau.tsx`; 2026-10-12)
  — both seats' desktop panels in the turn plaque's metalwork: lacquered
  panel lit from above, double brass rim (3px dark + 1px brass inset),
  brass corner brackets with studs, and a band of lamplight that crosses the
  panel once when the turn reaches it (`tableauSheen`, off under reduced
  motion). Inside:
  - **Labels** — plaque eyebrows: a short brass rule, gold-gradient caps,
    and a `.tableau-count` chip ("5/9", "2/3", hand size). Phone and Cast
    boards (`.player-board`) use the same labels and chips.
  - **Market** — slots are carved wells (`.market-slot`; a filled well
    glows faintly in its ware colour via `--ware-c`). The board market groups
    slots into real stands (`marketStands()`: large stand, then 3 per small
    stand), each on a wooden shelf (`.market-stand-shelf`). A long market
    wraps whole stands. Dialog copies and the compact phone row stay one
    flat row, because `fitMarketSlots()` assumes it. The paid 6th space is
    a worn brass coin (`.market-slot-fee`).
  - **Utilities** — empty spaces are recessed felt sockets with a stitched
    edge and an embossed diamond (`.empty-card-slot-mark`). The utility row
    never shrinks, so it never wraps to two rows.
  - **Seat** — gold-gradient name on your turn, a minted coin beside a
    gradient gold total (`.seat-coin`, `.seat-gold-num`; the rising glint is
    a filter because gradient text can't take a text-shadow).
  - **Hand** — a stitched leather mat (`HandDisplay mat`, `.hand-mat`)
    replaces the dashed box.
- **How to play** (`TutorialOverlay.tsx` + `tutorial/Tutorial.css`, all
  `.tut-*`; content and rules in `tutorial/tutorial.ts`; 2026-10-12, from the
  web-game tutorial research) — the landing's framed plate as a dialog
  (full-height sheet on phones) with seven named chapter tabs (✓ once seen):
  Goal → Your turn → Trade → Cards → Stall → Attacks → Tips. Goal first, then
  generic → specific.
  - **A guide**: Mama Zawadi's portrait and a parchment bubble beside the
    stage (a strip above it on phones); her mood turns pleased when you get
    something right.
  - **Do, don't read**: Trade is hands-on — real Tea Stall card, a purse and a
    six-space stall; Buy and Sell follow the engine's rules (disabled with the
    reason). Cards: tap any of five real cards for its database description.
  - **One gold button** (`.tut-cta`), only on the last chapter: *Play vs
    {trader}* from the menu (or *Done* when a save exists), *Start playing*
    on first run, *Back to the game* from the in-game menu. Skip/✕/Esc
    always close; ←/→ move between chapters; focus is trapped and restored.
  - Closing it anywhere sets `jambo.tutorialSeen`, so reading it from the menu
    means the first game doesn't show it again.
  - Numbers come from the engine's `CONSTANTS` and the card database; a test
    holds them there.
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

- **Turn plaque** (`.turn-plaque`, in `CenterRow`; 2026-10-12) — the brass
  plaque between deck and discard: studs, a rule-flanked eyebrow ("Turn 7 ·
  Your turn" / "Sam's turn"), the phase in large type, a gem, and the
  actions left as minted coins in carved sockets (`.turn-plaque-coin`,
  `-spent` goes dark). `-mine` on your turn, `-compact` on phones, the
  endgame line inside it when the game is ending.
- **Seat block** (`SeatInfo`, `.seat-name`/`.seat-gold`/`.seat-coin`) — the
  same block for every seat: portrait (trader art, your Google/account
  avatar, or the **avatar silhouette** `.avatar-silhouette` when there's no
  picture), name (gold gradient on that seat's turn), a minted coin and the
  gold total, card count. Online, the friend's block takes the trader's
  place, with a presence dot on the portrait.
- **Card tilt & glare** (`.card-tilt`, `.card-tilt-glare`, `cardTilt.ts`;
  2026-10-12) — a card leans toward the pointer (`tiltFromPointer`) and
  catches a soft light; the zoomed card follows a dragging finger, hand
  cards a mouse only (a tap means play). Cards with art layers
  (`PARALLAX_LAYERS`, e.g. Dancer) slide each layer by its own depth. Off
  under reduced motion.
- **Wise Man coins** (`.ware-coin.ware-coin-deal`, `WareCoin.tsx`) — with a
  Wise Man in play, ware prices are drawn in CSS with a green ring, since
  there's no coin art for those numbers. They come from
  `effectiveWarePrices()`, the same function the engine charges with.
- **Utility states** — ready (`.utility-ready`, a slow ember), used
  (`.utility-card-tapped`, turned sideways like a tapped card, art still
  visible, "Used" pill), and **unusable right now** (`.utility-unusable`,
  faded, `aria-disabled`, the engine's reason as the tooltip — from
  `computeUtilityHints`, which asks `validateActivateUtility`). A utility
  being *used* turns sideways in the spotlight in place
  (`destination: 'inPlace'`); it doesn't fly anywhere.
- **Draw dialog** — the linen plate with Draw Card (gold-coin pips for the
  actions left, `.draw-pips`/`.draw-pip`, spent ones dark) and Skip Draw
  Phase. Deck and discard share a width (`.center-side-slot`); an empty pile
  is an `.empty-card-slot`.
- **Flights** — rule: a flight starts and lands on a real place: a pile, a
  hand (the opponent's card fan), a utility row, a market slot, or the card
  that owns the effect (Elephant's pool gathers on the Elephant). "The table"
  is only a fallback. Flying cards render a real `CardFace`
  (`.flight-card .card-face`), never bare art.
- **Resolve panels** (`.resolve-body`) — linen body; ware choices are
  `.ware-pick` buttons (`-waiting` while the other player picks), the
  footer cancel is `.resolve-cancel`. Throne asks for **your** ware first
  (give, then take).
  The source card is the **full card face** (`.resolve-source`,
  `CardFace fill`: art, name/text or ware strip, 3:4, never cropped) in the
  **upper left**, title and controls beside it (`.resolve-panel-with-card`
  grid; card 150–200px, 110–150px under 760px tall). Phones (≤600px): an
  84px card beside the title, controls full width below (`.resolve-body` is
  `display: contents` there so button styles still apply). 2026-10-13.
- **Auction board** (`.auction-board`) — the current bid on a coin
  (`.auction-coin`, "–" before any bid), who leads (`.auction-leader-mine` /
  `-theirs`, by name online: "Sam leads"), both purses (yours left, the
  opponent's right in red, "Sam's gold" — what they can still bid), Bid/Pass, and while
  the other side decides "Waiting for Sam's bid…" with animated dots.
- **Settings panel** (`SettingsPanel.tsx` + `SettingsPanel.css`, all
  `.settings-*`; 2026-10-12) — one panel in the main menu, the in-game menu
  and the Cast phone, over `preferences.ts`: sections with an icon and title,
  rows with a label and hint, switches (`.settings-switch.is-on`), segmented
  choices (`.settings-segmented`, `.settings-segment.is-active`), and a
  volume slider with mute. Add a setting in `preferences.ts`, never as local
  state in a screen.
- **Abandon / Leave** (`ConfirmButton`, `.menu-abandon`) — the in-game menu's
  "Abandon game" (solo) or "Leave game" (online) asks first, in place; the
  landing's "Abandon saved game" is the link form. Online the question is
  "Leave this game? It ends for both of you and counts as abandoned."
- **Play a friend lobby** (`FriendLobby.tsx` + `FriendLobby.css`, all
  `.friend-lobby-*`; 2026-10-13) — the landing's background and framed plate.
  Host: eyebrow "Play a friend", "Invite a friend", the room code as four gold
  digits (`.friend-lobby-digit`), the invite link in a read-only field with
  **Copy link** (gold, "Copied!" for 2s; falls back to select + copy) and
  **Share…** where the browser has `navigator.share`, a helper line, "Waiting
  for your friend…" with dots, a guest note when signed out, and Cancel.
  Friend: "Joining room 4821…", then the board. Errors (expired or full
  invite) get a title, a line, and "Back to menu". Never mentions a TV. Fits
  390×844 without scrolling; dots stop under reduced motion.
- **Presence** (`OnlinePresence.tsx`, `presence.ts`) — a dot on the friend's
  portrait (`.presence-dot-online` green, `-away` pulsing gold, `-gone`
  dark); under their name "Reconnecting… 4:32" or "Left the game"; and a
  fixed top-center banner (`.presence-banner`, never in the layout): "Sam
  disconnected — holding their seat 4:32" (counting down from the server's
  relative grace, so clocks don't matter), then "Sam is back" for 2.5s, or
  "Reconnecting to the server…" when it's your own connection.
- **Opponent left** (`.opponent-left-card` on the endgame card) — "Sam left
  the game" / "Sam didn't come back", "The game has ended.", one gold Main
  menu button (focused).
- **Coin toss with names** — online, the coin's faces are "You" and the
  friend's initial and the line says "You go first" / "Sam goes first". It
  plays once per game per tab (a refresh doesn't replay it) and plays out
  even if the friend moves while it spins.
- **Rematch status** (`.endgame-rematch-status`) — a line under the endgame
  buttons: "Waiting for Sam…" after you vote, "Sam wants a rematch", or
  "Sam left the table" (Rematch disabled).
- **Waiting hint** (`.waiting-hint`) — while the friend acts, the hint in
  the hand heading says what they're doing ("Sam is choosing a ware…"); on
  desktop it sits in the Your Hand heading row so it never adds height.

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

## Layout — Phone solo / hotseat / online board (`GameBoard` ≤ 640px)

Same rule as the Cast player view: **never scrolls**, 100dvh, down to
360×640. The board is `GameBoard.tsx`, shared by solo and pass-and-play
(`GameScreen`, the local store) and online games (`OnlineGameScreen`, the
server's views) — same layouts at every size; the online presence banner is
fixed and never takes layout space. `useMediaQuery(PHONE_MEDIA_QUERY)` (`(max-width: 640px)`) swaps
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

### Animal strikes (2026-10-13)

When an animal hits one card or ware, the target takes visible damage on the
table before it moves (`strikes.ts` plans from the log + state change,
`StrikeLayer.tsx` animates, `cardDamage.tsx` keeps the marks). A strike waits
until the opponent's spotlight queue is empty and no panel is waiting on you
(4.5s cap), then: lift + red glow → hit → hold → travel. The AI holds its next
move while one is queued or playing. z 8750 (under the spotlight).

| Animal | Target | Damage | Then | Lasts |
|---|---|---|---|---|
| Crocodile | the used utility | ragged bite cut out of the top-right corner (mask + torn edge), jaw-snap sfx | flies to the discard | while in the discard |
| Hyena | the card taken | three tooth notches in the top edge, slobber sheen, shaken | out of the victim's hand into the taker's | while in **your** hand |
| Snake | every discarded utility | fang punctures, venom spreads, card wilts/desaturates; kept cards glow gold | slide to the discard, staggered | while in the discard |
| Parrot | the stolen ware | three pecks, a chip out of the rim, black/red/white feathers | hops to the thief's slot (hidden until it lands) | while in that slot |
| Cheetah | the gold paid (not on "draw 2") | three claw rakes across the coins | streak to the payee | — |
| Guard | — | the Guard slides in front, the strike clangs off with a spark | slides away | — |

Elephant, Ape and Lion pool everything (no single target): no strike. A
strike replaces the plain flight for its move (`strikeOwnsFlight`) and the
discard trail for its card. Reduced motion: marks only, no animation.

### Center row sides: Supply tray and End Turn (2026-10-13)

- **Supply tray** (`.ware-supply-tray`, `WareSupply.tsx`): the turn plaque's
  dark plate, gold double frame and brass studs; "— SUPPLY —" eyebrow and
  "N wares left" under it. Each 40px woven basket has a gold ring that drains
  with what's left of that ware (`--left` = n/initial × 360°; amber when low,
  red when out), a brass count tag, a 1.5px staggered bob, and a token that
  lifts out / drops in when its count changes (`supplyChanges()` remembers
  the direction until the count moves again, so re-renders don't cut it).
- **End Turn** (`.end-turn-button`): a red lacquer plaque in the same frame,
  glow breathing on `::before` (opacity only), a slow sheen every ~5s, the
  pips as the plaque's gold coins / empty sockets, and the +1g bonus as a gold
  coin that wobbles to catch the eye. Hover lifts 2px, press sinks.
- **Opponent plays never land early**: while a spotlight is queued, the
  board holds the card back (`withSpotlightHolds`: a placed utility isn't in
  their row, a card for their hand isn't counted). The "Your turn" sweep
  waits the same way (spotlight queue, flights and strikes finished, 220ms
  settle, 5s cap); the draw dialog opens after the sweep, at z 9200 above the
  animation layers (turn sweep / final-turn banner at 9250).

### Landing panel: market signs (2026-10-13)

- **Play modes are hanging market signs** (`.landing-signs` > `.landing-sign` >
  `.landing-sign-board`): planks `public/assets/menu/sign_plank_a|b.webp`
  (Ideogram 4 transparent, alternating), cream painted lettering, a burnt-in
  line icon (`landingIcons.tsx`) and a one-line hint (hidden on phones). Rope
  pseudo-elements run from the plank's nails up to a wooden beam
  (`.landing-signs::before`) or the sign above. Motion: drop-in (staggered
  `--i`, one-shot), idle sway ±0.5° about the rope tops (ambient), a damped
  swing on hover (kept when ambient is off), press nudges 2px.
- **How to play / Settings / Sound** are 44px brass icon buttons
  (`.landing-iconbtn`, `aria-label` + a `data-tip` tag on hover/focus): the
  gear turns, the ledger's page lifts, the speaker's waves breathe while sound
  is on and an ✕ pops in when muted.
- **Your record** moved from a footer pill to a ledger tag beside the
  greeting (`.landing-record`): "17 won · 16 lost", a gold win-rate bar that
  fills on load, "52% won · 33 games". Hidden until there's a record.
- The selected trader's portrait breathes (2px).


## Life — the "living table" layer (2026-10-09)

Goal: the board should feel like a real market table in late-afternoon
light, not a static screenshot — small, constant, low-amplitude motion that
never competes with game feedback. Rules:

- **Transform/opacity only** (compositor-cheap; no box-shadow/size loops on
  big surfaces — the active-panel glow animates a pseudo-element's opacity).
- **Amplitude ≤ 2px / ≤ 0.5°** for idle loops; every element on its own
  phase (`--i` × a negative delay) so nothing pulses in unison.
- **Off switches**: `prefers-reduced-motion: reduce` and Settings ›
  **Ambient Motion** (`html[data-ambient="off"]`, `jambo.ambientMotion` in
  localStorage, `src/ui/life.tsx` `applyAmbient()`) both stop every loop.
  Reduced motion also stops the one-shot flourishes; Ambient off keeps them.
- **Hover physics only on `(hover: hover)`** so touch screens never get a
  stuck lift.

| Element | Class / helper | Motion | Token |
|---|---|---|---|
| Hand card | `.hand-card` > `.hand-card-inner` > `.card-face` | Deal-in (26px rise, staggered 70ms on the opening hand only), then **breathe** ±2px / ±0.35° (±0.5° when it's your turn: `.hand-live`) | `--life-breathe` 5.6s, `--life-deal` 420ms |
| Desktop hand fan | `--fan-rot` / `--fan-lift` via the independent `rotate`/`translate` properties | Arc: `min(1.8°, 10°/n)` per card, outer cards drop ≤10px. Not in `fitRows` (phone) — the fit math assumes upright cards | — |
| Playable card hover | `.card-face-playable:hover` | −8px, ×1.035, deeper shadow + gold hairline, spring | `--life-spring` |
| Market ware | `.market-slot` (inset well) > `.ware-in-slot` | Settles in (drop + overshoot) when it arrives, then bobs 1.5px | `--life-bob` 4.2s |
| Deck | `.deck-stack` + `deckThicknessShadow(n)` | Stacked edge layers, one per ~12 cards (max 8) — visibly thins | — |
| Discard | `.discard-pile` + `.discard-ghost` × ≤2 | Loose cards peeking out at −6° / +5° | — |
| Action pips | `ActionPips`, `.pip-spent-now` | Spent pip pops (×1.45, brighten) then settles | 420ms |
| Gold totals | `GoldCount`, `useCountUp()` | Number rolls (ease-out cubic, 650ms); rising totals glint | `.gold-count-rising` |
| Active panel | `.turn-emphasis-active::after` | Gold glow breathes (opacity 0.35↔1) | `--life-glow` 3.4s |
| Ready utility | `.utility-ready` | Slow gold ember ring on utilities you can still use this turn | 2.8s |
| Opponent hand | `OpponentHandFan`, `.opp-hand-card` | Card backs sway; shuffle faster while it's their turn (`-thinking`) | — |
| AI speech | `.speech-bubble` | Parchment bubble (replaces the white comic PNG), pops in with a wobble; anchored 12px left of the trader's avatar (`SeatInfo` `bubble` → `.seat-portrait-wrap`), centred on it, tail pointing at the face (2026-10-13; was a guessed offset from the panel edge) | — |
| Draw reveal | `.card-reveal` | Drawn card turns over (rotateY 90°→−8°→0) | 460ms |
| Ambience | `AmbientLayer` (`.ambient-lamp`, `.ambient-mote` × 9) | Warm lamp pool that drifts and flickers, dust motes rising through the light; fixed, `z-index:-1`, `aria-hidden` | 7s flicker, 23s drift, 24–39s motes |

**Automation gotcha**: the breathing loop means Playwright never considers
hand cards "stable", so clicks wait forever. E2E/playtest scripts must create
their context with `reduced_motion="reduce"` (or set
`localStorage['jambo.ambientMotion']='false'`).

## Layout — Desktop board (2026-10-09)

**Rule: fits the viewport with no scroll at 1440×900 and 1366×768**, and the
board never jumps when a utility lands.

```
opponent panel   Market · Utilities (3 reserved slots, small) · name / gold / card-back fan
center row       Deck stack · phase box · Discard pile ············ End Turn (right end)
your panel       Market · Utilities (3 reserved slots, medium) · "You · your turn" / 34px gold / cards / Wise Man mods
                 Your Hand (fanned)
```

- End Turn moved from under the hand (it fell below the fold at 900px) to
  the right end of the center row, beside the action count (`CenterRow`
  `endTurnSlot`).
- `UtilityArea maxSlots={3}` reserves the row: the old empty state was a
  one-line "No utilities", so the first utility pushed the whole board down
  ~90px.
- `SHORT_DESKTOP_MEDIA_QUERY` (`min-width 641px and max-height 860px`):
  hand at 0.76×, your utilities small, tighter padding.
- The opponent's name block keeps 44px right padding for the fixed
  avatar/settings button.

## Backgrounds & Texture

- **Page background**: `wood_1.png` (a wood-grain panel photo/illustration)
  under a dark scrim (`rgba(20,10,5,0.85)` double-layered), `background-size:
  cover`, fixed to `--bg` as fallback.
- **Landing hero**: `landing_hero.webp` (1920×1080) on desktop,
  `landing_hero_mobile.webp` (960² crop) on phones, shown at full strength
  inside an etched frame — never as a faded wash. No painted text in the art;
  the wordmark is live type (Judson Bold, gold with a two-step brown
  extrusion). The tutorial's Goal chapter reuses the landing hero art.
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
| `public/assets/menu/main_menu.png` | Unused since the tutorial redesign (was the main menu, then the tutorial backdrop) |
| `public/assets/menu/landing_hero.webp`, `landing_hero_mobile.webp` | Landing hero (Ideogram 4.5, 2026-10-12; wide market stall, no text) |
| `public/og-image.jpg` | 1200×630 link-preview card |
| `public/favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | The Jambo mark: a heavy Judson Bold "J" struck on a gold coin (the game's currency), dark-ink J with a brown extrusion on the `--gold` coin over the `--bg` wood tile. Tab sizes (16/32/48) drop the tile and the coin's tick ring and let the coin fill the square. Generated by `scripts/icons/build.py` (SVG + headless Chromium, real Judson font); edit `scripts/icons/icon.py` and rerun, don't hand-edit the PNGs |
| `public/assets/panels/wood_1.png` | Page background wood panel |
| `public/assets/cards/*.png` (53 files) | Per-card-design illustrations + `card_back.png` + `cards_fanned_out.png` (tutorial/menu use) |
| `public/assets/tokens/{trinkets,hides,tea,silk,fruit,salt}.png` | Ware token icons |
| `public/assets/coins/coin_{3,4,5,10,11,12,18}.png`, `coins.png` | Gold-value coin art used in buy/sell dialogs |
| `public/assets/bubble/speech_bubble.png` | AI speech bubble chrome — **unused since 2026-10-09** (replaced by CSS `.speech-bubble`) |

## Sound

**Background music** (`useBackgroundMusic.ts`) — 6 tracks in
`public/audio/`, shuffled into a playlist, one DOM-attached `<audio>`
element (required for Chromecast compatibility), 0.15 base volume, singleton
guard against double-playback:
- `African_Village_Afternoon_Soundscape.mp3`
- `Market_Morning_Mosaic.mp3`
- `River_Paths_Village_Hearts_Voice.mp3`
- `Sun_In_Our_Hands.mp3`
- `Sun_on_the_Courtyard.mp3`
- `Golden_Hour_Kalimba.mp3` (ElevenLabs Music v2.5, 2026-10-12; the others are Suno)

Songs are separated by a 20s gap (`TRACK_GAP_MS`). Under everything, a
second `<audio loop>` plays **`Market_Ambience_Bed.mp3`** nonstop at 0.1 base
volume (follows volume/mute/ducking; never pauses between songs, so it fills
the gaps): three ElevenLabs SFX v2 seamless loops — distant market hum and
footsteps (30s), stall crates/pots/cloth/coins (25s), breeze/birdsong/insects
(20s) — stacked to 300s, the LCM, so the texture doesn't repeat inside the
file and the file itself loops cleanly. **No voices, singing or melody in any
layer**: the first bed had a woman singing in one layer and it was instantly
recognisable as a loop (replaced 2026-10-12). Mixed to −20 LUFS, peak −1 dB.
The Cast receiver (`receiver/caf/receiver-app.js`) mirrors the same file,
level and gap; `tests/ui/backgroundMusic.test.ts` keeps them in sync.

**Sound effects** — 6 short clips in `public/audio/sfx/`, played in **every
mode**. `detectAudioEvent()` (`src/multiplayer/audioEvents.ts`) maps a game
action to an event; the Cast server broadcasts it to phones + TV, and the
solo/hotseat `GameScreen` plays it locally via `useLocalActionAudio()`
(`src/ui/useAudioEvents.ts`) for every applied action, human or AI. Played at
50% of the user's volume (`SFX_BASE_VOLUME`), never when muted.

| Event | Fires on | File | Length | Peak | Sound |
|---|---|---|---|---|---|
| `card-draw` | `DRAW_CARD` | `card-draw.mp3` | 0.47s | -6 dB | soft paper swish |
| `card-keep` | `KEEP_CARD` | `card-keep.mp3` | 0.21s | -12 dB | card tucked into the hand, tiny tap |
| `card-discard` | `DISCARD_DRAWN` | `card-discard.mp3` | 0.24s | -10 dB | card flicked onto the pile, light slap |
| `coin` | selling a ware card, the +1g bonus | `coin.mp3` | 0.94s | -3 dB | brass coins clinking onto a pile — repeated by the gold received (see below) |
| `card-play` | playing a people/utility card | `card-play.mp3` | 0.50s | -4 dB | card tapped onto a wooden table |
| `attack` | playing an animal card | `attack.mp3` | 1.44s | -2 dB | short big-cat growl |
| `turn-end` | `END_TURN` | `turn-end.mp3` | 1.23s | -2 dB | single deep djembe hit |
| `guard` | Guard played as a reaction | `guard.mp3` | 0.73s | -1.5 dB | spear shaft on a hide shield |

**Sound pass 2** (2026-10-11, flow "Jambo SFX 2", same trim / fade / peak
treatment, each 0.3–1.7s and < 17 KB):

| Event | Fires on | Sound |
|---|---|---|
| `coin-out` | buying with a ware card | purse jingle (selling keeps `coin`) |
| `parrot` … `cheetah` | each animal card | its own call (squawk, trumpet, hiss, cackle, jaw snap, hoots, roar, chirp-growl); `attack` is the fallback |
| `drums`, `well`, `kettle`, `boat`, `scale`, `weapons` | activating that utility (`detectAudioEvent(action, stateBefore)`) | drum phrase, bucket splash, bubbling, oar stroke, brass tick, blade ring |
| `ware-land` | each ware token landing in a slot (`FlightLayer.onLand`, ≥70ms apart) | soft clay tap, peak −9 dB |
| `gavel` | an auction won | wooden knock |
| `final-turn` | the final turn begins | low frame-drum heartbeat |
| `win` / `lose` | game over, from the viewer's seat (hotseat: always `win`) | djembe roll into a bell / soft descending balafon |

**Sound pass 3** (2026-10-14, flow "Jambo SFX 3"; levels below are max
momentary loudness):

| Event | Fires on | Sound | Level |
|---|---|---|---|
| `crocodile` (replaced) | Crocodile | a raspy, gravelly hiss that swells in (0.35s) and holds, then the lunge at 1.15s: splash + jaw snap. Hiss modeled on a user-supplied wildlife video (its long hiss's envelope and band balance, EQ-matched: peak ~1–2 kHz, top −5 to −11 dB), generated fresh — no audio taken from the video. Attack layer: "alligator… attacks… splash… jaw snap" | −12.7 |
| `elephant-stomp` | an Elephant ware draft opening, **after the trumpet** | deep boom (low shelf +4 dB, compressed) + goods crashing 150ms later ("clay pots clattering… wooden bowls… baskets and fruit tumbling") | −10.0 |
| `card-found` | Supplies turns up its ware (`SUPPLIES_PAY`/`SUPPLIES_DRAW` log entry with a `card`) | straw rustle as a basket lid lifts, soft two-note kalimba pluck | −26 |
| `market-stand` | playing a Small Market Stand | mallet knocks on timber, plank, a worker's grunt | −20 |
| `drummer` | playing the Drummer | short djembe + talking-drum phrase | −18.5 |

`card-play` was tried softer and kept as it was. `ape` (+3 dB) and `cheetah`
(+1.6 dB) were raised to sit with the other animals.

**Mix tiers** (max momentary LUFS, peaks limited to −0.5/−1 dBFS):
big moments −10…−13 (animals, stomp, victory); confrontations −14…−18
(guard, weapons, final turn, gavel, Drummer); economy and utilities
−19…−26 (coins, utilities, stand, Supplies find, turn end); table taps
−27…−39 (card play/draw/keep/discard, ware landing). A new effect is
leveled into its tier with `alimiter`, never just peak-normalized — peak
normalizing is what left Ape 4 dB under the other animals.

**Elephant stomp** (`src/ui/elephantStomp.ts`): the trumpet plays on the
card; when the fresh ware draft opens, the stomp waits until 1.15s after the
trumpet started (`msSinceSfx('elephant')`, full lead if the trumpet hasn't
played yet — online it arrives with the same state), then plays, `#root`
shakes for 520ms, every pooled ware is tossed up out of sight and falls back
into the draft slots one by one (130ms apart, a ware tap on each landing).
Web Animations API per token; picks wait until the last lands.
`claimElephantStomp` keeps a remount of the same draft from replaying it.
Reduced motion: sounds only.

**Coins scale with the payout** (2026-10-13): `coin` plays as a burst of
clinks, one per 3g received (`goldGained(prev, next)`), from 1 (the +1g
bonus) up to 7 (a 20g+ sale). Clinks are ~120ms apart (slightly uneven),
each a touch quieter with its own pitch (`coinClinks()` in
`useAudioEvents.ts`). Cast/online size it from the public state that came
with the server's event (`useAudioEvents(event, clear, pub)`).

Outcome sounds come from `detectOutcomeSounds(prev, next, viewer)`.
`DUCKING_SOUNDS` (animals, guard, stingers) dispatch `jambo-music-duck`;
`useBackgroundMusic` halves the music for 1.6s.

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
| card-keep (2026-10-13) | A single playing card softly slid into a hand of cards, gentle paper tuck with a tiny soft tap at the end, very short, close-up, dry, no reverb, no music | 1 take, cut 0–0.2s |
| card-discard (2026-10-13) | A single playing card lightly flicked and tossed face-up onto a pile on a wooden table, quick soft paper flutter then a light flat slap, very short, close-up, dry, no reverb, no music | 1 take, cut 0.47–0.72s |

Takes were chosen from waveform/spectrogram + loudness analysis (duds at
-48/-55 LUFS, multi-hit or 4–7s takes rejected), then: leading silence
removed, trimmed, faded out, peak-normalized to the levels above, mono
44.1 kHz VBR MP3 (`-q:a 4`). Regenerating one: same prompt, then the same
trim/fade/peak treatment; keep each under ~1.5s.

**Online (Play a friend)** plays the server's audio events
(`useAudioEvents`) plus the win/lose sting (`useOutcomeAudio`), like Cast.
Friends are people: no trader voice lines or chatter for them.

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
| `design-system.html` | Static showcase page, tokens/components rendered live from the app's stylesheets (`index.css`, `MainMenu.css`, `Landing.css`, `Tutorial.css`, `SettingsPanel.css`, `FriendLobby.css`) | Added 2026-09-24; 2026-10-13 sections for the 2026-10-12 board and the friend game |
| `public/audio/sfx/*.mp3` (32) | Every `AUDIO_FILES` event: coin, coin-out, card-play/draw, turn-end, attack, guard, ware-land, win, lose, final-turn, gavel, each animal, each utility | `tests/ui/designSystem.test.ts` keeps the showcase list equal to `AUDIO_FILES` |
| `public/audio/Golden_Hour_Kalimba.mp3` | 6th music track | ElevenLabs Music v2.5, 2026-10-12 |
| `public/audio/Market_Ambience_Bed.mp3` | Ambience bed under the music | ElevenLabs SFX v2 layers, v2 2026-10-12 |
| `public/audio/traders/baraka-v2-*` | Baraka's re-voiced lines | 2026-10-12 (drier voice) |
| `public/assets/cards/parallax/dancer-{back,figure,front}.webp` | Parallax layers for card tilt (`PARALLAX_LAYERS` in `TiltCardArt.tsx`) | 2026-10-12 |

No new illustrated art, fonts, or background music were generated — the
existing set already covers the full identity; this pass's job was
documenting it, fixing one duplication, and identifying the SFX gap.

## Changelog
### 2026-10-13 — Play a friend online (v1.23.0)
A third two-player mode: **Play a friend** on the landing page makes a room
and shows its code and an invite link (`#/play/<code>`); the friend opens it
and lands on the board with no typing. Both players see the solo table
(`GameBoard`, now shared with solo/hotseat), driven by the server. New:
friend lobby, presence dot/banner/countdown, the friend in the trader's seat,
opponent-left card, coin toss with names, rematch status, waiting hints that
name the friend. Fixed on the way: the desktop "wait for your turn" hint no
longer pushes the board 10px past the viewport; a draft pool shrinking past
eight cards no longer trips a React style warning.

### 2026-10-12 — Baraka re-voiced
Kelechi's take had too much room reverb (measured ~−37 dB 40–120 ms after
each word vs Mama Zawadi's −62); re-voiced with a drier library voice under a
new file prefix (`baraka-v2-*`) because `/audio` is cached.

### 2026-10-12 — Unified settings; Throne gives first; faded utilities (v1.18–v1.20)
One `SettingsPanel` over `preferences.ts` everywhere (switches, segmented
choices, volume slider). Throne asks for your ware first, then theirs.
Utilities you can't use right now fade, with the engine's reason as the
tooltip. See Components › Settings panel, Utility states.

### 2026-10-12 — Cancel anywhere, resolve uplift, music + ambience, flying card faces (v1.17.0)
Cancel ✕ on every screen of your own card until the opponent is involved
(snapshot restore). Resolve panels got linen ware-pick buttons and the
auction board. A 6th music track (ElevenLabs) and a 5-minute market
ambience bed under it, 20s between songs. Flying cards are real card faces.

### 2026-10-12 — Flights start and end on real places (v1.16.0)
A flight starts and lands on a pile, a hand, a utility row, a market slot,
or the card that owns the effect; endpoints are measured before paint. See
Components › Flights.

### 2026-10-12 — Wise Man coins, utility-use spotlight, draw dialog (v1.15.0)
Wise Man prices drawn as green-ringed coins from the engine's own price
function; a used utility turns sideways in the spotlight in place; the draw
dialog plate with gold-coin pips; deck and discard share a width.

### 2026-10-12 — Turn plaque, abandon, card tilt (v1.11.4–v1.13.0)
The brass turn plaque; abandoning a game (menu and landing, logged per user);
avatar silhouette and matching seat blocks; cards tilt toward the pointer
with glare and parallax layers.

### 2026-10-12 — How to Play redesign
Researched how five web games teach (Wordle, Chess.com, Lichess, Balatro,
Board Game Arena) and rebuilt the eight static slides on what they share:
goal first, a guide character, one idea per step, try it instead of reading
it, named and skippable chapters, and a finish that goes straight into a game.
Fixed copy that was wrong (Hyena doesn't swap hands; the 6-ware tip). See
Components › How to play.

### 2026-10-12 — Player tableau polish
Carried the turn plaque's brass-and-lacquer finish across both seats'
panels: rims, corner brackets, a turn-start light sweep, eyebrow labels with
count chips, carved market wells on stand shelves, felt utility sockets,
a coin-and-gradient gold readout, and a leather hand mat (see Components ›
Player tableau). The opponent panel lost its inner double frame. Still fits
1440×900, 1366×768 and 360×640 without scrolling. Tests: `tests/ui/tableau.test.ts`.

### 2026-10-12 — Landing page redesign
Researched five web-game landing pages (Wordle, Chess.com, Lichess, Balatro,
Board Game Arena) and rebuilt the main menu on what they share: one filled
verb, play before sign-up, the game itself in the hero, a one-line rules
pitch, modes named by task, opponents as characters, honest stats only. See
Components › Landing page. Also: meta description, Open Graph/Twitter card,
theme-color, manifest and touch icons; dropped the unused Crimson Pro /
Source Sans 3 font request.

### 2026-10-11 — Trader & endgame polish (v1.11.0)
Eight real-time playthroughs (all four traders, desktop and phone) drove these:
- **One voice** (`planBark` in `useTrader.ts`): lines never overlap; a Guard
  (`blocked`) or the result (`win`/`lose`) cuts in, everything else is
  dropped while a line plays. 12s between any lines, 40s between the same
  kind, each take at most twice a game.
- **More takes**: a second `attack` and `big-sale` line per trader, plus
  `rival-sale` (the trader reacts to *your* 10g+ swing). Files
  `{id}-{event}-2.mp3`; takes rotate.
- **Captions for every line**, voices on or off: in the speech bubble, or on
  the spotlight (trader portrait + italic quote) when one is up. A spotlight
  only quotes a line said about *that* card (`quoteForSpotlight`).
- **Chatter in character** (`ai/traderChatter.ts`): two takes per move per
  trader; ware cards are named by what they trade ("salt and tea"), never
  a hidden card. Hotseat/Cast keep the generic lines.
- **Greeting** waits for the coin toss and fires once per game (it was
  being cancelled by the first state change, and by StrictMode in dev).
- Portrait pops on a reaction so it reads at 26px on phones.
- **Endgame**: the story counts every turn — turns that end on their last
  action (no END_TURN) were being merged, so charts had half their points
  and the "biggest swing" spanned several turns; turns numbered like the
  game (they were one ahead); the trader's last word under the scores; the rival is teal and
  dashed on the chart; an MVP tile that only repeats the best payday is
  dropped; 2-up compact facts on phones; focusing Rematch no longer scrolls
  the headline away; the "Your turn" sweep can't get stuck on screen (or
  show over the results); the opponent's +Ng sits beside their gold instead
  of rising into the trader's subtitle.

### 2026-10-11 — Named traders (v1.10.0)
- Each AI level is a character (`ai/traders.ts`): Kito (Easy, apprentice),
  Amara (Medium, cloth weaver), Baraka (Hard, spice merchant), Mama Zawadi
  (Expert, market matriarch). Names replace "Opponent" everywhere in solo.
- Portraits: `public/assets/traders/{id}-{neutral|pleased|annoyed}.webp`
  (320px, ~25 KB). Ideogram 4 head-and-shoulders in the card-art register
  (bold ink outlines, warm flat colour, sunlit market behind); expressions
  are `precise_edit_ideogram_4_5` edits of the neutral image so identity,
  clothes and background hold. `TraderPortrait` stacks all three and
  cross-fades; the ring turns gold (pleased) / rust (annoyed) and pulses
  while speaking.
- Voices: `public/audio/traders/{id}-{greet|big-sale|attack|blocked|win|lose}.mp3`
  — ElevenLabs eleven_v3, one take per trader with all six lines separated
  by `[long pause]`, split on silence, faded and peak-normalised to −2 dB.
  Voices: Josh (Kito), Amara (Amara), De-Prince (Baraka, re-voiced
  2026-10-12 as `baraka-v2-*` — Kelechi's takes were too roomy), "Monique
  African Queen" (Mama Zawadi). 12s cooldown except greet / blocked / win / lose;
  they duck the music; Settings › Trader Voices.
- Setup screen: "Choose your trader" cards (portrait, name, level, play
  style; 2×2 on phones).

### 2026-10-11 — Endgame story + Rematch (v1.9.0)
- `EndgameOverlay` tells the game's story from `buildGameStory()`
  (`ui/gameStory.ts`: replays the recorded actions from the seeded start —
  the log has no gold totals): `GoldChart` (SVG, to scale, 60g dashed line,
  biggest-swing turn ringed), facts grid (biggest swing, each side's best
  payday, MVP card with art), record at this level, coin shower on a win.
- "Rematch · <difficulty>" keeps the level and runs a fresh coin toss (the
  AI waits for it). Hotseat headlines name the seat; facts follow the winner.
- Spotlights still queued at game over are dropped; the "More below" pill
  moved bottom-right so it never covers centered panel buttons.

### 2026-10-11 — Design review phases 1–3 (v1.6.2 → v1.8.0)
- **Announcements**: opponent plays are spotlit mid-table (non-blocking and
  small on your own turn); center-row tags name the real play ("You bought
  with Tea Stall"); one label at a time on phones; the AI's line clears
  while its play is spotlit. Action log drawer (pinnable on desktop).
- **AI pacing**: per-move pauses (~0.75s hidden, 1.2s plays), the AI waits
  for spotlights; Settings › AI Speed (Relaxed / Normal / Brisk).
- **Clarity**: unplayable hand cards dim with the reason as tooltip; a gold
  "Sell ✓" coin on wares you can sell now; End Turn shows "+1g"; brass
  race-to-60 tracks (`GoldTrack`) under both gold totals; full-width
  final-turn banner + live "you need 22g" line; the ware supply on the board
  (`WareSupply`: six woven baskets, empty → grey, low → gold, alert pulse).
- **Flights** (`FlightLayer` + pure planner `ui/flights.ts`): wares fly
  supply ↔ slots and market ↔ market, coins gold ↔ table / player ↔ player,
  card backs hand ↔ hand. Anchors are `data-market-slot="p-i"`,
  `data-supply-ware`, `data-gold-anchor`, `data-hand-anchor`, and the
  discard pile (`data-spotlight-target="discard"`). Arriving slots stay empty
  (`[data-incoming]`) until their ware lands, then pop. The discard pile holds
  a spotlit card back until the spotlight lands there.
- **Ceremony**: coin-toss first-player reveal; "Your turn" sweep; used
  utilities turn sideways (`.utility-card-tapped`) instead of a USED overlay.
- **Sound pass 2**: 20 new clips (see Sound); big moments duck the music.


### 2026-10-09 — Living table: idle motion, ambience, desktop fit, playtest nits
- New "Life" layer (see Life): breathing/fanned hand with a deal-in, spring
  hover, settling + bobbing market wares, deck stack that thins, loose
  discard pile, popping action pips, rolling gold counters, breathing
  active-panel glow, utility "ready" ember, swaying opponent card backs,
  parchment speech bubble, draw-reveal flip, lamp-light + dust ambience.
  Settings › Ambient Motion turns the loops off; reduced motion stops all.
- Desktop board fits 1440×900 and 1366×768 without scrolling (End Turn and
  most of the hand used to be below the fold); no more layout jump on the
  first utility; opponent name no longer under the avatar button.
- Playtest fixes: tutorial Next/Close pinned (they were below the fold at
  900px); recap no longer says "Player 2's turn begins" in solo ("You ended
  your turn"); AI-authored recaps say "you/your" instead of "opponent"
  ("Opponent: Made you discard down to 3"); card-error overlay text clamps
  on every hand layout.
- Tests: `tests/ui/life.test.ts` (helpers, fan math, phone never fans,
  hover class only when playable, reserved utility slots, bubble), recap
  perspective tests in `uiHints.test.ts`.

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
