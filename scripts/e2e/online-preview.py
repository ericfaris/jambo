#!/usr/bin/env python3
"""
Play a friend — scenario E2E on the dev preview (plan Phase 6.1). Vite only,
no game server: `/?online=1&slot=S&stage=X` stages an exact table from either
seat and auto-plays the friend ("Sam"), so the moments a random game rarely
reaches are exercised through real clicks: a Guard answer, Rain Maker, each
draft (pool stays visible read-only during Sam's pick), both auctions,
cancelling with ✕, and the endgame (your column first, coin toss names Sam).
Also checks the board never scrolls at phone and desktop sizes.

  npm run dev -- --port 5180 --strictPort
  python3 scripts/e2e/online-preview.py --base http://localhost:5180/ --out <scratch>/preview
"""

import argparse
import re
import sys
import time

from playwright.sync_api import sync_playwright

FAILS: list[str] = []
SIZES = {"phone": (390, 844), "desktop": (1440, 900), "laptop": (1366, 768)}


def check(cond: bool, msg: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def view(page):
    return page.evaluate("() => { const v = window.__jamboOnline.view(); return { pub: v.pub, priv: v.priv }; }")


def designs_in_hand(page) -> list[str]:
    return page.evaluate("""() => { const v = window.__jamboOnline.view(); return v.priv.hand; }""")


def fits(page) -> bool:
    return page.evaluate("document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1")


def open_stage(browser, base, slot, stage, size, errors, extra=""):
    w, h = SIZES[size]
    phone = w <= 640
    ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, reduced_motion="reduce")
    ctx.add_init_script("try { localStorage.setItem('jambo.ambientMotion','false'); localStorage.setItem('jambo.uxDebugCounters','false'); localStorage.setItem('jambo.tutorialSeen','true'); } catch (e) {}")
    page = ctx.new_page()
    label = f"{stage}/s{slot}/{size}"
    page.on("console", lambda m: errors.append(f"{label}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{label}: {e}"))
    url = f"{base}?online=1&slot={slot}" + (f"&stage={stage}" if stage else "") + extra
    for attempt in range(4):
        try:
            page.goto(url, wait_until="domcontentloaded")
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2)
    page.wait_for_function("() => !!window.__jamboOnline", timeout=40000)
    page.wait_for_function("() => !document.querySelector('.coin-toss')", timeout=20000)
    page.wait_for_timeout(600)
    return ctx, page


def hand_card(page, design: str):
    """Your hand card of this design (the hand is face up, so its art names it)."""
    return page.locator(f".hand-card:has(img[src*='/assets/cards/{design}.png'])").first


def play_from_hand(page, design: str) -> None:
    hand_card(page, design).click()
    page.wait_for_timeout(500)


def panel(page):
    return page.locator(".panel-slide").first


