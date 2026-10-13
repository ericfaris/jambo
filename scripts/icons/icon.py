"""Draws the Jambo coin mark as SVG (see build.py)."""
import math
import pathlib
FONT = str(pathlib.Path(__file__).resolve().parents[2] / 'public/assets/fonts/Judson-Bold.ttf')
def svg(tile='rounded', detailed=True, coin_r=None, j_height=0.66, weight=0.075):
    """tile: rounded | square | maskable | none. The J is auto-fitted in the browser (see FIT_JS)."""
    r = coin_r or {'rounded': 226, 'square': 226, 'maskable': 196, 'none': 252}[tile]
    cx = cy = 256
    rimw = r * (0.075 if detailed else 0.11)
    bg = {'rounded': '<rect width="512" height="512" rx="112" fill="url(#wood)"/>',
          'square': '<rect width="512" height="512" fill="url(#wood)"/>',
          'maskable': '<rect width="512" height="512" fill="url(#wood)"/>', 'none': ''}[tile]
    ticks = ''
    if detailed:
        for i in range(72):
            a = 2 * math.pi * i / 72
            r1, r2 = r * 0.83, r * 0.905
            ticks += f'<line x1="{cx+r1*math.cos(a):.1f}" y1="{cy+r1*math.sin(a):.1f}" x2="{cx+r2*math.cos(a):.1f}" y2="{cy+r2*math.sin(a):.1f}"/>'
        ticks = f'<g stroke="#9a6420" stroke-width="{r*0.022:.1f}" stroke-linecap="round" opacity=".85">{ticks}</g><circle cx="{cx}" cy="{cy}" r="{r*0.795:.1f}" fill="none" stroke="#9a6420" stroke-width="{r*0.02:.1f}" opacity=".85"/>'
    # target box for the J: height j_height * coin diameter (inside ring when detailed)
    jh = 2 * r * (j_height if not detailed else 0.56)
    sw = r * weight * (1.0 if detailed else 1.4)
    ext = r * 0.05
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
 <radialGradient id="wood" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#3d2412"/><stop offset="1" stop-color="#1e1208"/></radialGradient>
 <radialGradient id="gold" cx="36%" cy="28%" r="85%"><stop offset="0" stop-color="#ffe6a3"/><stop offset=".5" stop-color="#f2c86a"/><stop offset="1" stop-color="#c0842c"/></radialGradient>
</defs>
{bg}
{'' if tile == 'none' else f'<circle cx="{cx}" cy="{cy + r*0.04:.1f}" r="{r}" fill="#0c0602" opacity=".6"/>'}
<circle cx="{cx}" cy="{cy}" r="{r - rimw/2:.1f}" fill="url(#gold)" stroke="#5a330e" stroke-width="{rimw:.1f}"/>
{ticks}
<g class="fit" data-cx="{cx}" data-cy="{cy}" data-h="{jh:.1f}" data-ext="{ext:.1f}" font-family="JudsonB" font-weight="700" font-size="400" stroke-linejoin="round" paint-order="stroke">
 <text x="0" y="0" fill="#8a5418" stroke="#8a5418" data-sw="{sw:.1f}">J</text>
 <text x="0" y="0" fill="#2a1608" stroke="#2a1608" data-sw="{sw:.1f}">J</text>
</g>
</svg>'''
# Fit each .fit group: scale the J so its ink height = data-h, centered optically on (cx, cy).
FIT_JS = '''() => {
  const c = document.createElement('canvas').getContext('2d');
  c.font = '700 400px JudsonB';
  const m = c.measureText('J');
  // Ink box of the J at font-size 400 drawn at (0,0) on the baseline.
  const ink = { x: -m.actualBoundingBoxLeft, y: -m.actualBoundingBoxAscent,
                w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
                h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  for (const g of document.querySelectorAll('g.fit')) {
    const h = +g.dataset.h, s = h / ink.h, cx = +g.dataset.cx, cy = +g.dataset.cy;
    // Nudge left a touch: the extrusion and the J's hook both sit right/low.
    const tx = cx - (ink.x + ink.w / 2) * s - h * 0.03, ty = cy - (ink.y + ink.h / 2) * s - h * 0.01;
    g.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
    g.querySelectorAll('text').forEach((t) => t.setAttribute('stroke-width', (+t.dataset.sw / s).toFixed(2)));
    g.querySelector('text').setAttribute('transform', `translate(${(+g.dataset.ext / s).toFixed(2)} ${(+g.dataset.ext / s).toFixed(2)})`);
  }
}'''
def page(body):
    return f'''<html><head><style>@font-face{{font-family:JudsonB;src:url(file://{FONT});font-weight:700}}
body{{margin:0;font:14px sans-serif}} svg{{display:block;width:100%;height:100%}}</style></head><body>{body}</body></html>'''
