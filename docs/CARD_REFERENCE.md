# Jambo Card Reference (110 Cards)

*Corrected from original board game rules — February 8, 2026*

---

## Market rules (official rulebook)

Source: Rio Grande Games English rules (2004) — https://web.archive.org/web/20120207123446/http://www.riograndegames.com/uploads/Game/Game_120_gameRules.pdf
(the rulebook has no per-card texts; those are printed on the cards).


- **Large market stand:** 6 spaces. Five are free; **filling the 6th space costs 2g, every time**. Wares fill the free spaces, then small stands, then the 6th space.
- **Small market stand:** the first one built in the game costs 6g; every later one (either player) costs 3g.
- **Not enough room** for wares gained from people/animal cards: take what fits, leave the rest in the supply.
- **No hand limit.**

## Rules audit — 2026-10-04

Checked against the full official rulebook text (Rio Grande English rules,
2004, archive link above) and the Universal Head rules summary (v1.1). The
rulebook has no per-card texts, and no public transcription of the printed
cards was found, so card effects were checked for (a) doing exactly what the
in-game card text says and (b) obeying the rulebook's general rules. Each
rule is an executable test in `tests/engine/officialRules.test.ts` and
`tests/engine/rulebook.test.ts` (quoting the rulebook).

**Verified:** setup (20g, 5 cards, 6 of each ware); card counts (40 ware,
22 utility, 29 people, 14 animal, 5 small stands = 110 + 2 large stands);
draw phase (1 action per draw, keep ends phase 1, keep only the last card,
all 5 actions on drawing → no phase 2, may bypass); 1 action per card; +1g
for 2+ unused actions; ware buy/sell legality (all wares in supply, enough
gold incl. the 6th-space fee, enough room, must own all wares to sell);
6th space 2g every fill; small stands 6g first in game, then 3g; utilities
(usable the turn played, 1 action per use, once per turn per card, reset at
end of turn, max 3, 4th replaces even a used one, duplicates allowed and each
usable); people/animals discarded after use; Guard costs no action and
negates for both, both discarded; no hand limit; reshuffle on exhaustion;
endgame (≥60g at end of own turn only; opponent's one last turn; tie or more
→ opponent wins).

**Fixed in this audit:**
- **Cheetah** — an opponent with under 2g could choose "give 2g" and pay what
  they had (even 0), cancelling the Cheetah. Rulebook: *"If a player has no
  gold and wants to take an action that costs gold, he may not take the
  action."* That option now requires 2g (UI shows it disabled: "Needs 2g").
- **Endgame banner** — `endgame.isFinalTurn` was never true during the
  opponent's last turn, so the board/TV said "Endgame triggered!" instead of
  "FINAL TURN!". Rules outcome was already correct.

**Known deviation (minor):** *"he can choose which to take and which to leave
in the supply"* — when wares from a people/animal card don't all fit, the
engine keeps them in the order received. Only matters for a Traveling
Merchant win of two different wares with exactly one usable space.

**Open interpretations (no official card text to settle them):**
- Utilities: the rulebook says a utility may be used *"anytime during his
  turns"*; the engine allows them in phase 2 only (Mask of Transformation is
  the exception — its text says "Before drawing").
- Wise Man from Afar's ±2g applies to ware-card buys/sells; whether it also
  applies to Dancer / Portuguese sales is untested against the printed card.

## Ware Types (6)

| Code | Ware     |
|------|----------|
| K    | Trinkets |
| H    | Hides    |
| T    | Tea      |
| L    | Silk     |
| F    | Fruit    |
| S    | Salt     |

All ware tokens are equal — they have no inherent per-type value. Prices are set per card.

---

## Ware Cards (40 total in deck)

Every ware card can be used to **buy** (pay gold, receive wares from supply) **or sell** (return wares from market, receive gold). The player chooses when playing the card. Cards depict either **3 wares** or **6 wares**.

### 6-Ware Cards — All Six Types (4 copies)

| Wares | Buy | Sell | Margin | Copies |
|-------|-----|------|--------|--------|
| K, H, T, L, F, S | 10g | 18g | +8g | 4 |

### 3-Ware Cards — Three of a Kind (12 copies: 6 types x 2 each)

| Wares | Buy | Sell | Margin | Copies |
|-------|-----|------|--------|--------|
| K, K, K | 3g | 10g | +7g | 2 |
| H, H, H | 3g | 10g | +7g | 2 |
| T, T, T | 3g | 10g | +7g | 2 |
| L, L, L | 3g | 10g | +7g | 2 |
| F, F, F | 3g | 10g | +7g | 2 |
| S, S, S | 3g | 10g | +7g | 2 |

### 3-Ware Cards — Pair + One (12 copies: 6 combos x 2 each)

| Wares | Buy | Sell | Margin | Copies |
|-------|-----|------|--------|--------|
| K, K, F | 4g | 11g | +7g | 2 |
| L, L, S | 4g | 11g | +7g | 2 |
| T, T, L | 4g | 11g | +7g | 2 |
| S, S, K | 4g | 11g | +7g | 2 |
| F, F, H | 4g | 11g | +7g | 2 |
| H, H, T | 4g | 11g | +7g | 2 |