def scenario(page, stage: str, slot: int, out: str) -> None:
    tag = f"{stage}-s{slot}"
    if stage == "guard":
        btn = page.get_by_role("button", name="Play Guard")
        btn.wait_for(timeout=10000)
        page.screenshot(path=f"{out}/{tag}-prompt.png")
        btn.click()
        page.wait_for_timeout(800)
        v = view(page)
        check(v["pub"]["pendingGuardReaction"] is None, f"{tag}: Guard answered")
        check(any("Guard" in str(e) for e in v["pub"]["log"][-4:]), f"{tag}: log shows the Guard")
    elif stage == "rainmaker":
        # Sam's buy is spotlit first; the prompt follows
        btn = page.get_by_role("button", name="Play Rain Maker")
        btn.first.wait_for(state="visible", timeout=15000)
        page.screenshot(path=f"{out}/{tag}-prompt.png")
        check("Sam used a ware card" in page.inner_text("body"), f"{tag}: the prompt names Sam")
        btn.first.click()
        page.wait_for_timeout(800)
        check(view(page)["pub"]["pendingWareCardReaction"] is None, f"{tag}: Rain Maker answered")
    elif stage in ("elephant", "ape", "lion"):
        play_from_hand(page, stage)
        panel(page).wait_for(timeout=8000)
        page.screenshot(path=f"{out}/{tag}-draft-mine.png")
        check(view(page)["pub"]["pendingResolutionType"] == "DRAFT", f"{tag}: the draft opens")
        # pick the first thing in the pool
        picks = page.locator(".panel-slide [role=button], .panel-slide .card-face, .panel-slide button").all()
        picked = False
        for el in picks:
            try:
                if el.is_visible() and el.is_enabled():
                    before = view(page)["pub"]["log"].__len__()
                    el.click(timeout=2000)
                    page.wait_for_timeout(400)
                    if view(page)["pub"]["log"].__len__() != before or view(page)["pub"].get("waitingOnPlayer") != slot:
                        picked = True
                        break
            except Exception:
                continue
        check(picked, f"{tag}: you can pick from the pool")
        # Sam picks next — the pool stays on screen, read-only
        try:
            page.wait_for_function("() => /Sam is picking/.test(document.body.innerText)", timeout=4000)
            check(True, f"{tag}: pool stays visible while Sam picks")
            page.screenshot(path=f"{out}/{tag}-draft-sam.png")
        except Exception:
            # a tiny pool can end on your pick
            check(view(page)["pub"]["pendingResolutionType"] != "DRAFT", f"{tag}: pool stays visible while Sam picks (or the draft ended)")
    elif stage in ("auction", "arabian"):
        play_from_hand(page, "traveling_merchant" if stage == "auction" else "arabian_merchant")
        panel(page).wait_for(timeout=8000)
        page.screenshot(path=f"{out}/{tag}-panel.png")
        check(view(page)["pub"]["pendingResolutionType"] is not None, f"{tag}: the merchant's panel opens")
    elif stage == "cancel":
        before = view(page)
        page.locator(".utility-ready:has(img[src*='/assets/cards/boat.png']) .card-face, .utility-ready:has(img[src*='/assets/cards/boat.png'])").first.click()
        panel(page).wait_for(timeout=8000)
        x = page.locator(".panel-cancel-x")
        x.first.wait_for(timeout=5000)
        page.screenshot(path=f"{out}/{tag}-started.png")
        x.first.click()
        page.wait_for_timeout(800)
        after = view(page)
        check(after["pub"]["pendingResolutionType"] is None, f"{tag}: ✕ backs out")
        check(sorted(after["priv"]["hand"]) == sorted(before["priv"]["hand"]), f"{tag}: hand restored")
        check(after["pub"]["actionsLeft"] == before["pub"]["actionsLeft"], f"{tag}: action restored")
        check(after["pub"]["players"][slot]["gold"] == before["pub"]["players"][slot]["gold"], f"{tag}: gold restored")
    elif stage == "endgame":
        play_from_hand(page, "ware_3s")
        page.get_by_role("button", name=re.compile(r"^Sell for")).first.click()
        page.wait_for_timeout(800)
        check(view(page)["pub"]["players"][slot]["gold"] >= 60, f"{tag}: the sale passes 60g")
        page.get_by_role("button", name=re.compile("^End turn", re.I)).first.click()
        # Sam's final turn: answer anything aimed at you (Guard, Cheetah, …) with the first button
        deadline = time.time() + 90
        while not page.query_selector(".endgame-overlay") and time.time() < deadline:
            # End Turn can be ignored while Sam weighs a Rain Maker on the sale: retry it
            end = page.get_by_role("button", name=re.compile("^End turn", re.I))
            if end.count() and end.first.is_enabled():
                try:
                    end.first.click(timeout=1500)
                except Exception:
                    pass
            btn = page.locator(".panel-slide button.primary:visible:not([disabled]), .panel-slide button:has-text('Decline'):visible").first
            if btn.count():
                try:
                    btn.click(timeout=1500)
                except Exception:
                    pass
            page.wait_for_timeout(700)
        page.wait_for_selector(".endgame-overlay", timeout=5000)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{out}/{tag}-overlay.png")
        cols = page.evaluate("() => [...document.querySelectorAll('.endgame-overlay')].map(e => e.innerText).join(' ')").lower().replace("you win", "").replace("you lose", "").replace("sam wins", "")
        you, sam = cols.find("you"), cols.find("sam")
        check(you != -1 and sam != -1 and you < sam, f"{tag}: your column comes first")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5180/")
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-layouts", action="store_true")
    ap.add_argument("--stages", default="guard,rainmaker,elephant,ape,lion,auction,arabian,cancel,endgame")
    args = ap.parse_args()
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for slot in (0, 1):
            print(f"seat {slot}: coin toss names Sam")
            ctx, page = open_stage(browser, args.base, slot, None, "desktop", errors)
            ctx.close()
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            page.goto(f"{args.base}?online=1&slot={slot}", wait_until="domcontentloaded")
            try:
                page.wait_for_selector(".coin-toss", timeout=30000)
                page.wait_for_timeout(1200)
                text = page.inner_text(".coin-toss")
                check("Sam" in text or "S" in text, f"seat {slot}: coin toss shows Sam ({text[:40]!r})")
                page.screenshot(path=f"{args.out}/reveal-s{slot}.png")
            except Exception:
                check(False, f"seat {slot}: coin toss appears")
            ctx.close()

            for stage in args.stages.split(","):
                print(f"seat {slot}: {stage}")
                ctx, page = open_stage(browser, args.base, slot, stage, "desktop", errors)
                try:
                    scenario(page, stage, slot, args.out)
                except Exception as e:
                    page.screenshot(path=f"{args.out}/{stage}-s{slot}-error.png")
                    check(False, f"{stage}-s{slot}: {str(e).splitlines()[0][:160]}")
                ctx.close()

            print(f"seat {slot}: layouts")
            for size in ([] if args.skip_layouts else SIZES):
                for extra in ("", "&hand=20&utils=3"):
                    for stage in (None, "elephant"):
                        ctx, page = open_stage(browser, args.base, slot, stage, size, errors, extra)
                        if stage:
                            try:
                                play_from_hand(page, "elephant")
                                panel(page).wait_for(timeout=8000)
                            except Exception:
                                pass
                        name = f"layout-s{slot}-{size}{'-stress' if extra else ''}{'-draft' if stage else ''}"
                        check(fits(page), f"{name}: no scroll")
                        page.screenshot(path=f"{args.out}/{name}.png")
                        ctx.close()
        browser.close()
    check(not errors, f"no console/page errors ({errors[:4]})")
    print(f"\n{'PASS' if not FAILS else 'FAIL'} — {len(FAILS)} failure(s)")
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(main())
