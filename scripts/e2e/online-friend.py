#!/usr/bin/env python3
"""
Play a friend — two-browser networking E2E (plan Phase 6.2, steps 1-3 and 6-9).

Needs the game server and Vite running, e.g.:
  PORT=3031 MONGODB_URI= JAMBO_DATA_DIR=<scratch>/data JAMBO_RECONNECT_GRACE_MS=12000 npm run server
  JAMBO_API_PORT=3031 npm run dev -- --port 5180 --strictPort
then:
  python3 scripts/e2e/online-friend.py --base http://localhost:5180/ --out <scratch>/e2e

Checks: landing -> lobby (code + link, no TV/Cast copy, Copy works); the link
seats the friend with no typing; both boards name the other; hands are
private (no opponent card in either DOM); a refresh shows the presence
banner then "is back"; a friend who never returns ends the game with the
"didn't come back" card; Cast's #/play code entry is untouched; phone
lobby/board never scroll. Any console error or page error fails the run.
"""

import argparse
import json
import re
import sys
import time

from playwright.sync_api import sync_playwright

FAILS: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def new_page(browser, errors: list[str], label: str, viewport=(1440, 900)):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, reduced_motion="reduce")
    ctx.add_init_script("try { localStorage.setItem('jambo.ambientMotion', 'false'); } catch (e) {}")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{label}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{label}: {e}"))
    return ctx, page


def goto(page, url: str) -> None:
    for attempt in range(4):
        try:
            page.goto(url, wait_until="domcontentloaded")
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2)


def no_scroll(page) -> bool:
    return page.evaluate("document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1")


def wait_board(page, timeout=20000) -> None:
    page.wait_for_function("() => !!window.__jamboOnline", timeout=timeout)


def view(page):
    return page.evaluate("() => { const o = window.__jamboOnline; const v = o.view(); return { slot: o.slot, pub: v.pub, priv: v.priv }; }")


def skip_reveal(page) -> None:
    # The coin toss runs a few seconds; reduced motion shortens it. Wait it out.
    page.wait_for_selector(".first-player-reveal", state="detached", timeout=15000) if page.query_selector(".first-player-reveal") else None


