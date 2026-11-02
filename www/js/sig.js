/* Pliage — signatures et initiales : tracé au doigt, enregistrement, choix. */
(function () {
  const INKS = [['Noir', '#1E1E1E'], ['Bleu', '#1A2A6C'], ['Bordeaux', '#7B1E2B']];
  const WIDTHS = [['Fin', 2.2], ['Moyen', 3.6], ['Épais', 5.5]];

  /** Ouvre l'écran de tracé. Renvoie { dataUrl, ratio } ou null. */
  function draw(kind) {
    return new Promise((resolve) => {
      let ink = INKS[1][1], width = WIDTHS[1][1], strokes = [], cur = null, done = false;
      const scr = UI.el(`<section class="scr sig">
        ${UI.header(kind === 'initiales' ? 'Mes initiales' : 'Ma signature')}
        <div class="scr-body">
          <div class="seg" role="tablist"><button data-k="signature" class="${kind !== 'initiales' ? 'on' : ''}">Signature</button><button data-k="initiales" class="${kind === 'initiales' ? 'on' : ''}">Initiales</button></div>
          <div class="pad"><canvas aria-label="Zone de signature"></canvas><div class="pad-line"></div><span class="pad-hint">Signe au doigt au-dessus de la ligne</span>
            <button class="btn sm sec pad-clear">Effacer</button></div>
          <div class="opt-row"><span class="lbl">Encre</span>${INKS.map(([n, c]) => `<button class="sw big${c === ink ? ' on' : ''}" data-ink="${c}" aria-label="${n}" style="background:${c}"></button>`).join('')}</div>
          <div class="opt-row"><span class="lbl">Épaisseur</span>${WIDTHS.map(([n, w]) => `<button class="wd${w === width ? ' on' : ''}" data-w="${w}" aria-label="${n}"><i style="height:${Math.round(w)}px"></i></button>`).join('')}</div>
          <div class="saved"></div>
        </div>
        <footer class="foot row2"><button class="btn sec" data-save>Enregistrer</button><button class="btn" data-use>Placer sur le document</button></footer>
      </section>`);
      const cv = scr.querySelector('canvas');
      const g = cv.getContext('2d');
      const fit = () => {
        const r = cv.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.max(1, r.width * dpr);
        cv.height = Math.max(1, r.height * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        paint();
      };
      const paint = () => {
        g.clearRect(0, 0, cv.width, cv.height);
        for (const s of strokes.concat(cur ? [cur] : [])) {
          g.strokeStyle = s.ink; g.lineWidth = s.w; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath();
          s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
          g.stroke();
        }
      };
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { ink, w: width, pts: [pt(e)] }; paint(); });
      cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(pt(e)); paint(); });
      const up = () => { if (cur) { strokes.push(cur); cur = null; paint(); } };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      scr.querySelector('.pad-clear').addEventListener('click', () => { strokes = []; paint(); });
      scr.querySelectorAll('[data-ink]').forEach((b) => b.addEventListener('click', () => {
        ink = b.dataset.ink;
        strokes.forEach((s) => { s.ink = ink; });
        scr.querySelectorAll('[data-ink]').forEach((x) => x.classList.toggle('on', x === b));
        paint();
      }));
      scr.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
        width = +b.dataset.w;
        strokes.forEach((s) => { s.w = width; });
        scr.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b));
        paint();
      }));
      scr.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
        kind = b.dataset.k;
        scr.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
        scr.querySelector('.t1').textContent = kind === 'initiales' ? 'Mes initiales' : 'Ma signature';
        listSaved();
      }));

      const exportPng = () => {
        if (!strokes.length) return null;
        let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
        strokes.forEach((s) => s.pts.forEach(([x, y]) => { x1 = Math.min(x1, x - s.w); y1 = Math.min(y1, y - s.w); x2 = Math.max(x2, x + s.w); y2 = Math.max(y2, y + s.w); }));
        const k = 3, w = Math.max(10, x2 - x1), h = Math.max(10, y2 - y1);
        const out = document.createElement('canvas');
        out.width = Math.round(w * k); out.height = Math.round(h * k);
        const o = out.getContext('2d');
        o.scale(k, k);
        o.translate(-x1, -y1);
        strokes.forEach((s) => {
          o.strokeStyle = s.ink; o.lineWidth = s.w; o.lineCap = 'round'; o.lineJoin = 'round';
          o.beginPath();
          s.pts.forEach((p, i) => (i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1])));
          if (s.pts.length === 1) o.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
          o.stroke();
        });
        return { dataUrl: out.toDataURL('image/png'), ratio: w / h };
      };

      const listSaved = () => {
        const box = scr.querySelector('.saved');
        const list = Store.signatures().filter((s) => (s.kind || 'signature') === kind);
        box.innerHTML = list.length ? `<span class="lbl">Enregistrées</span><div class="sig-grid">${list.map((s) => `<button class="sig-item" data-id="${s.id}"><img src="${s.dataUrl}" alt="${kind === 'initiales' ? 'Initiales enregistrées' : 'Signature enregistrée'}"></button>`).join('')}</div>` : '';
        box.querySelectorAll('.sig-item').forEach((b) => b.addEventListener('click', () => {
          const s = Store.signatures().find((x) => x.id === b.dataset.id);
          if (!s) return;
          done = true;
          UI.pop();
          resolve({ dataUrl: s.dataUrl, ratio: s.ratio });
        }));
      };
      listSaved();

      scr.querySelector('[data-save]').addEventListener('click', () => {
        const r = exportPng();
        if (!r) return UI.toast('Signe d’abord dans le cadre', true);
        Store.addSignature({ kind, dataUrl: r.dataUrl, ratio: r.ratio });
        strokes = [];
        paint();
        listSaved();
        UI.toast(kind === 'initiales' ? 'Initiales enregistrées' : 'Signature enregistrée');
      });
      scr.querySelector('[data-use]').addEventListener('click', () => {
        const r = exportPng();
        if (!r) return UI.toast('Signe d’abord dans le cadre', true);
        if (!Store.signatures().some((s) => s.dataUrl === r.dataUrl)) Store.addSignature({ kind, dataUrl: r.dataUrl, ratio: r.ratio });
        done = true;
        UI.pop();
        resolve(r);
      });
      scr.querySelector('[data-back]').addEventListener('click', () => UI.pop());
      UI.push(scr, () => { if (!done) resolve(null); });
      setTimeout(fit, 260);
      window.addEventListener('resize', fit);
    });
  }

  /** Propose les signatures enregistrées, ou d'en tracer une nouvelle. */
  function choose(kind) {
    const list = Store.signatures().filter((s) => (s.kind || 'signature') === kind);
    if (!list.length) return draw(kind);
    return new Promise((resolve) => {
      let done = false;
      const s = UI.sheet(`<div class="sh-title">${kind === 'initiales' ? 'Mes initiales' : 'Ma signature'}</div>
        <div class="sig-grid">${list.map((x) => `<button class="sig-item" data-id="${x.id}"><img src="${x.dataUrl}" alt="Enregistrée"></button>`).join('')}</div>
        <button class="btn sec wide" data-new>${UI.icon('plus', 18)} Tracer une nouvelle</button>`, { onClose: () => { if (!done) resolve(null); } });
      s.el.querySelectorAll('.sig-item').forEach((b) => b.addEventListener('click', () => {
        const x = list.find((y) => y.id === b.dataset.id);
        done = true;
        s.close();
        resolve({ dataUrl: x.dataUrl, ratio: x.ratio });
      }));
      s.el.querySelector('[data-new]').addEventListener('click', () => {
        done = true;
        s.close();
        draw(kind).then(resolve);
      });
    });
  }

  window.Sig = { draw, choose };
})();
