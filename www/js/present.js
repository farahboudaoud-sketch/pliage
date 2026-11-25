/* Pliage — mode présentation : une page à la fois, en plein écran, pour des diapos en PDF. */
(function () {
  let P = null;

  /**
   * doc : document pdf.js ; page : page de départ (0…) ;
   * overlay(i) : SVG des ajouts de la page i (annotations, signatures…), ou ''.
   */
  function start(doc, page, overlay) {
    if (P) stop();
    const el = UI.el(`<div class="present" role="dialog" aria-label="Présentation">
      <div class="pr-stage"><canvas></canvas><div class="pr-ov"></div></div>
      <div class="pr-bar">
        <button class="pr-b" data-prev aria-label="Page précédente">${UI.icon('back', 22)}</button>
        <span class="pr-n"></span>
        <button class="pr-b" data-next aria-label="Page suivante">${UI.icon('chevron', 22)}</button>
        <button class="pr-b" data-exit aria-label="Quitter le plein écran">${UI.icon('close', 22)}</button>
      </div>
      <div class="pr-hint">${Native.isDesktop ? 'Flèches ou clic pour avancer · Échap pour quitter' : 'Touche à droite pour avancer, à gauche pour revenir'}</div>
    </div>`);
    document.body.appendChild(el);
    P = { el, doc, page: Math.max(0, Math.min(doc.numPages - 1, page || 0)), overlay, cache: new Map(), token: 0, fs: false };
    const canvas = el.querySelector('canvas');
    P.canvas = canvas;

    el.querySelector('[data-prev]').addEventListener('click', (e) => { e.stopPropagation(); go(P.page - 1); });
    el.querySelector('[data-next]').addEventListener('click', (e) => { e.stopPropagation(); go(P.page + 1); });
    el.querySelector('[data-exit]').addEventListener('click', (e) => { e.stopPropagation(); stop(); });
    el.querySelector('.pr-bar').addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      if (P.swiped) { P.swiped = false; return; }
      go(e.clientX < window.innerWidth / 3 ? P.page - 1 : P.page + 1);
    });
    let x0 = null, y0 = null;
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { P.swiped = true; go(dx < 0 ? P.page + 1 : P.page - 1); }
    });
    let wheelLock = 0;
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (Date.now() < wheelLock || Math.abs(e.deltaY) < 8) return;
      wheelLock = Date.now() + 350;
      go(e.deltaY > 0 ? P.page + 1 : P.page - 1);
    }, { passive: false });
    // La barre et le curseur se cachent quand on ne bouge plus
    let idle = null;
    const wake = () => {
      el.classList.add('awake');
      clearTimeout(idle);
      idle = setTimeout(() => el.classList.remove('awake'), 2200);
    };
    el.addEventListener('mousemove', wake);
    el.addEventListener('touchstart', wake, { passive: true });
    wake();
    setTimeout(() => el.classList.add('hint-off'), 3500);

    P.onKey = (e) => {
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) { e.preventDefault(); go(P.page + 1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) { e.preventDefault(); go(P.page - 1); }
      else if (k === 'Home') { e.preventDefault(); go(0); }
      else if (k === 'End') { e.preventDefault(); go(P.doc.numPages - 1); }
      else if (k === 'Escape' || k === 'F5') { e.preventDefault(); e.stopImmediatePropagation(); stop(); }
    };
    document.addEventListener('keydown', P.onKey, true);
    P.onResize = () => { if (P) { P.cache.clear(); show(); } };
    window.addEventListener('resize', P.onResize);
    P.onFs = () => { if (P && P.fs && !document.fullscreenElement) stop(); };
    document.addEventListener('fullscreenchange', P.onFs);

    // Vrai plein écran : fenêtre sur PC, barres système masquées sur téléphone
    const root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (P) P.fs = true; }).catch(() => {});
    Native.setImmersive(true);
    show();
  }

  async function render(i, w, h) {
    const key = i + '@' + w + 'x' + h;
    if (P.cache.has(key)) return P.cache.get(key);
    const job = (async () => {
      const page = await P.doc.getPage(i + 1);
      const vp1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const fit = Math.min(w / vp1.width, h / vp1.height);
      const vp = page.getViewport({ scale: fit * dpr });
      const cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width);
      cv.height = Math.floor(vp.height);
      const g = cv.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      return { cv, cssW: vp1.width * fit, cssH: vp1.height * fit, pw: vp1.width, ph: vp1.height };
    })();
    P.cache.set(key, job);
    // Garde en mémoire seulement quelques pages autour de la page affichée
    if (P.cache.size > 6) P.cache.delete(P.cache.keys().next().value);
    return job;
  }

  async function show() {
    if (!P) return;
    const t = ++P.token;
    const w = window.innerWidth, h = window.innerHeight;
    P.el.querySelector('.pr-n').textContent = `${P.page + 1} / ${P.doc.numPages}`;
    let r;
    try { r = await render(P.page, w, h); } catch (e) { return; }
    if (!P || t !== P.token) return;
    const c = P.canvas;
    c.width = r.cv.width;
    c.height = r.cv.height;
    c.getContext('2d').drawImage(r.cv, 0, 0);
    c.style.width = r.cssW + 'px';
    c.style.height = r.cssH + 'px';
    const ov = P.el.querySelector('.pr-ov');
    ov.style.width = r.cssW + 'px';
    ov.style.height = r.cssH + 'px';
    ov.innerHTML = P.overlay ? P.overlay(P.page) || '' : '';
    // Prépare la page suivante pour un passage instantané
    if (P.page + 1 < P.doc.numPages) render(P.page + 1, w, h).catch(() => {});
  }

  function go(i) {
    if (!P) return;
    if (i >= P.doc.numPages) { P.el.classList.add('end'); setTimeout(() => P && P.el.classList.remove('end'), 900); return; }
    i = Math.max(0, i);
    if (i === P.page) return;
    P.page = i;
    show();
  }

  function stop() {
    if (!P) return;
    const p = P;
    P = null;
    document.removeEventListener('keydown', p.onKey, true);
    window.removeEventListener('resize', p.onResize);
    document.removeEventListener('fullscreenchange', p.onFs);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    Native.setImmersive(false);
    p.el.remove();
    if (p.onStop) p.onStop(p.page);
  }

  window.Present = { start, stop, active: () => !!P, page: () => (P ? P.page : 0), onStop: (cb) => { if (P) P.onStop = cb; } };
})();
