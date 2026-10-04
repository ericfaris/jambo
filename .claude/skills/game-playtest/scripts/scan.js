/* global document, getComputedStyle */
() => {
  const out = [];
  let n = 0;
  document.querySelectorAll('[data-pt]').forEach(e => e.removeAttribute('data-pt'));
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const pk = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    if (!pk) continue;
    const props = el[pk];
    if (typeof props.onClick !== 'function') continue;
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    let f = el[fk]; const info = {};
    const comps = [];
    for (let i = 0; f && i < 14; i++, f = f.return) {
      const p = f.memoizedProps || {};
      if (typeof f.type === 'function') comps.push(f.type.name);
      if (info.cardId === undefined && typeof p.cardId === 'string') info.cardId = p.cardId;
      if (info.ware === undefined && typeof p.type === 'string' && typeof f.type === 'function' && f.type.name === 'WareToken') info.ware = p.type;
      if (info.key === undefined && f.key != null) info.key = f.key;
    }
    info.comps = comps.slice(0, 6).join('>');
    const id = String(n++);
    el.setAttribute('data-pt', id);
    out.push({ id, tag: el.tagName, text: (el.innerText || el.getAttribute('alt') || '').trim().slice(0, 50).replace(/\s+/g, ' '), title: el.title || '', ...info, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
}
