"""Jambo playtest driver: plays the human seat(s) through real UI clicks.

Decisions come from the engine's own AI (with epsilon-random exploration);
execution is real Playwright clicks on DOM nodes labelled via React fiber.
Anything the UI can't express gets logged as a finding, then the action is
dispatched straight to the store so the game can continue.
"""
import json, random, re, sys, time, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
# strip the leading eslint globals comment so Playwright sees a bare function
SCAN = re.sub(r'^/\*.*?\*/\s*', '', open(f'{HERE}/scan.js').read(), flags=re.S)
# Output dir (logs, screenshots, replays, per-game JSON) — point at your scratchpad
S = os.environ.get('PT_OUT', os.getcwd())
BASE = os.environ.get('PT_BASE', 'http://localhost:5180/')

JS_HELPERS = r"""
window.__pt = window.__pt || {};
window.__ptLoad = async () => {
  if (window.__pt.store) return true;
  const st = await import('/src/hooks/useGameStore.ts');
  const ai = await import('/src/ai/difficulties/index.ts');
  const inv = await import('/src/engine/validation/invariants.ts');
  const va = await import('/src/engine/validation/actionValidator.ts');
  const cd = await import('/src/engine/cards/CardDatabase.ts');
  Object.assign(window.__pt, { store: st.useGameStore, ai, inv, va, cd });
  return true;
};
window.__ptResponder = (s) => {
  if (s.pendingGuardReaction) return s.pendingGuardReaction.targetPlayer;
  if (s.pendingWareCardReaction) return s.pendingWareCardReaction.targetPlayer;
  const pr = s.pendingResolution;
  if (pr) {
    switch (pr.type) {
      case 'AUCTION': return pr.wares.length < 2 ? s.currentPlayer : pr.nextBidder;
      case 'DRAFT': return pr.currentPicker;
      case 'OPPONENT_DISCARD': case 'CARRIER_WARE_SELECT': return pr.targetPlayer;
      case 'UTILITY_KEEP': return pr.step === 'ACTIVE_CHOOSE' ? s.currentPlayer : 1 - s.currentPlayer;
      case 'OPPONENT_CHOICE': return 1 - s.currentPlayer;
    }
  }
  return s.currentPlayer;
};
window.__ptSummary = () => {
  const g = window.__pt.store.getState();
  const s = g.state;
  const viol = window.__pt.inv.checkInvariants(s);
  return {
    turn: s.turn, phase: s.phase, cp: s.currentPlayer, actionsLeft: s.actionsLeft,
    responder: window.__ptResponder(s),
    pr: s.pendingResolution ? { type: s.pendingResolution.type, step: s.pendingResolution.step ?? null, source: s.pendingResolution.sourceCard } : null,
    guard: !!s.pendingGuardReaction, rain: !!s.pendingWareCardReaction,
    gold: [s.players[0].gold, s.players[1].gold],
    hand: [s.players[0].hand.length, s.players[1].hand.length],
    deck: s.deck.length, discard: s.discardPile.length,
    endgame: s.endgame, error: g.error, nActions: g.replayActions.length,
    drawnCard: s.drawnCard,
    violations: viol.map(v => (v.message || JSON.stringify(v))),
    lastLog: s.log.length ? s.log[s.log.length - 1] : null,
  };
};
window.__ptDecide = (difficulty, eps, seedish) => {
  const s = window.__pt.store.getState().state;
  let action = null;
  const r = Math.random();
  if (r < eps) {
    const acts = window.__pt.va.getValidActions(s).filter(a => a.type !== 'RESOLVE_INTERACTION');
    // prefer interesting actions over END_TURN when exploring
    const interesting = acts.filter(a => a.type !== 'END_TURN' && a.type !== 'SKIP_DRAW');
    const pool = interesting.length ? interesting : acts;
    if (pool.length) action = pool[Math.floor(Math.random() * pool.length)];
  }
  if (!action) action = window.__pt.ai.getAiActionByDifficulty(s, difficulty);
  return action;
};
window.__ptDispatch = (a) => { window.__pt.store.getState().dispatch(a, 'driver-fallback'); };
window.__ptCardName = (id) => { try { return window.__pt.cd.getCard(id).name; } catch { return id; } };
window.__ptFull = () => window.__pt.store.getState().state;
window.__ptReplay = () => window.__pt.store.getState().exportReplay();
"""