### 3-Ware Cards — Three Different (12 copies: 6 combos x 2 each)

| Wares | Buy | Sell | Margin | Copies |
|-------|-----|------|--------|--------|
| S, L, K | 5g | 12g | +7g | 2 |
| K, H, L | 5g | 12g | +7g | 2 |
| S, K, F | 5g | 12g | +7g | 2 |
| F, H, T | 5g | 12g | +7g | 2 |
| T, S, F | 5g | 12g | +7g | 2 |
| L, H, T | 5g | 12g | +7g | 2 |

### Ware Card Pricing Summary

| Category | Wares | Buy | Sell | Margin |
|----------|-------|-----|------|--------|
| All six types | 6 | 10g | 18g | +8g |
| Three of a kind | 3 | 3g | 10g | +7g |
| Pair + one | 3 | 4g | 11g | +7g |
| Three different | 3 | 5g | 12g | +7g |

---

## Small Market Stand (5 in deck)

- **Copies:** 5
- **Cost:** 6g for the first stand built in the game (by either player); every later stand costs 3g
- **Effect:** Adds 3 extra ware slots to your market (base 6 + 3 per stand)

---

## People Cards (29 total in deck, 13 unique)

People cards have one-time effects and are discarded after use. People cards **cannot be countered** (unlike animal cards which can be blocked by Guard).

