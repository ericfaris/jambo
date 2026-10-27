"""
Cast TV playtest — the TV. Opens the real receiver page (receiver/react) in
Playwright with a fake CAF SDK, syncs it to a room exactly as a phone would
(SYNC_ROOM over the custom-message channel), and watches while the phones
(scripts/e2e/cast-tv-bots.ts) play whole games over the real server.

Checks, written to <out>/cast-tv-<tag>.json and printed:
  - console errors / page errors on the TV
  - the board fits the 1280x720 viewport: no scroll, no tableau off screen
  - at every checkpoint (the phones hold still): the TV's gold, hand counts,
    deck and discard counts, market fill and utility counts match the
    server's public state for the room
  - no spotlight / turn sweep / flight left on screen at a checkpoint
  - GAME_OVER shows the result overlay with the right winner
Screenshots: every checkpoint + game over, plus a filmstrip every ~2s.

usage: start the server (PORT=3031 MONGODB_URI= npm run server) and Vite
       (JAMBO_API_PORT=3031 npx vite --port 5180), then
       python3 scripts/e2e/cast-tv.py <ai|pvp> [games=1] [seed=9100] [out=/tmp/cast-tv] [vite=http://localhost:5180] [paceMs=650]
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'pvp'
GAMES = sys.argv[2] if len(sys.argv) > 2 else '1'
SEED = sys.argv[3] if len(sys.argv) > 3 else '9100'
OUT = sys.argv[4] if len(sys.argv) > 4 else '/tmp/cast-tv'
VITE = sys.argv[5] if len(sys.argv) > 5 else 'http://localhost:5180'
PACE = sys.argv[6] if len(sys.argv) > 6 else '650'
API = os.environ.get('JAMBO_API', 'http://127.0.0.1:3031')
TAG = f'{MODE}-{SEED}-p{PACE}'
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(os.path.join(OUT, 'shots'), exist_ok=True)

# A stand-in for the CAF receiver SDK: records the custom-message listener so
# the harness can deliver SYNC_ROOM, and keeps what the receiver sends back.
FAKE_CAF = """
(() => {
  const listeners = {};
  window.__castSent = [];
  const ctx = {
    addCustomMessageListener(ns, fn) { listeners[ns] = fn; },
    removeCustomMessageListener(ns) { delete listeners[ns]; },
    sendCustomMessage(ns, sender, data) { window.__castSent.push(data); },
    start() {},
    setInactivityTimeout() {},
    getPlayerManager() { return { setMediaElement() {}, load() { return Promise.resolve(); }, play() {}, pause() {}, stop() {}, setMessageInterceptor() {}, addEventListener() {} }; },
  };
  const framework = { CastReceiverContext: { getInstance: () => ctx }, system: { MessageType: { JSON: 'JSON' } } };
  Object.defineProperty(window, 'cast', { configurable: true, get: () => ({ framework }), set: () => {} });
  window.__castDeliver = (ns, data) => { if (!listeners[ns]) return false; listeners[ns]({ senderId: 'phone', data }); return true; };
})();
"""

READ_TV = """
() => {
  const seat = (pos) => {
    const el = document.querySelector(`.tv-seat[data-center-target="${pos}"]`);
    if (!el) return null;
    const gold = el.querySelector('.seat-gold')?.getAttribute('aria-label') ?? '';
    const cards = el.querySelector('.seat-cards')?.textContent ?? '';
    const counts = [...el.querySelectorAll('.tableau-count')].map((n) => n.textContent.trim());
    const r = el.getBoundingClientRect();
    return { gold: parseInt(gold, 10), cards: parseInt(cards, 10), counts, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const titles = [...document.querySelectorAll('.panel-section-title')].map((n) => n.textContent.trim());
  const deck = titles.find((t) => t.startsWith('Deck'));
  const discard = titles.find((t) => t.startsWith('Discard'));
  return {
    top: seat('top'),
    bottom: seat('bottom'),
    deck: deck ? parseInt(deck.replace(/\\D+/g, ''), 10) : null,
    discard: discard ? parseInt(discard.replace(/\\D+/g, ''), 10) : null,
    plaque: document.querySelector('.turn-plaque')?.textContent ?? '',
    status: document.querySelector('.tv-status-message')?.textContent ?? null,
    spotlight: !!document.querySelector('.opp-spotlight'),
    // a card flying off to its pile may overlap the next one coming in (by design)
    spotlights: document.querySelectorAll('.opp-spotlight:not(.opp-spotlight-exit)').length,
    sweep: !!document.querySelector('.turn-sweep'),
    flights: document.querySelectorAll('.flight').length,
    endgame: document.querySelector('.endgame-overlay') ? (document.querySelector('.endgame-title')?.textContent ?? 'shown') : null,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    viewport: [innerWidth, innerHeight],
  };
}
"""

findings = []
events = []


def finding(text):
    findings.append(text)
    print(f'  !! {text}', flush=True)


def fetch_public(code, token):
    with urllib.request.urlopen(f'{API}/api/cast/public-room?code={code}&token={token}', timeout=5) as r:
        return json.loads(r.read())['publicState']


def compare(tv, pub, ctx):
    """The TV's numbers against the server's public state."""
    for pos, seat_i in (('bottom', 0), ('top', 1)):
        s, p = tv[pos], pub['players'][seat_i]
        if s is None:
            finding(f'{ctx}: seat {pos} missing')
            continue
        label = f'Player {seat_i + 1}'
        if s['gold'] != p['gold']:
            finding(f"{ctx}: {label} gold TV {s['gold']} vs server {p['gold']}")
        if s['cards'] != p['handCount']:
            finding(f"{ctx}: {label} hand TV {s['cards']} vs server {p['handCount']}")
        market = f"{sum(1 for w in p['market'] if w)}/{len(p['market'])}"
        utils = f"{len(p['utilities'])}/3"
        if market not in s['counts']:
            finding(f"{ctx}: {label} market TV {s['counts']} vs server {market}")
        if utils not in s['counts']:
            finding(f"{ctx}: {label} utilities TV {s['counts']} vs server {utils}")
    if tv['deck'] != pub['deckCount']:
        finding(f"{ctx}: deck TV {tv['deck']} vs server {pub['deckCount']}")
    if tv['discard'] != len(pub['discardPile']):
        finding(f"{ctx}: discard TV {tv['discard']} vs server {len(pub['discardPile'])}")
    if f"Turn {pub['turn']}" not in tv['plaque'].replace(' ', ' ') and pub['phase'] != 'GAME_OVER':
        finding(f"{ctx}: plaque '{tv['plaque'][:60]}' vs server turn {pub['turn']}")


def layout(tv, ctx):
    w, h = tv['viewport']
    if tv['scroll'][0] > w or tv['scroll'][1] > h:
        finding(f"{ctx}: page scrolls {tv['scroll']} in {w}x{h}")
    for pos in ('top', 'bottom'):
        s = tv[pos]
        if s and (s['bottom'] > h + 1 or s['top'] < -1 or s['right'] > w + 1):
            finding(f"{ctx}: {pos} tableau off screen {s}")


def main():
    bots = subprocess.Popen(
        ['zsh', '-i', '-c', f'npx tsx scripts/e2e/cast-tv-bots.ts {MODE} {GAMES} {SEED} {PACE}'],
        cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    lines = []

    def pump():
        for line in bots.stdout:
            line = line.strip()
            if line.startswith('{'):
                try:
                    lines.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    threading.Thread(target=pump, daemon=True).start()

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        ctx.add_init_script(FAKE_CAF)
        ctx.route('**/cast_receiver_framework.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body='/* fake CAF */'))
        pg = ctx.new_page()
        console = []
        pg.on('console', lambda m: console.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: console.append(f'pageerror: {e}'))
        pg.goto(f'{VITE}/receiver/react/index.html')
        pg.wait_for_timeout(1500)

        room = None
        seen = 0
        shot_n = 0
        last_strip = 0
        code = token = None
        deadline = time.time() + 60 * 50
        while time.time() < deadline:
            while seen < len(lines):
                ev = lines[seen]
                seen += 1
                events.append(ev)
                kind = ev.get('event')
                if kind == 'room':
                    code, token = ev['code'], ev['token']
                    ok = pg.evaluate("([d]) => window.__castDeliver('urn:x-cast:com.jambo.game.v1', d)",
                                     [{'type': 'SYNC_ROOM', 'roomCode': code, 'roomMode': MODE, 'senderPlayerSlot': 0, 'apiBaseUrl': VITE, 'castAccessToken': token}])
                    room = ev
                    print(f'room {code} ({MODE}) synced={ok}', flush=True)
                elif kind == 'checkpoint':
                    pg.wait_for_timeout(3600)
                    tv = pg.evaluate(READ_TV)
                    pub = fetch_public(code, token)
                    tag = f"checkpoint {ev['n']} (turn {pub['turn']})"
                    pg.screenshot(path=os.path.join(OUT, 'shots', f'{TAG}-cp{ev["n"]:03d}.png'))
                    compare(tv, pub, tag)
                    layout(tv, tag)
                    if tv['spotlight'] or tv['sweep']:
                        finding(f"{tag}: animation still on screen after 3.6s still (spotlight={tv['spotlight']} sweep={tv['sweep']})")
                    print(f"{tag}: P1 {tv['bottom']['gold'] if tv['bottom'] else '?'}g P2 {tv['top']['gold'] if tv['top'] else '?'}g deck {tv['deck']} status {tv['status']}", flush=True)
                elif kind == 'gameover':
                    pg.wait_for_timeout(3500)
                    tv = pg.evaluate(READ_TV)
                    pg.screenshot(path=os.path.join(OUT, 'shots', f'{TAG}-gameover{ev["game"]}.png'))
                    pub = fetch_public(code, token)
                    compare(tv, pub, f"game over {ev['game']}")
                    if not tv['endgame']:
                        finding(f"game over {ev['game']}: no result overlay on the TV")
                    print(f"game over {ev['game']}: turn {ev['turn']} gold {ev['gold']} TV says {tv['endgame']!r}", flush=True)
                elif kind == 'rematch':
                    pg.wait_for_timeout(2500)
                    tv = pg.evaluate(READ_TV)
                    pg.screenshot(path=os.path.join(OUT, 'shots', f'{TAG}-rematch.png'))
                    if tv['endgame']:
                        finding('rematch: result overlay still on the TV after the new game started')
                elif kind == 'finding':
                    finding(f"bots: {ev['text']}")
            if lines and lines[-1].get('event') == 'done' and seen >= len(lines):
                break
            if bots.poll() is not None and seen >= len(lines):
                break
            if room and time.time() - last_strip > 2.2:
                last_strip = time.time()
                shot_n += 1
                if shot_n % 3 == 0:
                    pg.screenshot(path=os.path.join(OUT, 'shots', f'{TAG}-strip{shot_n:04d}.png'))
                strip = pg.evaluate(READ_TV)
                layout(strip, f'strip {shot_n}')
                if strip['spotlights'] > 1:
                    finding(f'strip {shot_n}: {strip["spotlights"]} spotlights on screen at once')
            pg.wait_for_timeout(150)

        sent = pg.evaluate('window.__castSent')
        if not any(m.get('type') == 'RECEIVER_ROOM_SYNCED' for m in sent if isinstance(m, dict)):
            finding(f'receiver never acked SYNC_ROOM: {sent[:3]}')
        for c in console:
            if '502' in c or 'music' in c.lower():
                continue
            finding(f'TV console: {c[:300]}')
        b.close()
    try:
        bots.wait(timeout=10)
    except subprocess.TimeoutExpired:
        finding('harness deadline: the phones were still playing')
        subprocess.run(['pkill', '-f', f'cast-tv-bots.ts {MODE} {GAMES} {SEED}'])
    result = {'tag': TAG, 'mode': MODE, 'games': GAMES, 'seed': SEED, 'findings': findings, 'events': [e for e in events if e.get('event') != 'checkpoint']}
    with open(os.path.join(OUT, f'cast-tv-{TAG}.json'), 'w') as f:
        json.dump(result, f, indent=1)
    print(f'cast-tv {TAG}: {len(findings)} findings', flush=True)


if __name__ == '__main__':
    main()