CONFIRM_WORDS = ['Confirm Discard', 'Confirm', 'Continue', 'Sell (', 'Draw a card', 'Draw cards', 'Done']


class Game:
    def __init__(self, pg, gid, mode, difficulty, human_policy, eps, log):
        self.pg, self.gid, self.mode, self.difficulty = pg, gid, mode, difficulty
        self.human_policy, self.eps, self.log = human_policy, eps, log
        self.findings = []
        self.stats = {'ui_actions': 0, 'fallbacks': 0, 'res_types': {}, 'cards_played': {}, 'utilities': 0,
                      'guard_prompts': 0, 'rain_prompts': 0, 'explore_clicks': 0}
        self.shots = 0
        self.human_seats = [0, 1] if mode == 'hotseat' else [0]
        self.seen_finding_keys = set()

    # ---------- utilities ----------
    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)

    def summary(self):
        return self.ev('() => window.__ptSummary()')

    def shot(self, tag):
        self.shots += 1
        p = f'{S}/shots/g{self.gid}-{self.shots:03d}-{tag}.png'
        self.pg.screenshot(path=p)
        return p

    def finding(self, kind, msg, shot=True, key=None):
        k = key or (kind, msg[:80])
        if k in self.seen_finding_keys:
            return
        self.seen_finding_keys.add(k)
        p = self.shot(kind) if shot else None
        f = {'game': self.gid, 'kind': kind, 'msg': msg, 'shot': p, 'summary': self.summary()}
        self.findings.append(f)
        self.log(f'  !! FINDING [{kind}] {msg}')

    def tick(self, ms=400):
        self.pg.clock.run_for(ms)

    def scan(self):
        return self.ev(SCAN)

    def click(self, c):
        try:
            r = self.pg.evaluate("""(id) => { const e = document.querySelector(`[data-pt="${id}"]`); if (!e) return null;
                e.scrollIntoView({block: 'nearest', inline: 'nearest'});
                const r = e.getBoundingClientRect();
                let x = r.x + r.width / 2, y = r.y + Math.min(r.height / 2, 40);
                let hit = document.elementFromPoint(x, y);
                if (!(hit && (hit === e || e.contains(hit)))) {
                  outer: for (const fy of [0.5, 0.3, 0.15, 0.7, 0.85]) for (const fx of [0.5, 0.15, 0.08, 0.3, 0.85, 0.7]) {
                    const tx = r.x + r.width * fx, ty = r.y + r.height * fy; const h = document.elementFromPoint(tx, ty);
                    if (h && (h === e || e.contains(h))) { x = tx; y = ty; hit = h; break outer; }
                  }
                }
                return { x, y, ok: !!hit && (hit === e || e.contains(hit)), hit: hit ? (hit.innerText || hit.className || hit.tagName).toString().slice(0, 60) : null }; }""", c['id'])
            if r is None:
                raise Exception('element vanished')
            if not r['ok']:
                raise Exception(f'occluded by {r["hit"]!r}')
            self.pg.mouse.click(r['x'], r['y'])
            self.tick(250)
            return True
        except Exception as e:
            self.finding('CLICK_BLOCKED', f'Could not click {c.get("text") or c.get("cardId") or c.get("comps")}: {str(e).splitlines()[0][:160]}',
                         key=('CLICK_BLOCKED', c.get('comps', '')[:40]))
            return False

    def close_megaview(self):
        for _ in range(3):
            cs = self.scan()
            mv = [c for c in cs if c['comps'].startswith('MegaView')]
            if not mv:
                return
            self.click(mv[0])

    def changed(self, before):
        now = self.summary()
        return now['nActions'] != before['nActions'], now

    # ---------- action realization ----------
    def realize(self, action, before):
        t = action['type']
        cs = self.scan()
        btn = lambda words: next((c for c in cs if c['tag'] == 'BUTTON' and any(c['text'].startswith(w) for w in words)), None)
        target = None
        if t == 'DRAW_CARD':
            target = btn(['Draw Card'])
        elif t == 'SKIP_DRAW':
            target = btn(['Skip Draw'])
        elif t == 'KEEP_CARD':
            target = btn(['Keep Card'])
        elif t == 'DISCARD_DRAWN':
            target = btn(['Discard'])
        elif t == 'END_TURN':
            target = next((c for c in cs if 'End Turn' in c['text']), None)
        elif t == 'GUARD_REACTION':
            target = btn(['Play Guard']) if action['play'] else btn(['Decline'])
        elif t == 'WARE_CARD_REACTION':
            target = btn(['Play Rain Maker']) if action['play'] else btn(['Decline'])
        elif t == 'PLAY_CARD':
            hand = [c for c in cs if c.get('cardId') == action['cardId'] and 'HandDisplay' in c['comps']]
            if hand:
                hand.sort(key=lambda c: -c['w'] * c['h'])
                if not self.click(hand[0]):
                    return False
                ch, _ = self.changed(before)
                if ch:
                    return True
                if action.get('wareMode'):
                    cs2 = self.scan()
                    want = 'Buy' if action['wareMode'] == 'buy' else 'Sell'
                    coins = sorted([c for c in cs2 if c['comps'].startswith('CardPlayDialog') and c['tag'] == 'DIV' and c['w'] < 200], key=lambda c: c['x'])
                    opt = coins[:1] if want == 'Buy' else coins[-1:]
                    if len(coins) < 2:
                        self.finding('UI_GAP', f'Ware dialog has no "{want}" option for {action["cardId"]}', key=('ware-dlg', want))
                        # close dialog
                        cancel = [c for c in cs2 if 'CardPlayDialog' in c['comps'] and c['tag'] == 'DIV' and c['text'] == '' ]
                        return False
                    opt.sort(key=lambda c: c['w'] * c['h'])
                    self.click(opt[0])
                ch, now = self.changed(before)
                if not ch:
                    cs3 = self.scan()
                    err = [c for c in cs3 if 'HandDisplay' in c['comps']]
                return ch
        elif t == 'ACTIVATE_UTILITY':
            ut = [c for c in cs if 'UtilityArea' in c['comps']]
            # own utilities are the lower area: largest y
            full = self.ev('() => window.__ptFull()')
            me = full['currentPlayer']
            ucard = full['players'][me]['utilities'][action['utilityIndex']]['cardId']
            mine = [c for c in ut if c.get('cardId') == ucard or c.get('key') == ucard]
            if not mine:
                mine = sorted(ut, key=lambda c: (-c['y'], c['x']))
            target = mine[0] if mine else None
            self.stats['utilities'] += 1
        elif t == 'RESOLVE_INTERACTION':
            return self.realize_resolution(action['response'], before)
        if not target:
            return False
        self.click(target)
        ch, _ = self.changed(before)
        if not ch and t in ('DRAW_CARD', 'KEEP_CARD', 'DISCARD_DRAWN', 'SKIP_DRAW'):
            self.tick(600)
            ch, _ = self.changed(before)
        return ch

    def panel_clickables(self):
        cs = self.scan()
        # inside resolution panel (ResolveMegaView), excluding the reference hand strip + zoom helpers
        inside = self.ev("""() => [...document.querySelectorAll('[data-pt]')].filter(e => e.closest('.panel-slide')).map(e => e.getAttribute('data-pt'))""")
        ids = set(inside)
        out = [c for c in cs if c['id'] in ids and 'HandReferenceStrip' not in c['comps']]
        # drop zoom-only (tiny) elements within cards
        return out

    def realize_resolution(self, resp, before):
        rt = resp['type']
        self.close_megaview()
        pcs = self.panel_clickables()
        if not pcs:
            return False
        full = self.ev('() => window.__ptFull()')
        clicked_any = False

        def card_targets(cid):
            m = [c for c in pcs if c.get('cardId') == cid]
            m.sort(key=lambda c: -c['w'] * c['h'])
            return m[:1]

        cards = sorted([c for c in pcs if c.get('cardId') and c['w'] * c['h'] > 1500], key=lambda c: (c['y'] // 40, c['x']))
        # dedupe by cardId keep largest
        seen = {}
        for c in cards:
            if c['cardId'] not in seen or seen[c['cardId']]['w'] * seen[c['cardId']]['h'] < c['w'] * c['h']:
                seen[c['cardId']] = c
        cards_unique = sorted(seen.values(), key=lambda c: (c['y'] // 40, c['x']))
        wares = [c for c in pcs if c.get('ware')]
        buttons = [c for c in pcs if c['tag'] == 'BUTTON']

        plan = []
        if rt in ('SELECT_CARD', 'DISCARD_PICK'):
            plan = card_targets(resp['cardId'])
        elif rt == 'SELECT_CARDS':
            for cid in resp['cardIds']:
                plan += card_targets(cid)
        elif rt == 'DECK_PEEK_PICK':
            if resp['cardIndex'] < len(cards_unique):
                plan = [cards_unique[resp['cardIndex']]]
        elif rt == 'OPPONENT_DISCARD_SELECTION':
            hand = full['players'][full['pendingResolution'].get('targetPlayer', 0)]['hand']
            for i in resp['cardIndices']:
                if i < len(hand):
                    plan += card_targets(hand[i])
        elif rt in ('BINARY_CHOICE', 'OPPONENT_CHOICE'):
            prim = [b for b in buttons if not b['text'].startswith(('Pass', 'Decline'))]
            if len(prim) >= 2:
                plan = [prim[resp['choice']]]
            elif prim:
                plan = prim[:1]
        elif rt == 'AUCTION_BID':
            plan = [b for b in buttons if b['text'].startswith('Bid')][:1]
        elif rt == 'AUCTION_PASS':
            plan = [b for b in buttons if b['text'].startswith('Pass')][:1]
        elif rt == 'SELECT_WARE_TYPE':
            plan = [w for w in wares if w['ware'] == resp['wareType']][:1]
        elif rt in ('SELECT_WARE', 'RETURN_WARE'):
            idx = resp['wareIndex']
            ws = sorted(wares, key=lambda c: (c['y'] // 30, c['x']))
            if idx < len(ws):
                plan = [ws[idx]]
        elif rt in ('SELECT_WARES', 'SELL_WARES'):
            ws = sorted(wares, key=lambda c: (c['y'] // 30, c['x']))
            plan = [ws[i] for i in resp['wareIndices'] if i < len(ws)]
        elif rt == 'SELECT_UTILITY':
            ucards = [c for c in cards_unique]
            if resp['utilityIndex'] < len(ucards):
                plan = [ucards[resp['utilityIndex']]]

        for c in plan:
            self.click(c)
            clicked_any = True
            ch, _ = self.changed(before)
            if ch:
                return True
        # confirm step
        for _ in range(2):
            pcs2 = self.panel_clickables()
            conf = [b for b in pcs2 if b['tag'] == 'BUTTON' and any(b['text'].startswith(w) for w in CONFIRM_WORDS)]
            if conf:
                self.click(conf[0])
                ch, _ = self.changed(before)
                if ch:
                    return True
        return False

    def explore_resolution(self, before, max_clicks=30):
        """Click around the panel like a confused human until something resolves."""
        for i in range(max_clicks):
            self.close_megaview()
            pcs = self.panel_clickables()
            pcs = [c for c in pcs if c['w'] * c['h'] > 300]
            if not pcs:
                return False
            buttons = [c for c in pcs if c['tag'] == 'BUTTON']
            pick = random.choice(buttons) if (buttons and i % 3 == 2) else random.choice(pcs)
            self.stats['explore_clicks'] += 1
            self.click(pick)
            ch, _ = self.changed(before)
            if ch:
                return True
        return False

    # ---------- main loop ----------
    def play(self, max_steps=4000):
        stagnant = 0
        last_n = -1
        last_err = None
        turn_seen = -1
        for step in range(max_steps):
            # Hotseat pass-device screen: hand the device over
            handoff = self.pg.get_by_role('button', name=re.compile(r"^I'm Player \d"))
            if handoff.count():
                self.stats['handoffs'] = self.stats.get('handoffs', 0) + 1
                handoff.first.click()
                self.tick(200)
            s = self.summary()
            if s['violations']:
                self.finding('INVARIANT', '; '.join(s['violations'])[:300], key=('inv', s['violations'][0][:60]))
            if s['error'] and s['error'] != last_err:
                self.finding('ENGINE_ERROR', f'store.error: {s["error"]}', key=('err', s['error'][:60]))
            last_err = s['error']
            if s['phase'] == 'GAME_OVER':
                return s
            if s['turn'] != turn_seen:
                turn_seen = s['turn']
                self.tick(100)
                dom = self.ev(r"""() => { const m = document.body.innerText.match(/Turn (\d+) · Player (\d)/); return m ? [Number(m[1]), Number(m[2])] : null; }""")
                s2 = self.summary()
                if dom and s2['turn'] == s['turn'] and dom[0] != s2['turn'] + 1 and dom[0] != s2['turn']:
                    raise SystemExit(f'DRIVER DESYNC: store turn {s2["turn"]} vs DOM {dom}')
                if s['turn'] % 5 == 0:
                    self.log(f'  turn {s["turn"]} gold {s["gold"]} deck {s["deck"]} discard {s["discard"]}')
                if s['turn'] > 200:
                    self.finding('LONG_GAME', 'turn > 200, aborting')
                    return s
            human = s['responder'] in self.human_seats
            if not human:
                # AI's move: let the clock run
                self.tick(3200)
                ns = self.summary()
                if ns['nActions'] == s['nActions'] and ns['phase'] != 'GAME_OVER':
                    stagnant += 1
                    if stagnant == 6:
                        self.finding('AI_STALL', f'AI made no move for ~20s simulated (pr={s["pr"]}, guard={s["guard"]}, rain={s["rain"]}, err={s["error"]})')
                        # unstick: dispatch AI action directly
                        a = self.ev(f'() => window.__ptDecide("{self.difficulty}", 0)')
                        if a:
                            self.ev('(a) => window.__ptDispatch(a)', a)
                            self.stats['fallbacks'] += 1
                        stagnant = 0
                else:
                    stagnant = 0
                continue
            stagnant = 0
            # human decision — let React effects (modals, panels) settle first
            self.tick(300)
            s = self.summary()
            if s['responder'] not in self.human_seats or s['phase'] == 'GAME_OVER':
                continue
            self.close_megaview()
            if s['guard']:
                self.stats['guard_prompts'] += 1
            if s['rain']:
                self.stats['rain_prompts'] += 1
            action = self.ev(f'() => window.__ptDecide("{self.human_policy}", {self.eps})')
            if action is None:
                self.finding('AI_NULL', f'AI policy returned null for human seat at {s["pr"]}')
                self.tick(1000)
                continue
            if action['type'] == 'PLAY_CARD':
                nm = self.ev('(id) => window.__ptCardName(id)', action['cardId'])
                self.stats['cards_played'][nm] = self.stats['cards_played'].get(nm, 0) + 1
            if s['pr']:
                k = s['pr']['type']
                self.stats['res_types'][k] = self.stats['res_types'].get(k, 0) + 1
                if self.stats['res_types'][k] == 1:
                    self.shot(f'res-{k}')
            ok = False
            try:
                ok = self.realize(action, s)
            except Exception as e:
                self.log(f'  realize exception: {e}')
            if ok:
                self.stats['ui_actions'] += 1
                continue
            # try exploring the panel for resolutions
            if s['pr'] and action['type'] == 'RESOLVE_INTERACTION':
                if self.explore_resolution(s):
                    self.stats['ui_actions'] += 1
                    continue
            ch, ns = self.changed(s)
            if ch:
                continue
            self.finding('UI_GAP', f'Could not perform {json.dumps(action)[:200]} via UI (pr={s["pr"]}, guard={s["guard"]}, rain={s["rain"]}, viewer-responder={s["responder"]}, cp={s["cp"]})',
                         key=('gap', action['type'], (s['pr'] or {}).get('type'), (action.get('response') or {}).get('type'), s['guard'], s['rain']))
            self.ev('(a) => window.__ptDispatch(a)', action)
            self.stats['fallbacks'] += 1
            self.tick(300)
        return self.summary()


def run_game(gid, mode, difficulty, human_policy, eps, seed):
    random.seed(seed)
    logf = open(f'{S}/game{gid}.log', 'w')
    def log(m):
        print(m, flush=True); logf.write(m + '\n'); logf.flush()
    os.makedirs(f'{S}/shots', exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 1400, 'height': 900})
        tutorial_seen = 'true' if gid != 1 else 'false'
        ctx.add_init_script(f"if (!sessionStorage.getItem('pt-init')) {{ localStorage.setItem('jambo.tutorialSeen','{tutorial_seen}'); localStorage.setItem('jambo.uxDebugCounters','false'); sessionStorage.setItem('pt-init','1'); }}")
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
        pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
        pg.clock.install()
        pg.goto(BASE)
        pg.clock.run_for(1500)
        pg.add_script_tag(content=JS_HELPERS)
        pg.evaluate('() => window.__ptLoad()')
        g = Game(pg, gid, mode, difficulty, human_policy, eps, log)
        log(f'=== Game {gid}: mode={mode} ai={difficulty} human-policy={human_policy} eps={eps}')
        pg.get_by_role('button', name='Play Solo' if mode == 'solo' else 'Multiplayer').click()
        pg.clock.run_for(300)
        g.shot('setup')
        if mode == 'solo':
            pg.get_by_role('button', name=difficulty.capitalize()).click()
        pg.get_by_role('button', name='Start Game').click()
        # first player reveal
        for _ in range(20):
            pg.clock.run_for(500)
        g.shot('start')
        if gid == 1:
            # tutorial auto-opens on first game; check whether AI acted behind it
            s0 = g.summary()
            for _ in range(10):
                pg.clock.run_for(3200)
            s1 = g.summary()
            tut = pg.locator('text=Welcome to the Market').count()
            log(f'  tutorial visible={tut} actions before={s0["nActions"]} after 32s={s1["nActions"]} cp={s1["cp"]}')
            if tut and s1['nActions'] > s0['nActions']:
                g.finding('FLOW', f'AI took {s1["nActions"] - s0["nActions"]} actions while the first-run tutorial overlay was covering the board')
            # click through tutorial
            for _ in range(30):
                nb = pg.get_by_role('button', name='Next')
                if nb.count():
                    nb.click(); pg.clock.run_for(300)
                else:
                    break
            for nm in ['Start Playing', 'Close', 'Done', 'Got it', "Let's Play"]:
                bt = pg.get_by_role('button', name=nm)
                if bt.count():
                    bt.first.click(); break
            pg.clock.run_for(500)
            g.shot('after-tutorial')
        t0 = time.time()
        final = g.play()
        g.shot('final')
        for _ in range(12):
            pg.clock.run_for(500)
        g.shot('final-after-6s')
        g.close_megaview()
        pg.clock.run_for(1000)
        g.shot('final-after-close')
        replay = pg.evaluate('() => window.__ptReplay()')
        open(f'{S}/game{gid}.replay.json', 'w').write(replay)
        full = pg.evaluate('() => window.__ptFull()')
        # endgame overlay text
        overlay = pg.locator('body').inner_text()[:2000]
        res = {'gid': gid, 'mode': mode, 'ai': difficulty, 'final': final, 'stats': g.stats, 'findings': g.findings,
               'console_errors': errs[:50], 'wall_s': round(time.time() - t0), 'endgame': full.get('endgame'),
               'overlay_text': overlay, 'log_tail': full['log'][-25:]}
        json.dump(res, open(f'{S}/game{gid}.json', 'w'), indent=1, default=str)
        log(f'=== Game {gid} done: phase={final["phase"]} turn={final["turn"]} gold={final["gold"]} findings={len(g.findings)} console_errors={len(errs)} wall={res["wall_s"]}s')
        b.close()


USAGE = """usage: driver.py GAME_ID MODE AI_DIFFICULTY HUMAN_POLICY EPSILON SEED
  MODE           solo | hotseat
  AI_DIFFICULTY  easy | medium | hard | expert  (opponent; ignored for hotseat)
  HUMAN_POLICY   difficulty used to choose the human seat's moves
  EPSILON        0..1 chance of a random valid action instead (exploration)
  env PT_OUT     output dir (default cwd), PT_BASE app URL (default :5180)
GAME_ID 1 also leaves the first-run tutorial enabled."""

if __name__ == '__main__':
    if len(sys.argv) != 7:
        sys.exit(USAGE)
    gid, mode, diff, pol, eps, seed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5]), int(sys.argv[6])
    run_game(int(gid), mode, diff, pol, eps, seed)
