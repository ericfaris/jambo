"""Board parity screenshots — solo / hotseat board at fixed, real mid-game states.

Captures the same shots before and after a board refactor so they can be
pixel-diffed. Needs a Vite dev server (no game server).

usage:
  python scripts/e2e/board-parity.py --base http://localhost:5180/ --out <dir>
  python scripts/e2e/board-parity.py --diff <before-dir> <after-dir>

States come from the medium AI playing both seats from a fixed seed (method:
LESSONS 2026-10-12 "Player tableau polish"): stop at seat 0's play phase with
wares and utilities in play, save it as the autosave and reload.
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

SEED = 4242

BUILD_STATES = r"""
async ([seed]) => {
  const rl = await import('/src/persistence/replayLog.ts');
  const eng = await import('/src/engine/GameEngine.ts');
  const ai = await import('/src/ai/difficulties/index.ts');
  const rs = await import('/src/engine/responder.ts');
  let state = rl.createStartingState(seed, 0);
  const actions = [];
  let mid = null, midActions = null;
  for (let i = 0; i < 6000 && state.phase !== 'GAME_OVER'; i++) {
    const p0 = state.players[0];
    if (!mid && state.turn >= 9 && state.phase === 'PLAY' && state.currentPlayer === 0 && state.actionsLeft >= 4
        && !state.pendingResolution && !state.pendingGuardReaction && !state.pendingWareCardReaction
        && p0.market.filter(Boolean).length >= 2 && p0.utilities.length >= 1 && p0.hand.length >= 4
        && state.players[1].market.filter(Boolean).length >= 1) {
      mid = state; midActions = actions.slice();
    }
    const a = ai.getAiActionByDifficulty(state, 'medium');
    if (!a) break;
    state = eng.processAction(state, a);
    actions.push(a);
  }
  return { mid, midActions, over: state, overActions: actions };
}
"""


def save_and_open(browser, base, viewport, saved, reduced=True):
    ctx = browser.new_context(viewport=viewport, reduced_motion='reduce' if reduced else 'no-preference')
    ctx.add_init_script("""(() => { const saved = %s;
      try {
        localStorage.setItem('jambo.tutorialSeen', 'true');
        localStorage.setItem('jambo.ambientMotion', 'false');
        if (saved && !sessionStorage.getItem('pt.seeded')) {
          localStorage.setItem('jambo.savedGame', saved);
          sessionStorage.setItem('jambo.activeGame', '1');
          sessionStorage.setItem('pt.seeded', '1');
        }
      } catch (e) {}
    })()""" % json.dumps(saved))
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    for attempt in range(3):
        try:
            page.goto(base, wait_until='networkidle')
            break
        except Exception:
            time.sleep(1)
    page.wait_for_timeout(1800)
    return ctx, page, errors


def capture(base, out):
    os.makedirs(out, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(base, wait_until='networkidle')
        built = page.evaluate(BUILD_STATES, [SEED])
        ctx.close()
        mid, over = built['mid'], built['over']
        if not mid:
            sys.exit('no suitable mid-game state for seed %d' % SEED)

        def saved(mode, state, actions):
            return json.dumps({'version': 1, 'savedAt': 0, 'mode': mode, 'aiDifficulty': 'medium', 'state': state,
                               'replayActions': actions, 'taggedActions': [], 'startingPlayer': 0})

        all_errors = []
        shots = [
            ('solo-1440x900', {'width': 1440, 'height': 900}, 'solo'),
            ('solo-1366x768', {'width': 1366, 'height': 768}, 'solo'),
            ('solo-390x844', {'width': 390, 'height': 844}, 'solo'),
            ('hotseat-1440x900', {'width': 1440, 'height': 900}, 'multiplayer'),
        ]
        for name, vp, mode in shots:
            c, pg, errs = save_and_open(browser, base, vp, saved(mode, mid, built['midActions']))
            pg.screenshot(path=f'{out}/{name}.png')
            all_errors += [f'{name}: {e}' for e in errs]
            c.close()

        # Action log open (desktop)
        c, pg, errs = save_and_open(browser, base, {'width': 1440, 'height': 900}, saved('solo', mid, built['midActions']))
        pg.locator('.log-open-btn').first.click()
        pg.wait_for_timeout(900)
        pg.screenshot(path=f'{out}/solo-log-open-1440x900.png')
        all_errors += [f'log: {e}' for e in errs]
        c.close()

        # Endgame overlay: the finished game pushed straight into the store
        c, pg, errs = save_and_open(browser, base, {'width': 1440, 'height': 900}, saved('solo', mid, built['midActions']))
        pg.evaluate("""async ([state, actions]) => {
          const st = await import('/src/hooks/useGameStore.ts');
          st.useGameStore.setState({ state, replayActions: actions, taggedActions: [], startingPlayer: 0 });
        }""", [over, built['overActions']])
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{out}/solo-endgame-1440x900.png')
        all_errors += [f'endgame: {e}' for e in errs]
        c.close()
        browser.close()
    # No game server in a Vite-only session: stats fetches and the WebSocket fail, expectedly
    real = [e for e in all_errors if '/api/' not in e and '/ws' not in e and 'Failed to load resource' not in e]
    for e in real:
        print('console error:', e)
    print(f'board-parity: wrote {len(os.listdir(out))} shots to {out}; console errors: {len(real)}')
    return 1 if real else 0


def diff(before, after):
    from PIL import Image, ImageChops
    worst = 0
    for name in sorted(os.listdir(before)):
        if not name.endswith('.png'):
            continue
        a = Image.open(os.path.join(before, name)).convert('RGB')
        try:
            b = Image.open(os.path.join(after, name)).convert('RGB')
        except FileNotFoundError:
            print(f'{name}: MISSING in after'); worst = 2; continue
        if a.size != b.size:
            print(f'{name}: size {a.size} vs {b.size}'); worst = 2; continue
        d = ImageChops.difference(a, b)
        bbox = d.getbbox()
        if not bbox:
            print(f'{name}: identical')
            continue
        px = sum(1 for v in d.convert('L').getdata() if v > 24)
        print(f'{name}: differs in bbox {bbox}, {px} px over threshold')
        worst = max(worst, 1 if px < 400 else 2)
    return 0 if worst < 2 else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:5180/')
    ap.add_argument('--out')
    ap.add_argument('--diff', nargs=2)
    args = ap.parse_args()
    if args.diff:
        sys.exit(diff(*args.diff))
    sys.exit(capture(args.base, args.out))
