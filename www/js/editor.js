/* Pliage — éditeur PDF : annoter, dessiner, texte, images, signatures, formulaires. */
(function () {
  const { PDFDocument, StandardFonts, rgb, degrees, BlendMode, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } = PDFLib;

  const COLORS = [['Jaune', '#F2C94C'], ['Bordeaux', '#7B1E2B'], ['Bleu', '#2D6CDF'], ['Vert', '#2E9E6A'], ['Noir', '#1E1E1E']];
  const CATS = {
    Annoter: [['select', 'Sélection', 'hand'], ['hl', 'Surligner', 'highlight'], ['ul', 'Souligner', 'underline'], ['st', 'Barrer', 'strike'], ['pen', 'Stylo', 'pen'], ['shape', 'Formes', 'shapes'], ['note', 'Note', 'note']],
    Texte: [['select', 'Sélection', 'hand'], ['text', 'Ajouter', 'text'], ['replace', 'Remplacer', 'replace'], ['img', 'Image', 'image'], ['mask', 'Masquer', 'mask'], ['eraser', 'Gomme', 'eraser']],
    Signer: [['select', 'Sélection', 'hand'], ['sig', 'Signature', 'signature'], ['ini', 'Initiales', 'initials'], ['date', 'Date', 'date'], ['check', 'Coche', 'tick']],
    Formulaire: [['fields', 'Champs', 'fields'], ['check', 'Cases', 'boxes'], ['flatten', 'Aplatir', 'flatten']],
  };
  const HINTS = {
    hl: 'Glisse le doigt sur le texte à surligner', ul: 'Glisse le doigt sur le texte à souligner', st: 'Glisse le doigt sur le texte à barrer',
    pen: 'Dessine sur la page', shape: 'Glisse pour tracer la forme', note: 'Touche la page pour ajouter une note',
    text: 'Touche la page où écrire', replace: 'Touche la ligne de texte à remplacer', mask: 'Glisse pour recouvrir une zone',
    eraser: 'Touche un ajout pour l’effacer', date: 'Touche la page où mettre la date', check: 'Touche la page pour cocher',
    fields: 'Remplis les champs directement sur la page',
  };

  let S = null; // document actif
  const sessions = []; // documents ouverts (onglets)
  // Sur PC, les consignes parlent de souris
  const say = (t) => (Native.isDesktop ? String(t).replace(/Touche/g, 'Clique').replace(/touche/g, 'clique').replace(/Glisse le doigt/g, 'Fais glisser la souris').replace(/Glisse/g, 'Fais glisser').replace(/Dessine sur la page/, 'Dessine sur la page avec la souris') : t);
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = UI.esc;

  // ---------------------------------------------------------------- Ouverture

  /** Conteneur de l'éditeur : barre d'onglets + documents. */
  function host() {
    const tab = document.getElementById('tab-modifier');
    let h = tab.querySelector(':scope > .ed-host');
    if (!h) {
      tab.innerHTML = '';
      h = UI.el('<div class="ed-host"><div class="ed-tabs" role="tablist" aria-label="Documents ouverts"></div><div class="ed-docs"></div></div>');
      tab.appendChild(h);
    }
    return h;
  }

  function renderTabs() {
    const h = document.querySelector('#tab-modifier > .ed-host');
    if (!h) return;
    const bar = h.querySelector('.ed-tabs');
    h.classList.toggle('multi', sessions.length > 1);
    bar.innerHTML = sessions.map((s, i) => `<div class="edt${s === S ? ' on' : ''}" role="tab" aria-selected="${s === S}" data-i="${i}" title="${esc(s.file.name)}">
      <button class="edt-n" data-act="${i}">${s.dirty ? '<i class="dot" aria-label="Modifié"></i>' : ''}${esc(s.file.name)}</button>
      <button class="edt-x" data-x="${i}" aria-label="Fermer ${esc(s.file.name)}">${UI.icon('close', 15)}</button></div>`).join('')
      + `<button class="edt-add" data-add aria-label="Ouvrir un autre PDF" title="Ouvrir un autre PDF">${UI.icon('plus', 18)}</button>`;
    bar.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => activate(sessions[+b.dataset.act])));
    bar.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', async () => { activate(sessions[+b.dataset.x]); await tryClose(); }));
    bar.querySelector('[data-add]').addEventListener('click', async () => {
      const files = (await Native.pick(['application/pdf'], true)).filter((f) => !f.error);
      for (const f of files) {
        Store.addHistory({ name: f.name, path: f.path, size: f.size, mime: f.mime, tool: 'Ouvert' });
        await open(f);
      }
    });
    const on = bar.querySelector('.edt.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function activate(s) {
    if (!s) return;
    const prevW = S && S.root ? S.root.querySelector('.ed-scroll').clientWidth : 0;
    S = s;
    sessions.forEach((x) => { if (x.root) x.root.hidden = x !== s; });
    document.body.classList.add('editing');
    renderTabs();
    requestAnimationFrame(() => {
      if (S !== s) return;
      const w = s.root.querySelector('.ed-scroll').clientWidth;
      if (s.builtW && Math.abs(w - s.builtW) > 4 && w !== prevW) buildPages();
      updatePageLabel();
    });
  }

  async function open(file, opts) {
    opts = opts || {};
    const same = sessions.find((x) => x.file.path === file.path);
    if (same) {
      activate(same);
      if (same.view && opts.view === undefined) { same.view = false; same.root.classList.remove('viewing'); }
      return;
    }
    UI.busy('Ouverture du PDF…');
    try {
      const bytes = await Native.read(file.path);
      const js = await Pdf.loadJs(bytes, file.path);
      const pages = [];
      for (let i = 0; i < js.numPages; i++) {
        const p = await js.getPage(i + 1);
        const vp = p.getViewport({ scale: 1 });
        pages.push({ w: vp.width, h: vp.height, vp });
      }
      S = {
        file, bytes, js, pages, objs: [], undo: [], redo: [], zoom: 1, cat: opts.cat || 'Annoter', tool: 'select',
        view: !!opts.view, outside: !!opts.outside, color: '#F2C94C', width: 2, size: 14, shape: 'rect', mask: '#FFFFFF', flatten: false, sel: null,
        texts: {}, fields: [], values: {}, dirty: false, rendered: {}, observer: null,
      };
      if (S.cat === 'Signer') { S.tool = 'select'; S.color = '#1A2A6C'; }
      sessions.push(S);
      await loadFields();
      build(host().querySelector('.ed-docs'));
      activate(S);
      Store.setLast(file);
      UI.idle();
      if (opts.cat === 'Signer') setTimeout(() => pickTool('sig'), 250);
      if (S.fields.length && !opts.cat && !opts.view) UI.toast(S.fields.length + ' champ' + (S.fields.length > 1 ? 's' : '') + ' de formulaire à remplir');
    } catch (e) {
      UI.idle();
      UI.toast(e.message || 'Ouverture impossible', true);
    }
  }

  async function loadFields() {
    S.fields = [];
    try {
      const doc = await PDFDocument.load(S.bytes, { updateMetadata: false });
      const pageRefs = doc.getPages().map((p) => p.ref);
      const form = doc.getForm();
      for (const f of form.getFields()) {
        let type = null;
        if (f instanceof PDFTextField) type = 'text';
        else if (f instanceof PDFCheckBox) type = 'check';
        else if (f instanceof PDFRadioGroup) type = 'radio';
        else if (f instanceof PDFDropdown) type = 'select';
        if (!type) continue;
        const name = f.getName();
        const widgets = f.acroField.getWidgets();
        const options = type === 'radio' || type === 'select' ? f.getOptions() : [];
        widgets.forEach((w, wi) => {
          const r = w.getRectangle();
          const pref = w.P();
          let page = pref ? pageRefs.findIndex((ref) => ref === pref || (ref.objectNumber === pref.objectNumber)) : -1;
          if (page < 0) {
            page = doc.getPages().findIndex((p) => {
              const annots = p.node.Annots();
              if (!annots) return false;
              for (let k = 0; k < annots.size(); k++) if (annots.get(k) === w.ref || (w.ref && annots.get(k).objectNumber === w.ref.objectNumber)) return true;
              return false;
            });
          }
          if (page < 0) return;
          S.fields.push({ name, type, page, rect: [r.x, r.y, r.x + r.width, r.y + r.height], option: options[wi], options, multiline: type === 'text' && f.isMultiline && f.isMultiline() });
        });
        if (type === 'text') S.values[name] = f.getText() || '';
        else if (type === 'check') S.values[name] = f.isChecked();
        else if (type === 'radio' || type === 'select') S.values[name] = (f.getSelected && [].concat(f.getSelected())[0]) || '';
      }
    } catch (e) {
      console.warn('champs ignorés', e);
    }
  }

  function close(silent) {
    if (!S) return;
    const s = S;
    if (s.observer) s.observer.disconnect();
    try { s.js.destroy(); } catch (e) { /* rien */ }
    if (s.root) s.root.remove();
    const i = sessions.indexOf(s);
    if (i >= 0) sessions.splice(i, 1);
    S = null;
    if (sessions.length) { activate(sessions[Math.min(i, sessions.length - 1)]); return; }
    document.body.classList.remove('editing');
    if (!silent) App.showEditorEmpty();
  }

  // ---------------------------------------------------------------- Interface

  function build(host) {
    const root = UI.el(`<div class="ed">
      <header class="bar ed-top">
        <button class="ib" data-close aria-label="Fermer le document">${UI.icon('back')}</button>
        <div class="bar-t"><span class="t1">${esc(S.file.name)}</span><span class="t2 ed-pg">Page 1 sur ${S.pages.length}</span></div>
        <button class="ib" data-share aria-label="${Native.isDesktop ? 'Montrer dans le dossier' : 'Partager'}">${UI.icon(Native.isDesktop ? 'folder' : 'share', 20)}</button>
        <button class="btn sm" data-edit>${UI.icon('pencil', 18)} Modifier</button>
        <button class="ib" data-undo aria-label="Annuler">${UI.icon('undo', 20)}</button>
        <button class="ib" data-redo aria-label="Rétablir">${UI.icon('redo', 20)}</button>
        <button class="btn sm" data-save>Enregistrer</button>
      </header>
      <div class="ed-main">
        <aside class="ed-tools" aria-label="Outils de modification">
          <div class="ed-side-t">Outils de modification</div>
          <div class="ed-cats" role="tablist"></div>
          <div class="ed-row"></div>
          <div class="ed-opts"></div>
        </aside>
        <div class="ed-scroll"><div class="ed-pages"></div>
          <div class="ed-zoom"><button class="ib" data-zout aria-label="Dézoomer">${UI.icon('zoomout', 20)}</button><button class="ib" data-zin aria-label="Zoomer">${UI.icon('zoomin', 20)}</button></div>
        </div>
        <div class="ed-rail" aria-label="Pages et zoom">
          <button class="ib" data-rzin aria-label="Zoomer" title="Zoomer">${UI.icon('zoomin', 20)}</button>
          <button class="ib" data-rzout aria-label="Dézoomer" title="Dézoomer">${UI.icon('zoomout', 20)}</button>
          <span class="rail-z" aria-live="polite">100 %</span>
          <button class="ib" data-fit aria-label="Ajuster à la largeur" title="Ajuster à la largeur (Ctrl+0)">${UI.icon('slides', 20)}</button>
          <span class="rail-sep"></span>
          <button class="ib" data-prev aria-label="Page précédente" title="Page précédente">${UI.icon('up', 20)}</button>
          <div class="rail-pages">${S.pages.length <= 60 ? S.pages.map((p, i) => `<button class="rp${i === 0 ? ' on' : ''}" data-goto="${i}" aria-label="Page ${i + 1}">${i + 1}</button>`).join('') : ''}</div>
          <button class="ib" data-next aria-label="Page suivante" title="Page suivante">${UI.icon('down', 20)}</button>
        </div>
      </div>
    </div>`);
    host.appendChild(root);
    S.root = root;
    root.classList.toggle('viewing', !!S.view);
    root.querySelector('[data-close]').addEventListener('click', tryClose);
    root.querySelector('[data-share]').addEventListener('click', () => Native.share([S.file.path]).catch((e) => UI.toast(e.message, true)));
    root.querySelector('[data-edit]').addEventListener('click', () => {
      S.view = false;
      root.classList.remove('viewing');
      setTimeout(() => buildPages(), 30);
    });
    root.querySelector('[data-undo]').addEventListener('click', undo);
    root.querySelector('[data-redo]').addEventListener('click', redo);
    root.querySelector('[data-save]').addEventListener('click', saveFlow);
    root.querySelector('[data-zin]').addEventListener('click', () => setZoom(S.zoom * 1.25));
    root.querySelector('[data-zout]').addEventListener('click', () => setZoom(S.zoom / 1.25));
    root.querySelector('[data-rzin]').addEventListener('click', () => setZoom(S.zoom * 1.25));
    root.querySelector('[data-rzout]').addEventListener('click', () => setZoom(S.zoom / 1.25));
    root.querySelector('[data-fit]').addEventListener('click', () => { S.zoom = 1.0001; setZoom(1); });
    root.querySelector('[data-prev]').addEventListener('click', () => goto((S.current || 0) - 1));
    root.querySelector('[data-next]').addEventListener('click', () => goto((S.current || 0) + 1));
    root.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(+b.dataset.goto)));
    const scroll = root.querySelector('.ed-scroll');
    scroll.addEventListener('scroll', () => updatePageLabel(), { passive: true });
    wheelZoom(scroll);
    document.body.classList.add('editing');
    pinch(scroll);
    buildPages();
    renderTools();
  }

  async function tryClose() {
    if (S && S.dirty) {
      const ok = await UI.confirm('Fermer sans enregistrer ?', 'Tes modifications seront perdues.', 'Fermer', true);
      if (!ok) return;
    }
    close();
  }

  function fitScale() {
    const scroll = S.root.querySelector('.ed-scroll');
    const avail = Math.min(Native.isDesktop ? 880 : 4000, Math.max(240, (scroll.clientWidth || window.innerWidth) - 24));
    const maxW = Math.max(...S.pages.map((p) => p.w));
    return avail / maxW;
  }

  function buildPages() {
    const wrap = S.root.querySelector('.ed-pages');
    wrap.innerHTML = '';
    S.scale = fitScale() * S.zoom;
    if (S.observer) S.observer.disconnect();
    S.rendered = {};
    S.builtW = S.root.querySelector('.ed-scroll').clientWidth;
    const zl = S.root.querySelector('.rail-z');
    if (zl) zl.textContent = Math.round(S.zoom * 100) + ' %';
    const sess = S;
    S.observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) renderPage(sess, +en.target.dataset.page); });
    }, { root: S.root.querySelector('.ed-scroll'), rootMargin: '400px 0px' });
    S.pages.forEach((p, i) => {
      const d = UI.el(`<div class="ed-page" data-page="${i}" style="width:${Math.round(p.w * S.scale)}px;height:${Math.round(p.h * S.scale)}px">
        <canvas></canvas><div class="textLayer"></div>
        <svg class="ed-ov" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="ed-fields"></div></div>`);
      wrap.appendChild(d);
      S.observer.observe(d);
      bindPage(d, i);
      drawObjects(i);
      drawFields(i);
    });
  }

  async function renderPage(s, i) {
    const key = i + '@' + s.scale.toFixed(3);
    if (s.rendered[i] === key) return;
    s.rendered[i] = key;
    const d = s.root.querySelector(`.ed-page[data-page="${i}"]`);
    if (!d) return;
    const cv = d.querySelector('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const page = await s.js.getPage(i + 1);
    const vp = page.getViewport({ scale: s.scale * dpr });
    const tmp = document.createElement('canvas');
    tmp.width = Math.floor(vp.width);
    tmp.height = Math.floor(vp.height);
    const g = tmp.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, tmp.width, tmp.height);
    try {
      await page.render({ canvasContext: g, viewport: vp, annotationMode: pdfjsLib.AnnotationMode ? pdfjsLib.AnnotationMode.ENABLE : 1 }).promise;
    } catch (e) { return; }
    if (s.rendered[i] !== key || !d.isConnected) return;
    cv.width = tmp.width;
    cv.height = tmp.height;
    cv.getContext('2d').drawImage(tmp, 0, 0);
    tmp.width = tmp.height = 0;
    // Couche de texte invisible : permet de sélectionner et copier le texte
    try {
      const layer = d.querySelector('.textLayer');
      const tvp = page.getViewport({ scale: s.scale });
      layer.innerHTML = '';
      layer.style.setProperty('--scale-factor', String(s.scale));
      const task = pdfjsLib.renderTextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true }), container: layer, viewport: tvp, textDivs: [] });
      await task.promise;
      const end = document.createElement('div');
      end.className = 'endOfContent';
      layer.appendChild(end);
    } catch (e) { /* pas de texte sélectionnable sur cette page */ }
  }

  /** Ctrl + molette (ou pincement sur le pavé tactile) : zoom immédiat, centré sur la souris. */
  function wheelZoom(scroll) {
    scroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!S) return;
      const d = Math.max(-60, Math.min(60, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      setZoom(S.zoom * Math.exp(-d * 0.0035), { x: e.clientX, y: e.clientY });
    }, { passive: false });
  }

  /**
   * Change le zoom sans reconstruire les pages : on redimensionne les pages (l'image
   * actuelle s'étire tout de suite) et on garde sous le doigt ou la souris le même point
   * du document. Le rendu net est refait juste après, pour les pages visibles.
   */
  function setZoom(z, anchor) {
    if (!S) return;
    const nz = Math.max(0.6, Math.min(4, z));
    if (Math.abs(nz - S.zoom) < 0.002) return;
    const scroll = S.root.querySelector('.ed-scroll');
    const box = scroll.getBoundingClientRect();
    const ax = anchor ? anchor.x - box.left : scroll.clientWidth / 2;
    const ay = anchor ? anchor.y - box.top : scroll.clientHeight / 2;
    const s0 = S.scale;
    const s1 = fitScale() * nz;
    // Point du document sous l'ancre : page + position dans la page (en points PDF)
    const els = [...S.root.querySelectorAll('.ed-page')];
    const cy = scroll.scrollTop + ay, cx = scroll.scrollLeft + ax;
    let ref = els[0];
    for (const el of els) { if (el.offsetTop <= cy) ref = el; else break; }
    const relY = (cy - ref.offsetTop) / s0, relX = (cx - ref.offsetLeft) / s0;
    S.zoom = nz;
    S.scale = s1;
    els.forEach((el, i) => {
      const p = S.pages[i];
      el.style.width = Math.round(p.w * s1) + 'px';
      el.style.height = Math.round(p.h * s1) + 'px';
      const tl = el.querySelector('.textLayer');
      if (tl) tl.style.setProperty('--scale-factor', String(s1));
      el.querySelectorAll('.fld:not(.cb)').forEach((f) => { f.style.fontSize = (parseFloat(f.style.fontSize) || 12) * (s1 / s0) + 'px'; });
    });
    scroll.scrollLeft = ref.offsetLeft + relX * s1 - ax;
    scroll.scrollTop = ref.offsetTop + relY * s1 - ay;
    const zl = S.root.querySelector('.rail-z');
    if (zl) zl.textContent = Math.round(nz * 100) + ' %';
    if (S.sel) drawSelection();
    sharpen();
  }

  /** Refait le rendu net des pages visibles une fois le zoom stabilisé. */
  let sharpTimer = null;
  function sharpen() {
    clearTimeout(sharpTimer);
    const s = S;
    sharpTimer = setTimeout(() => {
      if (!s || !s.root || !s.root.isConnected) return;
      const scroll = s.root.querySelector('.ed-scroll');
      const top = scroll.scrollTop - 300, bot = scroll.scrollTop + scroll.clientHeight + 300;
      s.root.querySelectorAll('.ed-page').forEach((el) => {
        if (el.offsetTop + el.offsetHeight >= top && el.offsetTop <= bot) renderPage(s, +el.dataset.page);
      });
      s.builtW = scroll.clientWidth;
    }, 180);
  }

  function pinch(scroll) {
    let d0 = 0, z0 = 1, raf = 0, last = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    scroll.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && S) { d0 = dist(e.touches); z0 = S.zoom; }
    }, { passive: true });
    scroll.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      last = { z: z0 * (dist(e.touches) / d0), at: mid(e.touches) };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (last) setZoom(last.z, last.at); });
    }, { passive: false });
    scroll.addEventListener('touchend', (e) => { if (e.touches.length < 2) { d0 = 0; last = null; } });
  }

  function goto(i) {
    if (!S) return;
    i = Math.max(0, Math.min(S.pages.length - 1, i));
    const el = S.root.querySelector(`.ed-page[data-page="${i}"]`);
    if (el) S.root.querySelector('.ed-scroll').scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  }

  function updatePageLabel() {
    const scroll = S.root.querySelector('.ed-scroll');
    const pages = S.root.querySelectorAll('.ed-page');
    const mid = scroll.scrollTop + scroll.clientHeight / 2;
    let cur = 0;
    pages.forEach((p, i) => { if (p.offsetTop <= mid) cur = i; });
    S.current = cur;
    S.root.querySelector('.ed-pg').textContent = `Page ${cur + 1} sur ${S.pages.length}`;
    S.root.querySelectorAll('.rp').forEach((b, i) => b.classList.toggle('on', i === cur));
  }

  function renderTools() {
    const cats = S.root.querySelector('.ed-cats');
    cats.innerHTML = Object.keys(CATS).map((c) => `<button role="tab" aria-selected="${c === S.cat}" class="${c === S.cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
    cats.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      S.cat = b.dataset.cat;
      S.tool = CATS[S.cat][0][0];
      if (S.cat === 'Signer' && S.color === '#F2C94C') S.color = '#1A2A6C';
      if (S.cat === 'Annoter' && S.color === '#1A2A6C') S.color = '#F2C94C';
      select(null);
      renderTools();
      applyToolMode();
    }));
    const row = S.root.querySelector('.ed-row');
    row.innerHTML = CATS[S.cat].map(([id, label, ic]) => {
      const on = id === S.tool || (id === 'flatten' && S.flatten);
      return `<button class="tool${on ? ' on' : ''}" data-tool="${id}" aria-pressed="${on}">${UI.icon(ic, 22)}<span>${label}</span></button>`;
    }).join('');
    row.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => pickTool(b.dataset.tool)));
    renderOpts();
    applyToolMode();
  }

  function renderOpts() {
    const o = S.root.querySelector('.ed-opts');
    const t = S.tool;
    let html = '';
    const swatches = () => `<span class="lbl">Couleur</span>${COLORS.concat(S.cat === 'Signer' ? [['Bleu encre', '#1A2A6C']] : []).filter((c, i, a) => a.findIndex((x) => x[1] === c[1]) === i).map(([n, c]) => `<button class="sw${S.color === c ? ' on' : ''}" data-color="${c}" aria-label="${n}" style="background:${c}"></button>`).join('')}`;
    if (['hl', 'ul', 'st', 'pen', 'shape', 'text', 'check', 'date'].includes(t)) html += swatches();
    if (t === 'pen' || t === 'shape') html += `<span class="lbl sep">Épaisseur</span>${[1, 2, 4].map((w) => `<button class="wd${S.width === w ? ' on' : ''}" data-width="${w}" aria-label="Épaisseur ${w}"><i style="height:${w + 1}px"></i></button>`).join('')}`;
    if (t === 'shape') html = `<span class="lbl">Forme</span>${[['rect', 'Rectangle', 'M4 6h16v12H4z'], ['ellipse', 'Cercle', 'M12 5a8 7 0 1 0 0 14 8 7 0 0 0 0-14z'], ['line', 'Ligne', 'M5 19L19 5'], ['arrow', 'Flèche', 'M5 19L19 5M11 5h8v8']].map(([k, n, d]) => `<button class="wd${S.shape === k ? ' on' : ''}" data-shape="${k}" aria-label="${n}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="${d}"/></svg></button>`).join('')}</div><div class="ed-opts2">` + html;
    if (t === 'text' || t === 'date') html += `<span class="lbl sep">Taille</span>${[10, 14, 20, 28].map((s) => `<button class="wd txt${S.size === s ? ' on' : ''}" data-size="${s}">${s}</button>`).join('')}`;
    if (t === 'mask') html = `<span class="lbl">Couleur du cache</span>${[['Blanc', '#FFFFFF'], ['Noir', '#000000']].map(([n, c]) => `<button class="sw${S.mask === c ? ' on' : ''}" data-mask="${c}" aria-label="${n}" style="background:${c}"></button>`).join('')}`;
    if (t === 'select') html = S.sel ? `<button class="btn sm sec" data-act="edit">Modifier</button><button class="btn sm sec" data-act="dup">Dupliquer</button><button class="btn sm danger" data-act="del">Supprimer</button>` : `<span class="hint">Touche un ajout pour le déplacer ou le redimensionner</span>`;
    if (t === 'fields') html = `<span class="hint">${S.fields.length ? HINTS.fields : 'Aucun champ de formulaire dans ce PDF : utilise Ajouter (onglet Texte) pour écrire où tu veux.'}</span>`;
    if (S.cat === 'Formulaire') html += `<label class="chk"><input type="checkbox" data-flat ${S.flatten ? 'checked' : ''}> Aplatir à l’enregistrement</label>`;
    if (!html && HINTS[t]) html = `<span class="hint">${HINTS[t]}</span>`;
    o.innerHTML = say(`<div class="ed-opts1">${html}</div>`);
    o.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { S.color = b.dataset.color; if (S.sel) restyleSel({ color: S.color }); renderOpts(); }));
    o.querySelectorAll('[data-width]').forEach((b) => b.addEventListener('click', () => { S.width = +b.dataset.width; renderOpts(); }));
    o.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => { S.shape = b.dataset.shape; renderOpts(); }));
    o.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { S.size = +b.dataset.size; if (S.sel) restyleSel({ size: S.size }); renderOpts(); }));
    o.querySelectorAll('[data-mask]').forEach((b) => b.addEventListener('click', () => { S.mask = b.dataset.mask; renderOpts(); }));
    const flat = o.querySelector('[data-flat]');
    if (flat) flat.addEventListener('change', () => { S.flatten = flat.checked; renderTools(); });
    o.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => selAction(b.dataset.act)));
  }

  function applyToolMode() {
    S.root.classList.toggle('drawing', S.tool !== 'select' && S.tool !== 'fields' && S.tool !== 'flatten');
  }

  async function pickTool(id) {
    if (id === 'flatten') {
      S.flatten = !S.flatten;
      UI.toast(S.flatten ? 'Les champs seront figés dans la page à l’enregistrement' : 'Les champs resteront modifiables');
      renderTools();
      return;
    }
    select(null);
    if (id === 'sig' || id === 'ini') {
      const src = await Sig.choose(id === 'ini' ? 'initiales' : 'signature');
      if (src) placeImage(src.dataUrl, src.ratio, id === 'ini' ? 70 : 150);
      return;
    }
    if (id === 'img') {
      const files = await Native.pick(['image/*'], false);
      if (!files.length || files[0].error) return;
      try {
        UI.busy('Préparation de l’image…');
        const d = await Native.dirs();
        const out = await Native.processImage({ path: files[0].path, out: d.cache + '/work/img-' + Date.now() + '.png', format: 'png', quality: 100, maxSide: 1800 });
        const buf = await Native.read(out.path);
        const dataUrl = 'data:image/png;base64,' + b64(new Uint8Array(buf));
        UI.idle();
        placeImage(dataUrl, out.width / out.height, 180);
      } catch (e) {
        UI.idle();
        UI.toast(e.message || 'Image illisible', true);
      }
      return;
    }
    S.tool = id;
    renderTools();
    if (HINTS[id] && id !== 'fields') UI.toast(say(HINTS[id]));
  }

  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------------------------------------------------------------- Objets

  function commit() {
    S.undo.push(clone(S.objs));
    if (S.undo.length > 80) S.undo.shift();
    S.redo = [];
    if (!S.dirty) { S.dirty = true; renderTabs(); }
  }
  function undo() {
    if (!S.undo.length) return UI.toast('Rien à annuler');
    S.redo.push(clone(S.objs));
    S.objs = S.undo.pop();
    select(null);
    redrawAll();
  }
  function redo() {
    if (!S.redo.length) return UI.toast('Rien à rétablir');
    S.undo.push(clone(S.objs));
    S.objs = S.redo.pop();
    select(null);
    redrawAll();
  }
  function redrawAll() { S.pages.forEach((p, i) => drawObjects(i)); }

  function add(o) {
    commit();
    o.id = Store.uid();
    S.objs.push(o);
    drawObjects(o.page);
    return o;
  }

  function placeImage(dataUrl, ratio, width) {
    const page = S.current || 0;
    const p = S.pages[page];
    const w = Math.min(width, p.w * 0.6), h = w / (ratio || 2);
    const scroll = S.root.querySelector('.ed-scroll');
    const el = S.root.querySelector(`.ed-page[data-page="${page}"]`);
    let y = p.h / 2 - h / 2;
    if (el) {
      const visMid = (scroll.scrollTop + scroll.clientHeight / 2 - el.offsetTop) / S.scale;
      y = Math.max(10, Math.min(p.h - h - 10, visMid - h / 2));
    }
    const o = add({ t: 'img', page, x: (p.w - w) / 2, y, w, h, src: dataUrl });
    S.tool = 'select';
    renderTools();
    select(o);
    UI.toast('Fais glisser pour placer, coin en bas à droite pour la taille');
  }

  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    return n;
  }

  function textLines(o) { return String(o.text || '').split('\n'); }
  function textBox(o) {
    const lines = textLines(o);
    const w = Math.max(...lines.map((l) => measure(l, o.size, o.bold, o.font, o.italic))) + 4;
    return { x: o.x, y: o.y, w, h: lines.length * o.size * 1.25 };
  }
  const mctx = document.createElement('canvas').getContext('2d');
  function measure(text, size, bold, font, italic) {
    mctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${famCss(font)}`;
    return mctx.measureText(text).width;
  }

  // ---------------------------------------------------------------- Polices du texte remplacé
  // On reprend la famille (sans empattement, à empattement, chasse fixe, Calibri), le gras,
  // l'italique et la couleur de la ligne d'origine, pour que le nouveau texte se fonde dans la page.

  const FAMILIES = {
    helv: 'Helvetica, Arial, sans-serif',
    times: '"Times New Roman", Times, serif',
    courier: '"Courier New", Courier, monospace',
    carlito: 'Carlito, Calibri, Helvetica, Arial, sans-serif',
  };
  const famCss = (f) => FAMILIES[f] || FAMILIES.helv;
  const STANDARD = {
    helv: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
    times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
    courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
  };
  const carlitoKey = (o) => (o.bold ? 'b' : '') + (o.italic ? 'i' : '') || 'r';

  function b64bytes(b) {
    const bin = atob(b);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function loadScript(src) {
    return new Promise((ok, ko) => {
      const n = document.createElement('script');
      n.src = src;
      n.onload = ok;
      n.onerror = () => ko(new Error('Chargement impossible : ' + src));
      document.head.appendChild(n);
    });
  }
  let carlitoReady = null;
  /** Charge à la demande la police Carlito (équivalent libre de Calibri) et fontkit pour l'intégrer au PDF. */
  function ensureCarlito() {
    if (!carlitoReady) {
      carlitoReady = (async () => {
        if (!window.PliageFonts || !window.PliageFonts.carlito) await loadScript('lib/carlito.js');
        if (!window.fontkit) await loadScript('lib/fontkit.umd.min.js');
        const c = window.PliageFonts.carlito;
        await Promise.all([['r', '400', 'normal'], ['b', '700', 'normal'], ['i', '400', 'italic'], ['bi', '700', 'italic']].map(async ([k, weight, style]) => {
          const f = new FontFace('Carlito', b64bytes(c[k]), { weight, style });
          await f.load();
          document.fonts.add(f);
        }));
      })().catch((e) => { carlitoReady = null; throw e; });
    }
    return carlitoReady;
  }

  /** Famille, gras et italique de la police d'une ligne de texte. */
  async function lineFont(page, line) {
    const main = line.items.reduce((a, b) => (b.str.length > a.str.length ? b : a), line.items[0]);
    let info = {};
    try {
      const pg = await S.js.getPage(page + 1);
      if (main.fontName && !pg.commonObjs.has(main.fontName)) await pg.getOperatorList();
      if (main.fontName && pg.commonObjs.has(main.fontName)) info = pg.commonObjs.get(main.fontName) || {};
    } catch (e) { /* police illisible : on devine avec ce qu'on a */ }
    const name = String(info.name || '').replace(/^[A-Z]{6}\+/, '').toLowerCase();
    const hint = (name + ' ' + (info.fallbackName || '') + ' ' + (main.font || '')).toLowerCase();
    let font = 'helv';
    if (info.isMonospace || /courier|mono|consol|menlo|lucidaconsole|typewriter/.test(hint)) font = 'courier';
    else if (/calibri|carlito/.test(name)) font = 'carlito';
    else if (/times|georgia|garamond|cambria|caladea|antiqua|palatino|minion|baskerville|bookman|century|roman|didot|bodoni|caslon|merriweather|charter|tinos|liberationserif|dejavuserif|notoserif|sourceserif/.test(name)) font = 'times';
    else if (!/sans|arial|helvetica|verdana|tahoma|segoe|aptos|roboto|inter|open|lato|calibri/.test(name) && (info.isSerifFont || /(^|[^-])serif/.test(hint.replace(/sans-serif/g, '')))) font = 'times';
    const bold = !!(info.bold || info.black) || /bold|black|heavy|semibold|demibold|extrabold|[-,]bd\b/.test(name) || !!main.bold;
    const italic = !!info.italic || /italic|oblique|[-,]it\b|[-,]i$/.test(name);
    return { font, bold, italic };
  }

  /** Couleur du texte et couleur du fond, lues sur l'image de la page. */
  function lineColors(page, box) {
    try {
      const cv = S.root.querySelector(`.ed-page[data-page="${page}"] canvas`);
      if (!cv || !cv.width) return null;
      const k = cv.width / S.pages[page].w;
      const x = Math.max(0, Math.floor(box.x * k)), y = Math.max(0, Math.floor(box.y * k));
      const w = Math.min(cv.width - x, Math.ceil(box.w * k)), h = Math.min(cv.height - y, Math.ceil(box.h * k));
      if (w < 3 || h < 3) return null;
      const d = cv.getContext('2d').getImageData(x, y, w, h).data;
      // Fond : couleur la plus fréquente sur le bord du cadre
      const tally = new Map();
      const vote = (i) => {
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        const t = tally.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        t.n++; t.r += d[i]; t.g += d[i + 1]; t.b += d[i + 2];
        tally.set(key, t);
      };
      for (let i = 0; i < w; i++) { vote(i * 4); vote(((h - 1) * w + i) * 4); }
      for (let j = 0; j < h; j++) { vote(j * w * 4); vote((j * w + w - 1) * 4); }
      let best = null;
      tally.forEach((t) => { if (!best || t.n > best.n) best = t; });
      const bg = [best.r / best.n, best.g / best.n, best.b / best.n];
      // Texte : les pixels les plus éloignés du fond (le cœur des lettres, sans l'anticrénelage)
      const dist = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, dist(i));
      const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
      if (max < 60) return { bg: toHex(bg) };
      const acc = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (dist(i) < max * 0.8) continue;
        acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; n++;
      }
      return { bg: toHex(bg), color: toHex(acc.map((v) => v / n)) };
    } catch (e) { return null; }
  }

  function bbox(o) {
    switch (o.t) {
      case 'hl': case 'ul': case 'st': {
        const xs = o.rects.map((r) => r.x), ys = o.rects.map((r) => r.y);
        const x2 = Math.max(...o.rects.map((r) => r.x + r.w)), y2 = Math.max(...o.rects.map((r) => r.y + r.h));
        return { x: Math.min(...xs), y: Math.min(...ys), w: x2 - Math.min(...xs), h: y2 - Math.min(...ys) };
      }
      case 'pen': {
        const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      case 'rect': case 'ellipse': case 'line': case 'arrow':
        return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      case 'text': return textBox(o);
      case 'note': return { x: o.x, y: o.y, w: 150, h: Math.max(28, textLines(o).length * 11 + 14) };
      case 'replace': return o.box;
      case 'check': return { x: o.x, y: o.y, w: o.s, h: o.s };
      default: return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
  }

  function drawObjects(page) {
    const ov = S.root.querySelector(`.ed-page[data-page="${page}"] .ed-ov`);
    if (!ov) return;
    ov.innerHTML = '';
    for (const o of S.objs.filter((x) => x.page === page)) {
      const g = svg('g', { 'data-id': o.id, class: 'obj' });
      switch (o.t) {
        case 'hl': o.rects.forEach((r) => g.appendChild(svg('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: o.color, 'fill-opacity': 0.38, style: 'mix-blend-mode:multiply' }))); break;
        case 'ul': o.rects.forEach((r) => g.appendChild(svg('line', { x1: r.x, y1: r.y + r.h - 0.5, x2: r.x + r.w, y2: r.y + r.h - 0.5, stroke: o.color, 'stroke-width': Math.max(1, r.h * 0.07) }))); break;
        case 'st': o.rects.forEach((r) => g.appendChild(svg('line', { x1: r.x, y1: r.y + r.h * 0.55, x2: r.x + r.w, y2: r.y + r.h * 0.55, stroke: o.color, 'stroke-width': Math.max(1, r.h * 0.07) }))); break;
        case 'pen': g.appendChild(svg('polyline', { points: o.pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: o.color, 'stroke-width': o.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); break;
        case 'rect': g.appendChild(svg('rect', { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), width: Math.abs(o.x2 - o.x1), height: Math.abs(o.y2 - o.y1), fill: 'none', stroke: o.color, 'stroke-width': o.width })); break;
        case 'ellipse': g.appendChild(svg('ellipse', { cx: (o.x1 + o.x2) / 2, cy: (o.y1 + o.y2) / 2, rx: Math.abs(o.x2 - o.x1) / 2, ry: Math.abs(o.y2 - o.y1) / 2, fill: 'none', stroke: o.color, 'stroke-width': o.width })); break;
        case 'line': g.appendChild(svg('line', { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: o.color, 'stroke-width': o.width, 'stroke-linecap': 'round' })); break;
        case 'arrow': {
          g.appendChild(svg('line', { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, stroke: o.color, 'stroke-width': o.width, 'stroke-linecap': 'round' }));
          arrowHead(o).forEach(([a, b]) => g.appendChild(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.color, 'stroke-width': o.width, 'stroke-linecap': 'round' })));
          break;
        }
        case 'note': {
          const b = bbox(o);
          g.appendChild(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#FFF4BF', stroke: '#D9B53C', 'stroke-width': 0.8, rx: 2 }));
          textLines(o).forEach((l, i) => { const t = svg('text', { x: b.x + 6, y: b.y + 15 + i * 11, 'font-size': 9, 'font-family': 'Helvetica, Arial, sans-serif', fill: '#3B3000' }); t.textContent = l; g.appendChild(t); });
          break;
        }
        case 'text': case 'replace': {
          if (o.t === 'replace') g.appendChild(svg('rect', { x: o.box.x, y: o.box.y, width: o.box.w, height: o.box.h, fill: o.bg || '#FFFFFF' }));
          const x = o.t === 'replace' ? o.box.x + 1 : o.x;
          const y0 = o.t === 'replace' ? o.box.y + o.box.h * 0.8 : o.y + o.size * 0.95;
          textLines(o).forEach((l, i) => { const t = svg('text', { x, y: y0 + i * o.size * 1.25, 'font-size': o.size, 'font-family': famCss(o.font), 'font-weight': o.bold ? 'bold' : 'normal', 'font-style': o.italic ? 'italic' : 'normal', fill: o.color }); t.textContent = l; g.appendChild(t); });
          break;
        }
        case 'img': g.appendChild(svg('image', { x: o.x, y: o.y, width: o.w, height: o.h, href: o.src, preserveAspectRatio: 'none' })); break;
        case 'mask': g.appendChild(svg('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: o.color })); break;
        case 'check': g.appendChild(svg('path', { d: checkPath(o), fill: 'none', stroke: o.color, 'stroke-width': Math.max(1.4, o.s * 0.12), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); break;
      }
      // Zone de prise invisible pour sélectionner facilement
      const b = bbox(o);
      g.appendChild(svg('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, fill: 'transparent', class: 'hit' }));
      ov.appendChild(g);
    }
    if (S.sel && S.sel.page === page) drawSelection();
  }

  function arrowHead(o) {
    const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = 6 + o.width * 3;
    return [[[o.x2, o.y2], [o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45)]], [[o.x2, o.y2], [o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45)]]];
  }
  function checkPath(o) {
    const s = o.s;
    return o.mark === 'x'
      ? `M${o.x + s * 0.2} ${o.y + s * 0.2}L${o.x + s * 0.8} ${o.y + s * 0.8}M${o.x + s * 0.8} ${o.y + s * 0.2}L${o.x + s * 0.2} ${o.y + s * 0.8}`
      : `M${o.x + s * 0.15} ${o.y + s * 0.55}L${o.x + s * 0.42} ${o.y + s * 0.8}L${o.x + s * 0.88} ${o.y + s * 0.2}`;
  }

  function select(o) {
    S.sel = o;
    S.root && S.root.querySelectorAll('.ed-selbox').forEach((n) => n.remove());
    if (o) drawSelection();
    if (S.root && S.tool === 'select') renderOpts();
  }
  function drawSelection() {
    const o = S.sel;
    const ov = S.root.querySelector(`.ed-page[data-page="${o.page}"] .ed-ov`);
    if (!ov) return;
    ov.querySelectorAll('.ed-selbox').forEach((n) => n.remove());
    const b = bbox(o);
    const g = svg('g', { class: 'ed-selbox' });
    const k = 1 / S.scale;
    g.appendChild(svg('rect', { x: b.x - 3 * k, y: b.y - 3 * k, width: b.w + 6 * k, height: b.h + 6 * k, fill: 'none', stroke: '#7B1E2B', 'stroke-width': 1.5 * k, 'stroke-dasharray': `${4 * k} ${3 * k}` }));
    if (resizable(o)) g.appendChild(svg('rect', { class: 'ed-handle', x: b.x + b.w - 7 * k, y: b.y + b.h - 7 * k, width: 14 * k, height: 14 * k, fill: '#fff', stroke: '#7B1E2B', 'stroke-width': 1.5 * k, rx: 2 * k }));
    ov.appendChild(g);
  }
  const resizable = (o) => ['img', 'mask', 'rect', 'ellipse', 'text', 'check', 'note'].includes(o.t);

  function restyleSel(p) {
    if (!S.sel) return;
    commit();
    const o = S.objs.find((x) => x.id === S.sel.id);
    if (p.color && 'color' in o && o.t !== 'mask') o.color = p.color;
    if (p.size && (o.t === 'text' || o.t === 'replace')) o.size = p.size;
    S.sel = o;
    drawObjects(o.page);
  }

  async function selAction(act) {
    const o = S.sel && S.objs.find((x) => x.id === S.sel.id);
    if (!o) return;
    if (act === 'del') {
      commit();
      S.objs = S.objs.filter((x) => x.id !== o.id);
      select(null);
      drawObjects(o.page);
    } else if (act === 'dup') {
      const c = clone(o);
      moveObj(c, 12, 12);
      const n = add(c);
      select(n);
    } else if (act === 'edit') {
      if (o.t === 'text' || o.t === 'note' || o.t === 'replace') {
        const v = await UI.ask('Modifier le texte', o.text, 'Valider', { multiline: true });
        if (v == null) return;
        commit();
        o.text = v;
        drawObjects(o.page);
        select(o);
      } else UI.toast('Déplace-le ou change sa taille directement sur la page');
    }
  }

  function moveObj(o, dx, dy) {
    switch (o.t) {
      case 'hl': case 'ul': case 'st': o.rects.forEach((r) => { r.x += dx; r.y += dy; }); break;
      case 'pen': o.pts.forEach((p) => { p[0] += dx; p[1] += dy; }); break;
      case 'rect': case 'ellipse': case 'line': case 'arrow': o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; break;
      case 'replace': o.box.x += dx; o.box.y += dy; break;
      default: o.x += dx; o.y += dy;
    }
  }
  function resizeObj(o, b0, nw, nh) {
    nw = Math.max(8, nw); nh = Math.max(8, nh);
    if (o.t === 'img' || o.t === 'mask') {
      if (o.t === 'img') nh = nw * (b0.h / b0.w);
      o.w = nw; o.h = nh;
    } else if (o.t === 'rect' || o.t === 'ellipse') {
      o.x1 = b0.x; o.y1 = b0.y; o.x2 = b0.x + nw; o.y2 = b0.y + nh;
    } else if (o.t === 'text') {
      o.size = Math.max(5, Math.min(120, o._s0 * (nw / b0.w)));
    } else if (o.t === 'check') {
      o.s = Math.max(6, nw);
    }
  }

  // ---------------------------------------------------------------- Gestes sur la page

  function pagePoint(el, e) {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / S.scale, (e.clientY - r.top) / S.scale];
  }

  function hitTest(page, x, y) {
    const list = S.objs.filter((o) => o.page === page);
    for (let i = list.length - 1; i >= 0; i--) {
      const b = bbox(list[i]);
      const pad = 8 / S.scale;
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return list[i];
    }
    return null;
  }

  function bindPage(el, page) {
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (!S || e.button > 0) return;
      if (e.target.closest('.ed-fields input, .ed-fields select, .ed-fields textarea')) return;
      const [x, y] = pagePoint(el, e);
      const t = S.tool;
      S.current = page;
      if (t === 'select' || t === 'fields' || t === 'flatten') {
        const handle = e.target.classList && e.target.classList.contains('ed-handle');
        const o = handle ? S.sel : hitTest(page, x, y);
        if (!o) { if (S.sel) select(null); return; }
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        if (S.tool !== 'select') { S.tool = 'select'; renderTools(); }
        select(o);
        commit();
        const b0 = bbox(o);
        if (o.t === 'text') o._s0 = o.size;
        drag = { mode: handle && resizable(o) ? 'resize' : 'move', o, x0: x, y0: y, last: [x, y], b0, moved: false };
        return;
      }
      if (t === 'eraser') {
        const o = hitTest(page, x, y);
        if (o) { commit(); S.objs = S.objs.filter((z) => z.id !== o.id); drawObjects(page); }
        return;
      }
      if (['note', 'text', 'replace', 'date', 'check'].includes(t)) { tap(page, x, y); return; }
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { mode: 'draw', x0: x, y0: y, pts: [[x, y]] };
      const ov = el.querySelector('.ed-ov');
      drag.preview = svg('g', { class: 'ed-preview' });
      ov.appendChild(drag.preview);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pagePoint(el, e);
      if (drag.mode === 'move') {
        const dx = x - drag.last[0], dy = y - drag.last[1];
        if (Math.abs(x - drag.x0) + Math.abs(y - drag.y0) > 1) drag.moved = true;
        moveObj(drag.o, dx, dy);
        drag.last = [x, y];
        drawObjects(page);
      } else if (drag.mode === 'resize') {
        drag.moved = true;
        resizeObj(drag.o, drag.b0, drag.b0.w + (x - drag.x0), drag.b0.h + (y - drag.y0));
        drawObjects(page);
      } else if (drag.mode === 'draw') {
        drag.pts.push([x, y]);
        preview(drag, x, y);
      }
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.mode === 'move' || d.mode === 'resize') {
        if (!d.moved) { S.undo.pop(); }
        delete d.o._s0;
        drawObjects(page);
        return;
      }
      if (d.preview) d.preview.remove();
      const [x, y] = pagePoint(el, e);
      finishDraw(page, d, x, y);
    };
    el.addEventListener('pointerup', end);
    // Pendant un déplacement ou un dessin, la page ne défile pas
    el.addEventListener('touchmove', (e) => { if (drag && e.touches.length === 1) e.preventDefault(); }, { passive: false });
    el.addEventListener('pointercancel', () => { if (drag && drag.preview) drag.preview.remove(); drag = null; });
  }

  function preview(d, x, y) {
    const g = d.preview;
    g.innerHTML = '';
    const t = S.tool;
    if (t === 'pen') g.appendChild(svg('polyline', { points: d.pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: S.color, 'stroke-width': S.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    else if (t === 'shape') {
      const o = { x1: d.x0, y1: d.y0, x2: x, y2: y, color: S.color, width: S.width };
      if (S.shape === 'rect') g.appendChild(svg('rect', { x: Math.min(o.x1, x), y: Math.min(o.y1, y), width: Math.abs(x - o.x1), height: Math.abs(y - o.y1), fill: 'none', stroke: S.color, 'stroke-width': S.width }));
      else if (S.shape === 'ellipse') g.appendChild(svg('ellipse', { cx: (o.x1 + x) / 2, cy: (o.y1 + y) / 2, rx: Math.abs(x - o.x1) / 2, ry: Math.abs(y - o.y1) / 2, fill: 'none', stroke: S.color, 'stroke-width': S.width }));
      else g.appendChild(svg('line', { x1: o.x1, y1: o.y1, x2: x, y2: y, stroke: S.color, 'stroke-width': S.width }));
    } else {
      const fill = t === 'mask' ? S.mask : t === 'hl' ? S.color : 'none';
      g.appendChild(svg('rect', { x: Math.min(d.x0, x), y: Math.min(d.y0, y), width: Math.abs(x - d.x0), height: Math.max(2, Math.abs(y - d.y0)), fill, 'fill-opacity': t === 'mask' ? 1 : 0.3, stroke: t === 'mask' ? '#7B1E2B' : S.color, 'stroke-width': 1 / S.scale, 'stroke-dasharray': '3 2' }));
    }
  }

  async function textItems(page) {
    if (!S.texts[page]) S.texts[page] = await Pdf.pageText(S.js, page);
    return S.texts[page];
  }

  async function finishDraw(page, d, x, y) {
    const t = S.tool;
    const x1 = Math.min(d.x0, x), y1 = Math.min(d.y0, y), x2 = Math.max(d.x0, x), y2 = Math.max(d.y0, y);
    if (t === 'pen') {
      if (d.pts.length < 2) return;
      add({ t: 'pen', page, pts: simplify(d.pts, 0.6 / S.scale), color: S.color, width: S.width });
    } else if (t === 'shape') {
      if (Math.abs(x - d.x0) + Math.abs(y - d.y0) < 4) return;
      add({ t: S.shape, page, x1: d.x0, y1: d.y0, x2: x, y2: y, color: S.color, width: S.width });
    } else if (t === 'mask') {
      if (x2 - x1 < 3 || y2 - y1 < 3) return;
      add({ t: 'mask', page, x: x1, y: y1, w: x2 - x1, h: y2 - y1, color: S.mask });
    } else if (t === 'hl' || t === 'ul' || t === 'st') {
      const info = await textItems(page);
      const band = { x1, y1: y1 - 2, x2: Math.max(x2, x1 + 1), y2: Math.max(y2, y1 + 2) + 2 };
      const rects = [];
      for (const l of info.lines) {
        const hits = l.items.filter((it) => {
          const top = it.y - it.size * 0.85, bot = it.y + it.size * 0.22;
          return it.x + it.w >= band.x1 && it.x <= band.x2 && bot >= band.y1 && top <= band.y2;
        });
        if (!hits.length) continue;
        const size = Math.max(...hits.map((h) => h.size));
        let rx1 = Math.min(...hits.map((h) => h.x)), rx2 = Math.max(...hits.map((h) => h.x + h.w));
        // Ajuste au doigt sur une seule ligne : on coupe au début et à la fin du geste
        if (y2 - y1 < size * 1.2) { rx1 = Math.max(rx1, Math.min(x1, rx2 - 2)); rx2 = Math.min(rx2, Math.max(x2, rx1 + 2)); }
        rects.push({ x: rx1, y: l.y - size * 0.86, w: rx2 - rx1, h: size * 1.1 });
      }
      if (!rects.length) {
        if (x2 - x1 < 4) return;
        rects.push({ x: x1, y: y1, w: x2 - x1, h: Math.max(10, y2 - y1) });
      }
      add({ t, page, rects, color: S.color });
    }
  }

  function simplify(pts, tol) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = out[out.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) out.push(p);
    }
    if (out.length === 1) out.push(pts[pts.length - 1]);
    return out.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
  }

  async function tap(page, x, y) {
    const t = S.tool;
    if (t === 'note') {
      const v = await UI.ask('Nouvelle note', '', 'Ajouter', { multiline: true, placeholder: 'À vérifier avec le service RH' });
      if (!v) return;
      add({ t: 'note', page, x, y, text: wrap(v, 26) });
    } else if (t === 'text') {
      const v = await UI.ask('Texte à ajouter', '', 'Ajouter', { multiline: true });
      if (!v) return;
      const o = add({ t: 'text', page, x, y: y - S.size * 0.6, text: v, size: S.size, color: S.color === '#F2C94C' ? '#1E1E1E' : S.color, bold: false });
      S.tool = 'select';
      renderTools();
      select(o);
    } else if (t === 'date') {
      const v = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      add({ t: 'text', page, x, y: y - S.size * 0.6, text: v, size: S.size, color: S.color === '#F2C94C' ? '#1E1E1E' : S.color, bold: false });
    } else if (t === 'check') {
      const s = 14;
      add({ t: 'check', page, x: x - s / 2, y: y - s / 2, s, color: S.color === '#F2C94C' ? '#1E1E1E' : S.color, mark: 'v' });
    } else if (t === 'replace') {
      const info = await textItems(page);
      const line = info.lines.find((l) => y >= l.y - l.size * 0.95 && y <= l.y + l.size * 0.3 && x >= l.x - 4 && x <= l.x2 + 4);
      if (!line) return UI.toast(say('Touche directement une ligne de texte'));
      const v = await UI.ask('Remplacer le texte', line.text, 'Remplacer', { hint: 'La ligne d’origine est recouverte puis réécrite dans la même police, à la même taille et dans la même couleur.', allowEmpty: true });
      if (v == null) return;
      const pad = line.size * 0.08;
      const st = await lineFont(page, line);
      if (st.font === 'carlito') {
        try { await ensureCarlito(); } catch (e) { st.font = 'helv'; }
      }
      const orig = { x: line.x - pad, y: line.y - line.size * 0.92, w: line.x2 - line.x + pad * 2, h: line.size * 1.18 };
      const col = lineColors(page, orig) || {};
      add({
        t: 'replace', page, text: v, size: Math.round(line.size * 10) / 10, bold: st.bold, italic: st.italic, font: st.font,
        color: col.color || '#111111', bg: col.bg || '#FFFFFF',
        box: { x: orig.x, y: orig.y, w: Math.max(line.x2 - line.x, measure(v, line.size, st.bold, st.font, st.italic)) + pad * 2, h: orig.h },
      });
    }
  }

  function wrap(text, n) {
    return text.split('\n').map((l) => {
      const words = l.split(' ');
      const out = [];
      let cur = '';
      for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      out.push(cur);
      return out.join('\n');
    }).join('\n');
  }

  // ---------------------------------------------------------------- Champs de formulaire

  function drawFields(page) {
    const box = S.root.querySelector(`.ed-page[data-page="${page}"] .ed-fields`);
    if (!box) return;
    box.innerHTML = '';
    const vp = S.pages[page].vp;
    S.fields.filter((f) => f.page === page).forEach((f) => {
      const [x1, y1, x2, y2] = vp.convertToViewportRectangle(f.rect);
      const L = Math.min(x1, x2) / S.pages[page].w * 100, T = Math.min(y1, y2) / S.pages[page].h * 100;
      const W = Math.abs(x2 - x1) / S.pages[page].w * 100, H = Math.abs(y2 - y1) / S.pages[page].h * 100;
      const style = `left:${L}%;top:${T}%;width:${W}%;height:${H}%`;
      let n;
      if (f.type === 'text') {
        n = UI.el(f.multiline ? `<textarea class="fld" style="${style}" aria-label="${esc(f.name)}"></textarea>` : `<input class="fld" style="${style}" aria-label="${esc(f.name)}">`);
        n.value = S.values[f.name] || '';
        n.style.fontSize = Math.max(8, Math.min(18, Math.abs(y2 - y1) * S.scale * 0.6)) + 'px';
        n.addEventListener('input', () => { S.values[f.name] = n.value; if (!S.dirty) { S.dirty = true; renderTabs(); } syncSame(f, n); });
      } else if (f.type === 'check') {
        n = UI.el(`<input type="checkbox" class="fld cb" style="${style}" aria-label="${esc(f.name)}">`);
        n.checked = !!S.values[f.name];
        n.addEventListener('change', () => { S.values[f.name] = n.checked; if (!S.dirty) { S.dirty = true; renderTabs(); } syncSame(f, n); });
      } else if (f.type === 'radio') {
        n = UI.el(`<input type="radio" class="fld cb" style="${style}" name="r-${esc(f.name)}" aria-label="${esc(f.name + ' ' + (f.option || ''))}">`);
        n.checked = S.values[f.name] === f.option && f.option != null;
        n.addEventListener('change', () => { if (n.checked) { S.values[f.name] = f.option; S.dirty = true; } });
      } else if (f.type === 'select') {
        n = UI.el(`<select class="fld" style="${style}" aria-label="${esc(f.name)}"><option value=""></option>${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`);
        n.value = S.values[f.name] || '';
        n.addEventListener('change', () => { S.values[f.name] = n.value; S.dirty = true; });
      }
      if (n) { n.dataset.field = f.name; box.appendChild(n); }
    });
  }
  function syncSame(f, n) {
    S.root.querySelectorAll('.fld').forEach((m) => {
      if (m === n || m.dataset.field !== f.name) return;
      if (f.type === 'check') m.checked = n.checked; else m.value = n.value;
    });
  }

  // ---------------------------------------------------------------- Enregistrement

  function dataUrlBytes(u) {
    const bin = atob(u.split(',')[1]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  async function build_pdf() {
    const doc = await PDFDocument.load(S.bytes, { updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const embedded = {};
    /** Police PDF d'un texte : la même famille, le même gras et le même italique que l'original. */
    const fontFor = async (o) => {
      let fam = (STANDARD[o.font] || o.font === 'carlito') ? o.font : 'helv';
      const key = fam + (o.bold ? 'b' : '') + (o.italic ? 'i' : '');
      if (embedded[key]) return embedded[key];
      if (fam === 'carlito') {
        try {
          await ensureCarlito();
          doc.registerFontkit(window.fontkit);
          return (embedded[key] = await doc.embedFont(b64bytes(window.PliageFonts.carlito[carlitoKey(o)]), { subset: true }));
        } catch (e) { console.warn('Carlito', e); fam = 'helv'; }
      }
      return (embedded[key] = await doc.embedFont(StandardFonts[STANDARD[fam][(o.bold ? 1 : 0) + (o.italic ? 2 : 0)]]));
    };
    const safe = (f, s) => {
      let out = '';
      for (const ch of String(s)) {
        try { f.encodeText(ch); out += ch; } catch (e) { out += ch === '\t' ? '    ' : '?'; }
      }
      return out;
    };
    const pages = doc.getPages();
    const imgCache = {};
    for (let i = 0; i < S.pages.length; i++) {
      const list = S.objs.filter((o) => o.page === i);
      if (!list.length) continue;
      const pg = pages[i];
      const vp = S.pages[i].vp;
      const P = (x, y) => vp.convertToPdfPoint(x, y);
      const ang = (() => { const a = P(0, 0), b = P(1, 0); return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; })();
      const rectPdf = (x, y, w, h) => {
        const a = P(x, y), b = P(x + w, y + h);
        return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
      };
      const line = (x1, y1, x2, y2, color, thickness, opacity) => {
        const a = P(x1, y1), b = P(x2, y2);
        pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, color: hex(color), thickness, opacity, lineCap: 1 });
      };
      const text = (str, x, yBase, size, f, color) => {
        const p = P(x, yBase);
        pg.drawText(safe(f, str), { x: p[0], y: p[1], size, font: f, color: hex(color), rotate: degrees(ang) });
      };
      for (const o of list) {
        switch (o.t) {
          case 'hl':
            o.rects.forEach((r) => pg.drawRectangle(Object.assign(rectPdf(r.x, r.y, r.w, r.h), { color: hex(o.color), opacity: 0.38, blendMode: BlendMode.Multiply })));
            break;
          case 'ul': o.rects.forEach((r) => line(r.x, r.y + r.h - 0.5, r.x + r.w, r.y + r.h - 0.5, o.color, Math.max(1, r.h * 0.07))); break;
          case 'st': o.rects.forEach((r) => line(r.x, r.y + r.h * 0.55, r.x + r.w, r.y + r.h * 0.55, o.color, Math.max(1, r.h * 0.07))); break;
          case 'pen': {
            const d = o.pts.map((p, k) => { const q = P(p[0], p[1]); return (k ? 'L' : 'M') + q[0].toFixed(2) + ' ' + (-q[1]).toFixed(2); }).join(' ');
            pg.drawSvgPath(d, { x: 0, y: 0, borderColor: hex(o.color), borderWidth: o.width, borderLineCap: 1 });
            break;
          }
          case 'rect': pg.drawRectangle(Object.assign(rectPdf(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1)), { borderColor: hex(o.color), borderWidth: o.width })); break;
          case 'ellipse': {
            const r = rectPdf(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1));
            pg.drawEllipse({ x: r.x + r.width / 2, y: r.y + r.height / 2, xScale: r.width / 2, yScale: r.height / 2, borderColor: hex(o.color), borderWidth: o.width });
            break;
          }
          case 'line': line(o.x1, o.y1, o.x2, o.y2, o.color, o.width); break;
          case 'arrow': line(o.x1, o.y1, o.x2, o.y2, o.color, o.width); arrowHead(o).forEach(([a, b]) => line(a[0], a[1], b[0], b[1], o.color, o.width)); break;
          case 'note': {
            const b = bbox(o);
            pg.drawRectangle(Object.assign(rectPdf(b.x, b.y, b.w, b.h), { color: hex('#FFF4BF'), borderColor: hex('#D9B53C'), borderWidth: 0.8 }));
            textLines(o).forEach((l, k) => text(l, b.x + 6, b.y + 15 + k * 11, 9, font, '#3B3000'));
            break;
          }
          case 'text': {
            const f = await fontFor(o);
            textLines(o).forEach((l, k) => text(l, o.x, o.y + o.size * 0.95 + k * o.size * 1.25, o.size, f, o.color));
            break;
          }
          case 'replace': {
            const f = await fontFor(o);
            pg.drawRectangle(Object.assign(rectPdf(o.box.x, o.box.y, o.box.w, o.box.h), { color: hex(o.bg || '#FFFFFF') }));
            textLines(o).forEach((l, k) => text(l, o.box.x + 1, o.box.y + o.box.h * 0.8 + k * o.size * 1.25, o.size, f, o.color));
            break;
          }
          case 'mask': pg.drawRectangle(Object.assign(rectPdf(o.x, o.y, o.w, o.h), { color: hex(o.color) })); break;
          case 'check': {
            const s = o.s, w = Math.max(1.4, s * 0.12);
            if (o.mark === 'x') { line(o.x + s * 0.2, o.y + s * 0.2, o.x + s * 0.8, o.y + s * 0.8, o.color, w); line(o.x + s * 0.8, o.y + s * 0.2, o.x + s * 0.2, o.y + s * 0.8, o.color, w); }
            else { line(o.x + s * 0.15, o.y + s * 0.55, o.x + s * 0.42, o.y + s * 0.8, o.color, w); line(o.x + s * 0.42, o.y + s * 0.8, o.x + s * 0.88, o.y + s * 0.2, o.color, w); }
            break;
          }
          case 'img': {
            if (!imgCache[o.src]) imgCache[o.src] = o.src.startsWith('data:image/png') ? await doc.embedPng(dataUrlBytes(o.src)) : await doc.embedJpg(dataUrlBytes(o.src));
            const p = P(o.x, o.y + o.h);
            pg.drawImage(imgCache[o.src], { x: p[0], y: p[1], width: o.w, height: o.h, rotate: degrees(ang) });
            break;
          }
        }
      }
    }
    // Formulaire
    if (S.fields.length) {
      try {
        const form = doc.getForm();
        for (const [name, v] of Object.entries(S.values)) {
          let f;
          try { f = form.getField(name); } catch (e) { continue; }
          try {
            if (f instanceof PDFTextField) f.setText(safe(font, v || ''));
            else if (f instanceof PDFCheckBox) { if (v) f.check(); else f.uncheck(); }
            else if (f instanceof PDFRadioGroup) { if (v) f.select(v); }
            else if (f instanceof PDFDropdown) { if (v) f.select(v); else f.clear(); }
          } catch (e) { console.warn('champ', name, e); }
        }
        try { form.updateFieldAppearances(font); } catch (e) { /* rien */ }
        if (S.flatten) form.flatten();
      } catch (e) { console.warn('formulaire', e); }
    }
    return doc.save();
  }

  async function saveFlow() {
    if (!S) return;
    if (!S.objs.length && !S.dirty) return UI.toast('Aucune modification à enregistrer');
    UI.busy('Enregistrement du PDF…');
    try {
      const bytes = await build_pdf();
      const name = App.outName(S.file.name, 'modifié', 'pdf');
      const res = await App.finish([{ bytes, name }], { tool: 'Modifié', source: S.file, from: 'editor' });
      S.dirty = false;
      renderTabs();
      void res;
    } catch (e) {
      UI.idle();
      UI.toast(e.message || 'Enregistrement impossible', true);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!S || !S.root || !S.root.isConnected || S.root.closest('[hidden]')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveFlow(); }
    else if ((e.ctrlKey || e.metaKey) && (k === '+' || k === '=')) { e.preventDefault(); setZoom(S.zoom * 1.25); }
    else if ((e.ctrlKey || e.metaKey) && k === '-') { e.preventDefault(); setZoom(S.zoom / 1.25); }
    else if ((e.ctrlKey || e.metaKey) && k === '0') { e.preventDefault(); S.zoom = 1.0001; setZoom(1); }
    else if ((e.ctrlKey || e.metaKey) && k === 'w') { e.preventDefault(); tryClose(); }
    else if (e.ctrlKey && k === 'tab' && sessions.length > 1) { e.preventDefault(); const i = sessions.indexOf(S); activate(sessions[(i + (e.shiftKey ? -1 : 1) + sessions.length) % sessions.length]); }
    else if ((k === 'delete' || k === 'backspace') && S.sel) { e.preventDefault(); selAction('del'); }
  });

  function isOpen() { return !!S; }
  function handleBack() {
    if (!S) return false;
    if (S.sel) { select(null); return true; }
    if (S.tool !== 'select' && S.tool !== 'fields') { S.tool = CATS[S.cat][0][0]; renderTools(); return true; }
    // Ouvert depuis une autre appli et seulement lu : le retour ramène à cette appli
    if (S.view && S.outside) { close(); App.tab('outils'); Native.exitApp(); return true; }
    tryClose();
    return true;
  }
  function relayout() {
    if (!S || !S.root || !S.root.isConnected) return;
    const w = S.root.querySelector('.ed-scroll').clientWidth;
    if (!S.builtW || Math.abs(w - S.builtW) > 4) buildPages();
  }

  window.Editor = { open, close, isOpen, handleBack, relayout, current: () => S && S.file };
})();