def host_lobby(page, base: str, out: str, shot: str):
    goto(page, base)
    # Click at once, before the socket settles: a CREATE_ROOM sent on a
    # replaced socket used to be dropped and the lobby stuck on "Setting the table"
    page.get_by_role("button", name="Play a friend").click()
    page.wait_for_selector(".friend-lobby-digit", timeout=40000)
    code = "".join(page.locator(".friend-lobby-digit").all_inner_texts())
    link = page.locator(".friend-lobby-link").input_value()
    page.screenshot(path=f"{out}/{shot}.png")
    return code, link


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5180/")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    base, out = args.base, args.out
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("1. Host opens a friend lobby")
        ctx_a, a = new_page(browser, errors, "A")
        ctx_a.grant_permissions(["clipboard-read", "clipboard-write"], origin=base.rstrip("/"))
        code, link = host_lobby(a, base, out, "01-lobby-host")
        check(bool(re.fullmatch(r"\d{4}", code)), f"lobby shows a 4-digit code ({code})")
        check(link.endswith(f"#/play/{code}"), f"invite link names the room ({link})")
        body = a.inner_text("body")
        check(not re.search(r"\bTV\b|Cast", body), "lobby never mentions TV/Cast")
        a.get_by_role("button", name="Copy link").click()
        a.wait_for_timeout(300)
        check("Copied!" in a.inner_text(".friend-lobby-copy"), "Copy shows Copied!")
        check(a.evaluate("navigator.clipboard.readText()") == link, "clipboard holds the link")

        print("2. The friend opens the link — no typing")
        ctx_b, b = new_page(browser, errors, "B")
        goto(b, link)
        wait_board(a)
        wait_board(b)
        check(b.evaluate("location.hash") == f"#/play/{code}", "friend's hash is still the invite")
        b.wait_for_timeout(500)
        b.screenshot(path=f"{out}/02-reveal-b.png")
        a.wait_for_timeout(6000)
        a.screenshot(path=f"{out}/03-board-a.png")
        b.screenshot(path=f"{out}/03-board-b.png")
        check("Guest" in a.inner_text("body") and "Guest" in b.inner_text("body"), "each board names the other (Guest)")

        print("3. Hidden information")
        va, vb = view(a), view(b)
        check({va["slot"], vb["slot"]} == {0, 1}, "two different seats")
        ha, hb = set(va["priv"]["hand"]), set(vb["priv"]["hand"])
        check(not (ha & hb), "private hands are disjoint")
        check(len(hb) == va["pub"]["players"][vb["slot"]]["handCount"], "A sees B's hand count")
        check(len(ha) == vb["pub"]["players"][va["slot"]]["handCount"], "B sees A's hand count")
        html_a, html_b = a.content(), b.content()
        check(all(cid not in html_a for cid in hb), "no card id of B's in A's page")
        check(all(cid not in html_b for cid in ha), "no card id of A's in B's page")

        print("6. Refresh mid-game: presence banner, then back on the same board")
        before = view(b)
        b.reload(wait_until="domcontentloaded")
        try:
            a.wait_for_selector(".presence-banner", timeout=8000)
            banner = a.inner_text(".presence-banner")
            check("disconnected" in banner, f"A sees the friend drop ({banner!r})")
            a.screenshot(path=f"{out}/04-presence-away-a.png")
        except Exception:
            check(False, "A sees a presence banner while B reloads")
        wait_board(b)
        a.wait_for_function("() => document.querySelector('.presence-banner')?.innerText.includes('is back')", timeout=15000)
        check(True, "A sees the friend come back")
        after = view(b)
        check(after["slot"] == before["slot"] and sorted(after["priv"]["hand"]) == sorted(before["priv"]["hand"]), "B rejoined the same seat with the same hand")
        check(after["pub"]["turn"] == before["pub"]["turn"], "same turn after the refresh")

        print("9. Phone: lobby and board never scroll")
        ctx_c, c = new_page(browser, errors, "C", viewport=(390, 844))
        _, link2 = host_lobby(c, base, out, "05-lobby-phone")
        check(no_scroll(c), "phone lobby fits")
        ctx_d, d = new_page(browser, errors, "D", viewport=(390, 844))
        goto(d, link2)
        wait_board(c)
        wait_board(d)
        d.wait_for_timeout(6000)
        check(no_scroll(c) and no_scroll(d), "phone boards fit")
        d.screenshot(path=f"{out}/06-board-phone.png")

        print("7. The friend never comes back")
        ctx_b.close()
        a.wait_for_selector(".opponent-left-overlay", timeout=40000)
        title = a.inner_text(".opponent-left-title")
        check("didn't come back" in title, f"A is told ({title!r})")
        a.screenshot(path=f"{out}/07-left-a.png")
        a.get_by_role("button", name="Main menu").click()
        a.wait_for_selector(".landing-cta", timeout=15000)
        check(a.evaluate("location.hash") == "", "Main menu lands on the landing page with no hash")

        print("8. Cast code entry is untouched")
        ctx_e, e = new_page(browser, errors, "E", viewport=(390, 844))
        goto(e, base + "#/play")
        e.wait_for_timeout(2500)
        text = e.inner_text("body")
        check("Join" in text and not e.query_selector(".friend-lobby-panel"), "#/play still shows the Cast join screen")

        for ctx in (ctx_a, ctx_c, ctx_d, ctx_e):
            ctx.close()
        browser.close()

    # A friend's socket closing on purpose may log a WebSocket error; nothing else may
    real = [e for e in errors if "WebSocket" not in e]
    check(not real, f"no console/page errors ({json.dumps(real[:5])})")
    print(f"\n{'PASS' if not FAILS else 'FAIL'} — {len(FAILS)} failure(s)")
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(main())
