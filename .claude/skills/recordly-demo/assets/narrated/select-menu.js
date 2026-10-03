// Stand-in for a native <select> popup (headless Chromium paints none): drawn where the OS menu opens; the value is set
// on the desk's real select. Injected into 20-car by fill-client.cjs long-storyboard ({{SELECT_MENU_JS}}); styled by
// select-menu.css. Only select[name=language] is intercepted.
(() => {
  if (window.__vidMenuOn) return; window.__vidMenuOn = true;
  const close = () => { const m = document.getElementById('vid-menu'); if (m) m.remove(); };
  const open = (s) => {
    close();
    const r = s.getBoundingClientRect();
    const m = document.createElement('div'); m.id = 'vid-menu';
    m.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + (r.bottom + 6) + 'px;width:' + r.width + 'px;z-index:2147483646';
    for (const o of s.options) { if (o.disabled) continue; const d = document.createElement('div'); d.className = 'vid-opt'; d.dataset.v = o.value; d.dataset.on = String(o.value === s.value); d.textContent = o.textContent; m.appendChild(d); }
    document.body.appendChild(m);
  };
  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    const s = t.closest && t.closest('select[name=language]');
    if (s) { e.preventDefault(); s.focus(); open(s); return; }
    const o = t.closest && t.closest('.vid-opt');
    if (o) { e.preventDefault(); const sel = document.querySelector('select[name=language]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, o.dataset.v); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); return; }
    close();
  }, true);
})()