### Guard (x6)
- **Cost:** 0 actions (reaction, played during opponent's turn)
- **Effect:** When opponent plays any animal card, negate the animal card's effect. Both the animal card and Guard are discarded.

### Rain Maker (x3)
- **Cost:** 0 actions (reaction, played during opponent's turn)
- **Effect:** After opponent buys or sells using a ware card, take that ware card from the discard pile and add it to your hand. Rain Maker is discarded.

### Shaman (x2)
- **Cost:** 1 action
- **Effect:** Trade all wares of 1 type in your market for the same number of a different ware type from supply.
- **Requirements:** At least 1 ware in market. Supply must have enough of the requested type.

### Psychic (x2)
- **Cost:** 1 action
- **Effect:** Look at the top 6 cards of the deck. Take 1 and add it to your hand. Replace the remaining 5 on top of the deck in their original order.
- **Requirements:** Deck has at least 1 card.

### Tribal Elder (x2)
- **Cost:** 1 action
- **Effect:** Choose one: (A) opponent discards down to 3 cards, OR (B) you draw cards until your hand has 5.

### Wise Man from Afar (x2)
- **Cost:** 1 action
- **Effect:** For the rest of this turn: ware buys cost 2g less, ware sells earn 2g more. Modifier resets at end of turn.

### Portuguese (x2)
- **Cost:** 1 action
- **Effect:** Return any number of wares from your market to supply. Receive 2g per ware returned.
- **Requirements:** Market has at least 1 ware.

### Basket Maker (x2)
- **Cost:** 1 action + 2g
- **Effect:** Pay 2g. Choose 1 ware type. Take 2 of that type from supply and add to your market.
- **Requirements:** 2g gold. Room for at least 1 ware (with only 1 space, you take 1 and the other stays in the supply). Supply has 2+ of chosen type.

### Traveling Merchant (x2)
- **Cost:** 1 action
- **Effect:** Select 2 ware types from supply to put up for auction. Players alternate bidding (starting at 1g). First pass ends auction. Winner pays bid amount and receives both wares from supply (only what fits on their stands; the rest goes back to the supply).
- **Requirements:** At least 1 ware type available in supply, 2 empty market spaces, and 1g for the automatic opening bid.

### Arabian Merchant (x2)
- **Cost:** 1 action
- **Effect:** Reveal top 3 cards from deck and auction them. Players alternate bidding (starting at 1g). First pass ends auction. Winner pays bid amount and receives all 3 cards to hand. If no bids, cards are discarded.
- **Requirements:** Deck has at least 1 card.

### Dancer (x2)
- **Cost:** 1 action
- **Effect:** Select any ware card from your hand. Sell any 3 wares from your market (return to supply) for the normal selling price shown on the selected ware card. No matching required — the 3 wares returned do not need to match the card. Both the Dancer and the selected ware card are discarded.
- **Requirements:** Hand contains at least 1 ware card. Market has 3+ wares.

### Carrier (x1)
- **Cost:** 1 action
- **Effect:** Choose one: (A) take 2 wares of the same type from supply, OR (B) draw 2 cards from deck. Opponent automatically receives whichever option you did not choose.

### Drummer (x1)
- **Cost:** 1 action
- **Effect:** Take 1 utility card from the discard pile and add it to your hand.
- **Requirements:** Discard pile contains at least 1 utility card.

---

## Animal Cards (14 total in deck, 8 unique)

All animal cards cost **1 action** to play. Animal cards can be **negated by Guard** — if the opponent plays a Guard, both cards are discarded and the animal effect is cancelled.

### Crocodile (x5)
- **Effect:** Select 1 of opponent's face-up utility cards. You may use that utility's ability once for no cost, then discard it.
- **Requirements:** Opponent has 1+ utility in play.

### Parrot (x2)
- **Effect:** Steal 1 ware from opponent's market. It moves to your market.
- **Requirements:** Opponent has 1+ ware in market.

### Hyena (x2)
- **Effect:** Look at opponent's hand. Take 1 card from their hand, then give them 1 card from yours.

### Snake (x1)
- **Effect:** Both you and opponent discard all but 1 face-up utility card. Each player independently chooses which utility to keep.

### Elephant (x1)
- **Effect:** Both players put all wares from their markets into a shared pool. Then draft 1 ware at a time, alternating picks (active player picks first), until all wares are distributed. A pick that doesn't fit on the picker's stands goes back to the supply.

### Ape (x1)
- **Effect:** Both players put all hand cards into a shared pool. Then draft 1 card at a time, alternating picks (active player picks first), until all cards are distributed.

### Lion (x1)
- **Effect:** Both players put all face-up utility cards into a shared pool. Then draft 1 utility at a time, alternating picks (active player picks first), until all are distributed (max 3 per player).

### Cheetah (x1)
- **Effect:** Opponent chooses: give you 2g, OR you draw 2 cards from the deck.

---

## Utility Cards (22 total in deck, 10 unique)

Utility cards are placed in your play area (max 3 at a time). Each can be activated **once per turn** at the cost of **1 action**. They persist between turns and are reusable each turn.

### Well (x3)
- **Activation:** Pay 1g, draw 1 card from deck to hand.

### Drums (x3)
- **Activation:** Return 1 ware from your market to supply. Draw 1 card from deck to hand.

### Throne (x2)
- **Activation:** Exchange 1 ware from your market with 1 ware from opponent's market. The wares trade places, so this works with full markets and never fills a new (paid 6th) space.
- **Requirements:** Both players have 1+ ware in market.

### Boat (x2)
- **Activation:** Discard 1 card from your hand. Take 1 ware of your choice from supply and add to your market.
- **Requirements:** Hand has 1+ card. Market has space. Supply has chosen type.

### Scale (x2)
- **Activation:** Draw 2 cards from deck. Keep 1, give the other to your opponent.
- **Requirements:** Deck has 2+ cards.

### Mask of Transformation (x2)
- **Activation:** Before your normal draw, trade 1 card from your hand for the top card of the discard pile.
- **Requirements:** Hand has 1+ card. Discard pile has 1+ card.

### Supplies (x2)
- **Activation:** Pay 1g or discard 1 card from hand. Then draw cards from the deck until you find a ware card — keep it. Discard all non-ware cards drawn along the way.

### Kettle (x2)
- **Activation:** Discard 1 or 2 cards from your hand. Draw the same number of cards from the deck.
- **Requirements:** Hand has 1+ card.

### Leopard Statue (x2)
- **Activation:** Pay 2g. Take 1 ware of your choice from supply and add to your market.
- **Requirements:** 2g gold. Market has space. Supply has chosen type.

### Weapons (x2)
- **Activation:** Discard 1 card from your hand. Receive 2g.
- **Requirements:** Hand has 1+ card.

---

## Card Count Summary

| Category | Unique Designs | Copies in Deck |
|----------|----------------|----------------|
| Ware (6-type) | 1 | 4 |
| Ware (3-of-a-kind) | 6 | 12 |
| Ware (pair+one) | 6 | 12 |
| Ware (3-different) | 6 | 12 |
| **Ware Total** | **19** | **40** |
| Small Market Stand | 1 | 5 |
| **People:** | | |
| Guard | 1 | 6 |
| Rain Maker | 1 | 3 |
| Shaman | 1 | 2 |
| Psychic | 1 | 2 |
| Tribal Elder | 1 | 2 |
| Wise Man | 1 | 2 |
| Portuguese | 1 | 2 |
| Basket Maker | 1 | 2 |
| Traveling Merchant | 1 | 2 |
| Arabian Merchant | 1 | 2 |
| Dancer | 1 | 2 |
| Carrier | 1 | 1 |
| Drummer | 1 | 1 |
| **People Total** | **13** | **29** |
| **Animal:** | | |
| Crocodile | 1 | 5 |
| Parrot | 1 | 2 |
| Hyena | 1 | 2 |
| Snake | 1 | 1 |
| Elephant | 1 | 1 |
| Ape | 1 | 1 |
| Lion | 1 | 1 |
| Cheetah | 1 | 1 |
| **Animal Total** | **8** | **14** |
| **Utility:** | | |
| Well | 1 | 3 |
| Drums | 1 | 3 |
| Throne | 1 | 2 |
| Boat | 1 | 2 |
| Scale | 1 | 2 |
| Mask of Transformation | 1 | 2 |
| Supplies | 1 | 2 |
| Kettle | 1 | 2 |
| Leopard Statue | 1 | 2 |
| Weapons | 1 | 2 |
| **Utility Total** | **10** | **22** |
| | | |
| **GRAND TOTAL** | **51** | **110** |
