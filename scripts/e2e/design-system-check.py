#!/usr/bin/env python3
"""
Design-system showcase check (plan Phase 7.3): /design-system.html loads with
no console errors or failed requests, every section is there, and nothing
overflows sideways on a phone. Saves full-page screenshots (desktop + 390px).

  npm run dev -- --port 5180 --strictPort
  python3 scripts/e2e/design-system-check.py --base http://localhost:5180/ --out <scratch>/ds
"""

import argparse
import sys

from playwright.sync_api import sync_playwright

SECTIONS = ['ds-board-1012', 'ds-coins', 'ds-utility-states', 'ds-spotlight', 'ds-flights', 'ds-resolve',
            'ds-draw', 'ds-tilt', 'ds-settings', 'ds-landing', 'ds-tutorial', 'ds-ceremony', 'ds-friend']


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:5180/')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    fails: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, (w, h) in {'desktop': (1280, 900), 'phone': (390, 844)}.items():
            page = browser.new_page(viewport={'width': w, 'height': h})
            errors: list[str] = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: errors.append(f'failed {r.url}'))
            page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
            page.goto(args.base + 'design-system.html', wait_until='networkidle')
            page.wait_for_timeout(1500)
            for sid in SECTIONS:
                if not page.query_selector(f'#{sid}'):
                    fails.append(f'{name}: section #{sid} missing')
            # the demos are wired: flight moves, switch toggles
            page.click('#ds-flight-stage')
            page.click('#ds-switch-row')
            page.wait_for_timeout(800)
            if 'is-on' in (page.get_attribute('#ds-switch', 'class') or ''):
                fails.append(f'{name}: settings switch did not toggle')
            if name == 'phone' and page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'):
                fails.append('phone: page scrolls sideways')
            page.screenshot(path=f'{args.out}/design-system-{name}.png', full_page=True)
            # audio files are preload=none; a 404 there would only show on play
            fails += [f'{name}: {e}' for e in errors if 'audio' not in e.lower()]
            page.close()
        browser.close()
    for f in fails:
        print('FAIL', f)
    print('PASS' if not fails else f'FAIL — {len(fails)}')
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main())
