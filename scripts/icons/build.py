"""Rebuilds Jambo's favicon and app icons into public/.

The mark is a bold Judson "J" struck on a gold coin (the game's currency).
icon.py draws it as SVG; headless Chromium (Playwright) rasterizes it with the
real Judson Bold font, so no SVG/font tooling is needed beyond:

    pip install playwright && playwright install chromium
    python3 scripts/icons/build.py
"""
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from icon import FIT_JS, page, svg  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PUBLIC = pathlib.Path(__file__).resolve().parents[2] / 'public'
FAVICON_SIZES = (16, 32, 48)

# filename, pixel size, svg, transparent corners
JOBS = [
    *[(f'favicon-{n}.png', n, svg('none', False), True) for n in FAVICON_SIZES],
    ('apple-touch-icon.png', 180, svg('square', True), False),  # iOS rounds it itself
    ('icon-192.png', 192, svg('rounded', True), True),
    ('icon-512.png', 512, svg('rounded', True), True),
    ('icon-maskable-512.png', 512, svg('maskable', True), False),  # coin inside the 80% safe zone
]


def render(out_dir: pathlib.Path) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, size, markup, transparent in JOBS:
            pg = browser.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
            pg.set_content(page(f'<div style="width:{size}px;height:{size}px">{markup}</div>'))
            pg.evaluate('document.fonts.ready')
            pg.wait_for_timeout(150)
            pg.evaluate(FIT_JS)
            pg.screenshot(path=str(out_dir / name), omit_background=transparent,
                          clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            pg.close()
        browser.close()


def pack_ico(pngs: list[tuple[int, bytes]]) -> bytes:
    """An .ico whose entries are embedded PNGs (supported by every current browser)."""
    header = struct.pack('<HHH', 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    directory = b''
    for size, data in pngs:
        directory += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return header + directory + b''.join(data for _, data in pngs)


if __name__ == '__main__':
    render(PUBLIC)
    favicons = [(n, (PUBLIC / f'favicon-{n}.png').read_bytes()) for n in FAVICON_SIZES]
    (PUBLIC / 'favicon.ico').write_bytes(pack_ico(favicons))
    for n in FAVICON_SIZES:
        (PUBLIC / f'favicon-{n}.png').unlink()
    print('Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png')
