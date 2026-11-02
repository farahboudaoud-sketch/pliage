/* Pliage — les outils : écrans Organiser, Convertir et Compresser. */
(function () {
  const { icon, esc, el, size } = UI;
  const PDF = ['application/pdf'];
  const IMAGES = ['image/*'];

  /** Liste des outils, dans l'ordre de l'écran Outils. */
  const TOOLS = [
    { id: 'merge', sec: 'Organiser', label: 'Fusionner', icon: 'merge', accept: PDF.concat(IMAGES), multi: true, kinds: ['pdf', 'image'] },
    { id: 'split', sec: 'Organiser', label: 'Découper', icon: 'scissors', accept: PDF, kinds: ['pdf'] },
    { id: 'reorder', sec: 'Organiser', label: 'Réorganiser', icon: 'grid', accept: PDF, kinds: ['pdf'] },
    { id: 'rotate', sec: 'Organiser', label: 'Pivoter', icon: 'rotate', accept: PDF, kinds: ['pdf'] },
    { id: 'extract', sec: 'Organiser', label: 'Extraire', icon: 'extract', accept: PDF, kinds: ['pdf'] },
    { id: 'delete', sec: 'Organiser', label: 'Supprimer', icon: 'del', accept: PDF, kinds: ['pdf'] },

    { id: 'pdf2docx', sec: 'Convertir', label: 'PDF → Word', icon: 'word', accept: PDF, kinds: ['pdf'], conv: 'pdf2docx' },
    { id: 'docx2pdf', sec: 'Convertir', label: 'Word → PDF', icon: 'swap', accept: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'application/rtf'], kinds: ['word'], conv: 'docx2pdf' },
    { id: 'pdf2img', sec: 'Convertir', label: 'PDF → Image', icon: 'image', accept: PDF, kinds: ['pdf'] },
    { id: 'img2pdf', sec: 'Convertir', label: 'Image → PDF', icon: 'img2pdf', accept: IMAGES, multi: true, kinds: ['image'] },
    { id: 'pdf2xlsx', sec: 'Convertir', label: 'PDF → Excel', icon: 'table', accept: PDF, kinds: ['pdf'], conv: 'pdf2xlsx' },
    { id: 'xlsx2pdf', sec: 'Convertir', label: 'Excel → PDF', icon: 'table', accept: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'text/csv'], kinds: ['excel'], conv: 'xlsx2pdf' },
    { id: 'pdf2pptx', sec: 'Convertir', label: 'PDF → PowerPoint', icon: 'slides', accept: PDF, kinds: ['pdf'], conv: 'pdf2pptx' },
    { id: 'pptx2pdf', sec: 'Convertir', label: 'PowerPoint → PDF', icon: 'slides', accept: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation'], kinds: ['ppt'], conv: 'pptx2pdf' },
    { id: 'pdf2epub', sec: 'Convertir', label: 'PDF → EPUB', icon: 'book', accept: PDF, kinds: ['pdf'], conv: 'pdf2epub' },
    { id: 'epub2pdf', sec: 'Convertir', label: 'EPUB → PDF', icon: 'book2', accept: ['application/epub+zip'], kinds: ['ebook'], conv: 'epub2pdf' },
    { id: 'ebook', sec: 'Convertir', label: 'E-books, Kindle', icon: 'kindle', accept: ['application/epub+zip', 'application/x-mobipocket-ebook', 'application/vnd.amazon.ebook', 'application/x-fictionbook+xml', 'application/pdf', 'application/octet-stream'], kinds: ['ebook', 'pdf'] },

    { id: 'cpdf', sec: 'Compresser', label: 'PDF', icon: 'compress', accept: PDF, kinds: ['pdf'] },
    { id: 'cimg', sec: 'Compresser', label: 'Images', icon: 'image', accept: IMAGES, multi: true, kinds: ['image'] },
    { id: 'cvideo', sec: 'Compresser', label: 'Vidéos', icon: 'video', accept: ['video/*'], kinds: ['video'] },
    { id: 'zip', sec: 'Compresser', label: 'Créer un ZIP', icon: 'zip', accept: [], multi: true, kinds: ['pdf', 'word', 'excel', 'ppt', 'ebook', 'image', 'video', 'zip', 'other'] },
    { id: 'unzip', sec: 'Compresser', label: 'Décompresser', icon: 'unzip', accept: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], kinds: ['zip'] },
  ];
  const byId = (id) => TOOLS.find((t) => t.id === id);

  /** Outils proposés pour un fichier d'un type donné. */
  function forKind(kind, multi) {
    return TOOLS.filter((t) => t.kinds.includes(kind) && (!multi || t.multi));
  }

  // ---------------------------------------------------------------- Petits composants

  function fileRow(f, i, opts) {
    opts = opts || {};
    return `<div class="frow" data-i="${i}">
      ${opts.reorder ? `<span class="grip" aria-hidden="true">${icon('grid', 16)}</span>` : ''}
      <div class="fb">${UI.badge(f.name)}</div>
      <div class="ft"><span class="fn">${esc(f.name)}</span><span class="fm">${esc(f.meta || size(f.size))}</span></div>
      ${opts.reorder ? `<button class="ib sm" data-up aria-label="Monter">${icon('up', 18)}</button><button class="ib sm" data-down aria-label="Descendre">${icon('down', 18)}</button>` : ''}
      ${opts.remove ? `<button class="ib sm" data-rm aria-label="Retirer">${icon('close', 18)}</button>` : ''}
    </div>`;
  }

  function seg(name, options, value) {
    return `<div class="seg" data-seg="${name}" role="radiogroup">${options.map(([v, l]) => `<button role="radio" aria-checked="${String(v) === String(value)}" class="${String(v) === String(value) ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function toggle(name, label, sub, checked) {
    return `<label class="tg"><span class="tg-t"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span><input type="checkbox" data-tg="${name}" ${checked ? 'checked' : ''}><span class="sl" aria-hidden="true"></span></label>`;
  }
  function field(name, label, value, ph, type) {
    return `<label class="fl"><span>${esc(label)}</span><input class="field" data-f="${name}" value="${esc(value || '')}" placeholder="${esc(ph || '')}" ${type ? `type="${type}"` : ''}></label>`;
  }
  function radioCards(name, items, value) {
    return `<div class="rcards" data-rc="${name}">${items.map((it) => `<button class="rc${it.v === value ? ' on' : ''}" data-v="${it.v}" role="radio" aria-checked="${it.v === value}" ${it.disabled ? 'data-disabled="1"' : ''}>
      <span class="rc-dot"></span><span class="rc-t"><span class="rc-h">${esc(it.title)}</span><span class="rc-s">${esc(it.desc)}</span></span></button>`).join('')}</div>`;
  }

  function bindSeg(root, name, cb) {
    const s = root.querySelector(`[data-seg="${name}"]`);
    if (!s) return;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      s.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      cb(b.dataset.v);
    }));
  }

  // ---------------------------------------------------------------- Écran d'outil générique

  /**
   * def.render(state) → HTML des options ; def.bind(root, state, refresh) ; def.run(state) → sorties
   */
  function screen(tool, files, def) {
    const st = Object.assign({ files: files.slice(), tool }, def.init ? def.init(files) : {});
    const scr = el(`<section class="scr tool">${UI.header(tool.title || tool.label)}<div class="scr-body"></div>
      <footer class="foot"><div class="foot-info"></div><button class="btn wide" data-go>${esc(def.action || tool.label)}</button></footer></section>`);
    const body = scr.querySelector('.scr-body');
    const refresh = () => {
      body.innerHTML = filesBlock(tool, st) + (def.render ? def.render(st) : '');
      bindFiles(body, tool, st, refresh, def);
      if (def.bind) def.bind(body, st, refresh);
      const info = scr.querySelector('.foot-info');
      const txt = def.info ? def.info(st) : '';
      info.textContent = txt || '';
      info.hidden = !txt;
    };
    scr.querySelector('[data-back]').addEventListener('click', () => UI.pop());
    scr.querySelector('[data-go]').addEventListener('click', async () => {
      if (!st.files.length) return UI.toast(tool.multi ? 'Ajoute des fichiers d’abord' : 'Choisis un fichier d’abord', true);
      if (def.validate) { const err = def.validate(st); if (err) return UI.toast(err, true); }
      try {
        const out = await def.run(st);
        if (out) await App.finish(out.files, Object.assign({ tool: tool.label, source: st.files[0], toolId: tool.id }, out.meta || {}));
      } catch (e) {
        UI.idle();
        console.error(e);
        UI.toast(e.message || 'Opération impossible', true);
      }
    });
    UI.push(scr);
    refresh();
    if (def.after) def.after(st, refresh);
    return scr;
  }

  function filesBlock(tool, st) {
    if (!st.files.length) {
      return `<button class="drop" data-add>${icon('plus', 26)}<span>${tool.multi ? 'Choisir des fichiers' : 'Choisir un fichier'}</span></button>`;
    }
    const reorder = tool.multi && st.files.length > 1 && tool.id !== 'zip' && tool.id !== 'cimg';
    let h = `<div class="flist">${st.files.map((f, i) => fileRow(f, i, { reorder, remove: tool.multi })).join('')}</div>`;
    if (tool.multi) h += `<button class="drop sm" data-add>${icon('plus', 18)}<span>Ajouter des fichiers</span></button>`;
    else h = h.replace('<div class="flist">', '<div class="flist single">') + `<button class="link" data-add>Changer de fichier</button>`;
    if (reorder) h = `<p class="hint">Change l’ordre avec les flèches. Le premier fichier ouvre le document.</p>` + h;
    return h;
  }

  function bindFiles(body, tool, st, refresh, def) {
    body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
      const picked = (await Native.pick(tool.accept, !!tool.multi)).filter((f) => {
        if (f.error) { UI.toast(f.name + ' : ' + f.error, true); return false; }
        return true;
      });
      if (!picked.length) return;
      st.files = tool.multi ? st.files.concat(picked) : [picked[0]];
      if (def.onFiles) await def.onFiles(st);
      refresh();
    }));
    body.querySelectorAll('.frow').forEach((row) => {
      const i = +row.dataset.i;
      const up = row.querySelector('[data-up]'), down = row.querySelector('[data-down]'), rm = row.querySelector('[data-rm]');
      if (up) up.addEventListener('click', () => { if (i > 0) { [st.files[i - 1], st.files[i]] = [st.files[i], st.files[i - 1]]; refresh(); } });
      if (down) down.addEventListener('click', () => { if (i < st.files.length - 1) { [st.files[i + 1], st.files[i]] = [st.files[i], st.files[i + 1]]; refresh(); } });
      if (rm) rm.addEventListener('click', () => { st.files.splice(i, 1); refresh(); });
    });
  }

  // ---------------------------------------------------------------- Grille de pages (sélection)

  async function pageGrid(body, st, opts) {
    const box = body.querySelector('.pgrid');
    if (!box || !st.files.length) return;
    const f = st.files[0];
    if (!st.js || st.jsPath !== f.path) {
      box.innerHTML = '<div class="hint">Lecture des pages…</div>';
      const bytes = await Native.read(f.path);
      st.bytes = bytes;
      st.js = await Pdf.loadJs(bytes, f.path);
      st.jsPath = f.path;
      st.n = st.js.numPages;
      st.thumbs = {};
      if (!st.sel) st.sel = new Set();
      if (opts && opts.onLoad) opts.onLoad(st);
    }
    const order = opts && opts.order ? opts.order(st) : Array.from({ length: st.n }, (_, i) => ({ src: i, rot: 0 }));
    box.innerHTML = order.map((o, k) => `<button class="pg${(opts && opts.selKey ? st.sel.has(opts.selKey(o, k)) : st.sel.has(o.src)) ? ' on' : ''}" data-k="${k}" aria-label="Page ${k + 1}">
      <span class="pg-img" style="transform:rotate(${o.rot || 0}deg)">${o.src == null ? '<span class="blank">Page blanche</span>' : ''}</span><span class="pg-n">${k + 1}</span><span class="pg-c">${icon('check', 14)}</span></button>`).join('');
    box.querySelectorAll('.pg').forEach((b) => b.addEventListener('click', () => {
      const k = +b.dataset.k;
      const key = opts && opts.selKey ? opts.selKey(order[k], k) : order[k].src;
      if (st.sel.has(key)) st.sel.delete(key); else st.sel.add(key);
      b.classList.toggle('on');
      if (opts && opts.onSel) opts.onSel(st);
    }));
    // Vignettes
    const io = new IntersectionObserver((ents) => ents.forEach(async (en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const k = +en.target.dataset.k;
      const o = order[k];
      if (o.src == null) return;
      if (!st.thumbs[o.src]) {
        const cv = await Pdf.renderPage(st.js, o.src, 0.32);
        st.thumbs[o.src] = cv.toDataURL('image/jpeg', 0.7);
        cv.width = cv.height = 0;
      }
      const img = en.target.querySelector('.pg-img');
      img.style.backgroundImage = `url(${st.thumbs[o.src]})`;
    }), { rootMargin: '200px' });
    box.querySelectorAll('.pg').forEach((b) => io.observe(b));
  }

  function selList(st) { return [...st.sel].filter((x) => typeof x === 'number').sort((a, b) => a - b); }

  // ---------------------------------------------------------------- Aides communes

  const readAll = async (files) => Promise.all(files.map(async (f) => ({ f, bytes: await Native.read(f.path) })));
  const step = (label) => (i, n, l) => UI.progress(((i + 1) / Math.max(1, n)) * 100, l || label);
  const pdfOut = (bytes, name) => ({ bytes, name });

  async function online(st, from, to, label) {
    const s = Store.settings;
    const has = await Native.hasSecret(s.service);
    if (!has.has) {
      UI.idle();
      const go = await UI.confirm('Clé API manquante', 'Ajoute ta clé ' + (s.service === 'cloudconvert' ? 'CloudConvert' : 'ConvertAPI') + ' dans Réglages pour utiliser la haute fidélité.', 'Ouvrir Réglages');
      if (go) { UI.popAll(); App.tab('reglages'); }
      return null;
    }
    if (s.askOnline || !s.onlineWarned) {
      UI.idle();
      const ok = await UI.confirm('Envoyer le fichier en ligne ?', 'Le fichier sera envoyé à ' + (s.service === 'cloudconvert' ? 'CloudConvert' : 'ConvertAPI') + ', un service externe, pour la conversion.', 'Envoyer');
      if (!ok) return null;
      Store.set('onlineWarned', true);
    }
    UI.busy('Envoi du fichier…');
    const d = await Native.dirs();
    const f = st.files[0];
    const out = d.cache + '/work/' + Date.now() + '.' + to;
    const r = await Native.onlineConvert({ service: s.service, path: f.path, from, to, out }, (l) => UI.busy(l));
    return { files: [{ path: r.path, name: App.outName(f.name, label, to) }] };
  }

  async function htmlOut(html, f, label, landscape) {
    UI.busy('Mise en page du PDF…');
    const d = await Native.dirs();
    const out = d.cache + '/work/' + Date.now() + '.pdf';
    const r = await Native.htmlToPdf(html, out, 'A4', landscape);
    return { files: [{ path: r.path, name: App.outName(f.name, label, 'pdf') }] };
  }

  function modeBlock(st, offlineOk, onlineOk, offDesc, onDesc) {
    if (!onlineOk) return '';
    if (!offlineOk) st.mode = 'online';
    return `<h3 class="sec-t">Mode de conversion</h3>` + radioCards('mode', [
      { v: 'offline', title: 'Sur le téléphone', desc: offlineOk ? (offDesc || 'Privé, gratuit, sans internet. Mise en page simplifiée.') : 'Pas disponible hors ligne pour ce format.', disabled: !offlineOk },
      { v: 'online', title: 'Haute fidélité (en ligne)', desc: onDesc || 'Mise en page identique à l’original. Utilise ton quota ' + (Store.settings.service === 'cloudconvert' ? 'CloudConvert' : 'ConvertAPI') + '.' },
    ], st.mode) + (st.mode === 'online' ? `<div class="warn">${icon('warn', 18)}<span>Le fichier sera envoyé à ${Store.settings.service === 'cloudconvert' ? 'CloudConvert' : 'ConvertAPI'}, un service externe, pour la conversion.</span></div>` : '');
  }
  function bindMode(body, st, refresh) {
    const rc = body.querySelector('[data-rc="mode"]');
    if (!rc) return;
    rc.querySelectorAll('.rc').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.disabled) return UI.toast('Ce format se convertit uniquement en ligne');
      st.mode = b.dataset.v;
      refresh();
    }));
  }

  // ---------------------------------------------------------------- Définition de chaque outil

  const DEFS = {
    merge: {
      action: 'Fusionner',
      info: (st) => st.files.length ? `${st.files.length} fichier${st.files.length > 1 ? 's' : ''} · ${size(st.files.reduce((s, f) => s + (f.size || 0), 0))} au total` : '',
      validate: (st) => (st.files.length < 2 ? 'Ajoute au moins deux fichiers' : null),
      async run(st) {
        UI.busy('Fusion des fichiers…');
        const items = [];
        for (const { f, bytes } of await readAll(st.files)) items.push({ bytes, kind: UI.kind(f) === 'pdf' ? 'pdf' : 'image', mime: f.mime });
        const bytes = await Pdf.merge(items, step('Fusion des fichiers…'));
        return { files: [pdfOut(bytes, App.outName(st.files[0].name, 'fusion', 'pdf'))], meta: { sub: `${st.files.length} fichiers réunis en un seul PDF.` } };
      },
    },

    split: {
      action: 'Découper',
      init: () => ({ mode: 'ranges', ranges: '', every: 2, maxMb: 5 }),
      render: (st) => `<h3 class="sec-t">Découper</h3>${seg('mode', [['ranges', 'Par plages'], ['each', 'Chaque page'], ['every', 'Toutes les N pages'], ['size', 'Par taille']], st.mode)}
        ${st.mode === 'ranges' ? field('ranges', 'Plages de pages (un fichier par plage)', st.ranges, '1-3, 5, 8-10') : ''}
        ${st.mode === 'every' ? field('every', 'Nombre de pages par fichier', st.every, '2', 'number') : ''}
        ${st.mode === 'size' ? field('maxMb', 'Taille maximale par fichier (Mo)', st.maxMb, '5', 'number') : ''}
        ${st.n ? `<p class="hint">Le document a ${st.n} pages.</p>` : ''}`,
      bind(body, st, refresh) {
        bindSeg(body, 'mode', (v) => { st.mode = v; refresh(); });
        body.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; }));
      },
      async onFiles(st) { st.n = await Pdf.count(await Native.read(st.files[0].path)); },
      after: async (st, refresh) => { if (st.files.length) { try { st.n = await Pdf.count(await Native.read(st.files[0].path)); refresh(); } catch (e) { UI.toast(e.message, true); } } },
      async run(st) {
        UI.busy('Découpe du PDF…');
        const f = st.files[0];
        const bytes = await Native.read(f.path);
        const n = await Pdf.count(bytes);
        let parts, groups = null;
        if (st.mode === 'size') {
          const mb = parseFloat(String(st.maxMb).replace(',', '.'));
          if (!(mb > 0)) throw new Error('Indique une taille en Mo');
          parts = await Pdf.splitBySize(bytes, mb * 1024 * 1024);
        } else {
          if (st.mode === 'ranges') groups = Pdf.parseRanges(st.ranges, n);
          else if (st.mode === 'each') groups = Array.from({ length: n }, (_, i) => [i]);
          else {
            const k = parseInt(st.every, 10);
            if (!(k > 0)) throw new Error('Indique un nombre de pages');
            groups = [];
            for (let i = 0; i < n; i += k) groups.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j));
          }
          parts = await Pdf.split(bytes, groups);
        }
        const files = parts.map((b, i) => {
          const g = groups && groups[i];
          const label = g ? (g.length === 1 ? 'page ' + (g[0] + 1) : 'pages ' + (g[0] + 1) + '-' + (g[g.length - 1] + 1)) : 'partie ' + (i + 1);
          return pdfOut(b, App.outName(f.name, label, 'pdf'));
        });
        return { files, meta: { sub: `${files.length} fichier${files.length > 1 ? 's' : ''} créé${files.length > 1 ? 's' : ''}.` } };
      },
    },

    extract: selectDef('Extraire', 'Extraire les pages', async (bytes, sel) => Pdf.extract(bytes, sel), 'extrait'),
    delete: selectDef('Supprimer', 'Supprimer les pages', async (bytes, sel) => Pdf.removePages(bytes, sel), 'pages supprimées'),

    rotate: Object.assign(selectDef('Pivoter', 'Pivoter', async (bytes, sel, st) => Pdf.rotate(bytes, sel.length ? sel : Array.from({ length: st.n }, (_, i) => i), +st.angle), 'pivoté', true), {
      init: () => ({ sel: new Set(), angle: 90 }),
      extra: (st) => `<h3 class="sec-t">Sens</h3>${seg('angle', [['90', '90° à droite'], ['180', '180°'], ['270', '90° à gauche']], st.angle)}<p class="hint">Sans sélection, tout le document pivote.</p>`,
    }),

    reorder: {
      action: 'Enregistrer',
      init: () => ({ sel: new Set(), order: null }),
      render: (st) => `<h3 class="sec-t">Pages</h3><p class="hint">Touche des pages pour les sélectionner, puis utilise les boutons.</p>
        <div class="pg-actions">
          <button class="chip" data-a="left">${icon('back', 16)} Avant</button><button class="chip" data-a="right">Après ${icon('chevron', 16)}</button>
          <button class="chip" data-a="rot">${icon('rotate', 16)} Pivoter</button><button class="chip" data-a="dup">${icon('copy', 16)} Dupliquer</button>
          <button class="chip" data-a="blank">${icon('plus', 16)} Page blanche</button><button class="chip danger" data-a="del">${icon('trash', 16)} Supprimer</button>
        </div><div class="pgrid"></div>`,
      bind(body, st, refresh) {
        pageGrid(body, st, {
          onLoad: (s) => { s.order = Array.from({ length: s.n }, (_, i) => ({ src: i, rot: 0, key: 'p' + i })); },
          order: (s) => s.order,
          selKey: (o) => o.key,
        });
        body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
          if (!st.order) return;
          const a = b.dataset.a;
          const idx = st.order.map((o, i) => (st.sel.has(o.key) ? i : -1)).filter((i) => i >= 0);
          if (a !== 'blank' && !idx.length) return UI.toast('Sélectionne d’abord des pages');
          if (a === 'left') idx.forEach((i) => { if (i > 0 && !st.sel.has(st.order[i - 1].key)) [st.order[i - 1], st.order[i]] = [st.order[i], st.order[i - 1]]; });
          if (a === 'right') idx.reverse().forEach((i) => { if (i < st.order.length - 1 && !st.sel.has(st.order[i + 1].key)) [st.order[i + 1], st.order[i]] = [st.order[i], st.order[i + 1]]; });
          if (a === 'rot') idx.forEach((i) => { st.order[i].rot = (st.order[i].rot + 90) % 360; });
          if (a === 'dup') idx.reverse().forEach((i) => st.order.splice(i + 1, 0, Object.assign({}, st.order[i], { key: 'd' + Store.uid() })));
          if (a === 'del') { if (idx.length === st.order.length) return UI.toast('Il faut garder au moins une page', true); st.order = st.order.filter((o) => !st.sel.has(o.key)); st.sel.clear(); }
          if (a === 'blank') { const at = idx.length ? idx[idx.length - 1] + 1 : st.order.length; st.order.splice(at, 0, { src: null, rot: 0, key: 'b' + Store.uid() }); }
          refresh();
        }));
      },
      async onFiles(st) { st.js = null; st.order = null; st.sel = new Set(); },
      async run(st) {
        if (!st.order) throw new Error('Patiente, les pages se chargent');
        UI.busy('Enregistrement des pages…');
        const bytes = await Pdf.rebuild(st.bytes, st.order);
        return { files: [pdfOut(bytes, App.outName(st.files[0].name, 'réorganisé', 'pdf'))] };
      },
    },

    pdf2img: {
      action: 'Convertir',
      init: () => ({ format: 'jpeg', dpi: Store.settings.dpi, pages: 'all', ranges: '' }),
      render: (st) => `<h3 class="sec-t">Format</h3>${seg('format', [['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], st.format)}
        <h3 class="sec-t">Résolution</h3>${seg('dpi', [['72', '72 ppp'], ['150', '150 ppp'], ['300', '300 ppp']], st.dpi)}
        <h3 class="sec-t">Pages</h3>${seg('pages', [['all', 'Toutes'], ['ranges', 'Certaines']], st.pages)}
        ${st.pages === 'ranges' ? field('ranges', 'Pages à convertir', st.ranges, '1, 3-5') : ''}`,
      bind(body, st, refresh) {
        ['format', 'dpi'].forEach((k) => bindSeg(body, k, (v) => { st[k] = v; }));
        bindSeg(body, 'pages', (v) => { st.pages = v; refresh(); });
        body.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; }));
      },
      async run(st) {
        UI.busy('Conversion des pages…');
        const f = st.files[0];
        const bytes = await Native.read(f.path);
        const js = await Pdf.loadJs(bytes, f.path);
        const pages = st.pages === 'all' ? Array.from({ length: js.numPages }, (_, i) => i) : Pdf.parseRanges(st.ranges, js.numPages).flat();
        const imgs = await Pdf.toImages(js, pages, +st.dpi, st.format, 90, step('Conversion des pages…'));
        const ext = st.format === 'jpeg' ? 'jpg' : st.format;
        const files = imgs.map((im) => ({ bytes: im.blob, name: App.outName(f.name, 'page ' + (im.page + 1), ext) }));
        return { files, meta: { sub: `${files.length} image${files.length > 1 ? 's' : ''} créée${files.length > 1 ? 's' : ''}.` } };
      },
    },

    img2pdf: {
      action: 'Créer le PDF',
      init: () => ({ size: 'a4', orient: 'auto', margin: '0' }),
      render: (st) => `<h3 class="sec-t">Format de page</h3>${seg('size', [['a4', 'A4'], ['letter', 'Lettre'], ['fit', 'Taille de l’image']], st.size)}
        ${st.size !== 'fit' ? `<h3 class="sec-t">Orientation</h3>${seg('orient', [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Paysage']], st.orient)}` : ''}
        <h3 class="sec-t">Marges</h3>${seg('margin', [['0', 'Aucune'], ['20', 'Petites'], ['45', 'Grandes']], st.margin)}`,
      bind(body, st, refresh) {
        bindSeg(body, 'size', (v) => { st.size = v; refresh(); });
        ['orient', 'margin'].forEach((k) => bindSeg(body, k, (v) => { st[k] = v; }));
      },
      async run(st) {
        UI.busy('Création du PDF…');
        const d = await Native.dirs();
        const images = [];
        for (let i = 0; i < st.files.length; i++) {
          const f = st.files[i];
          UI.progress(((i + 1) / st.files.length) * 50, 'Préparation des images…');
          const e = UI.ext(f.name);
          if (['jpg', 'jpeg', 'png'].includes(e)) images.push({ bytes: await Native.read(f.path), mime: f.mime });
          else {
            const r = await Native.processImage({ path: f.path, out: d.cache + '/work/i' + i + '-' + Date.now() + '.jpg', format: 'jpeg', quality: 92 });
            images.push({ bytes: await Native.read(r.path), mime: 'image/jpeg' });
          }
        }
        const bytes = await Pdf.imagesToPdf(images, { size: st.size, orientation: st.orient, margin: +st.margin }, (i, n) => UI.progress(50 + ((i + 1) / n) * 50, 'Création du PDF…'));
        return { files: [pdfOut(bytes, App.outName(st.files[0].name, st.files.length > 1 ? 'images' : 'image', 'pdf'))], meta: { sub: `${st.files.length} image${st.files.length > 1 ? 's' : ''} dans un PDF.` } };
      },
    },

    ebook: {
      action: 'Convertir',
      init: (files) => ({ to: files.length && UI.ext(files[0].name) === 'epub' ? 'pdf' : 'epub', mode: 'offline', title: '', author: '' }),
      render(st) {
        const from = st.files.length ? UI.ext(st.files[0].name) : '';
        const targets = Convert.EBOOK_FORMATS.filter((x) => x !== from);
        if (!targets.includes(st.to)) st.to = targets[0];
        const off = from ? Convert.ebookOffline(from, st.to) : true;
        if (!off) st.mode = 'online'; else if (st.mode === 'online' && st.forced) { st.mode = 'offline'; }
        st.forced = !off;
        return `<h3 class="sec-t">Convertir en</h3>${seg('to', targets.map((x) => [x, x.toUpperCase()]), st.to)}
          ${modeBlock(st, off, true, 'Privé, gratuit, sans internet. Texte et images remis en forme.')}
          ${st.to === 'epub' && from === 'pdf' ? `<h3 class="sec-t">Livre</h3>${field('title', 'Titre', st.title, UI.base(st.files[0].name))}${field('author', 'Auteur', st.author, '')}` : ''}
          <p class="hint">Les formats Kindle (MOBI, AZW3) passent par le service en ligne. Les Kindle récentes lisent aussi directement les EPUB.</p>`;
      },
      bind(body, st, refresh) {
        bindSeg(body, 'to', (v) => { st.to = v; refresh(); });
        bindMode(body, st, refresh);
        body.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; }));
      },
      async run(st) {
        const f = st.files[0];
        const from = UI.ext(f.name);
        if (!Convert.EBOOK_FORMATS.concat(['azw']).includes(from)) throw new Error('Choisis un fichier EPUB, MOBI, AZW3, FB2 ou PDF');
        if (st.mode === 'online') return online(st, from, st.to, st.to.toUpperCase());
        UI.busy('Conversion du livre…');
        const bytes = await Native.read(f.path);
        const r = await Convert.ebook(bytes, from, st.to, { key: f.path, title: st.title, author: st.author, baseName: UI.base(f.name) }, step('Conversion du livre…'));
        if (!r) return online(st, from, st.to, st.to.toUpperCase());
        if (r.html) return htmlOut(r.html, f, st.to.toUpperCase(), false);
        return { files: [{ bytes: r.bytes, name: App.outName(f.name, '', st.to) }] };
      },
    },

    cpdf: {
      action: 'Compresser',
      init: () => ({ level: Store.settings.pdfLevel, strip: true }),
      render(st) {
        const s = st.files[0] ? st.files[0].size : 0;
        const est = [0.72, 0.42, 0.24];
        return `<h3 class="sec-t">Niveau</h3><div class="lvls">${['Légère', 'Recommandée', 'Forte'].map((n, i) => `<button class="lvl${i === st.level ? ' on' : ''}" data-l="${i}"><span>${n}</span><small>${s ? '≈ ' + size(s * est[i]) : ['Qualité max', 'Bon équilibre', 'Plus léger'][i]}</small></button>`).join('')}</div>
          <p class="hint">L’estimation dépend des images du PDF. Pliage garde l’original s’il ne peut pas faire mieux.</p>
          <h3 class="sec-t">Options</h3><div class="card">${toggle('strip', 'Retirer les métadonnées', 'Auteur, logiciel, historique d’édition', st.strip)}</div>`;
      },
      bind(body, st, refresh) {
        body.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => { st.level = +b.dataset.l; refresh(); }));
        const t = body.querySelector('[data-tg="strip"]');
        if (t) t.addEventListener('change', () => { st.strip = t.checked; });
      },
      async run(st) {
        UI.busy('Compression du PDF…');
        const f = st.files[0];
        const bytes = await Native.read(f.path);
        const r = await Pdf.compress(bytes, st.level, st.strip, (i, n) => UI.progress((i / Math.max(1, n)) * 100, 'Compression des images…'));
        const gain = Math.round((1 - r.bytes.length / bytes.byteLength) * 100);
        return {
          files: [pdfOut(r.bytes, App.outName(f.name, 'compressé', 'pdf'))],
          meta: { sub: r.smaller && gain > 0 ? `Ton PDF est ${gain} % plus léger.` : 'Ce PDF était déjà optimisé : Pliage a gardé la meilleure version.', before: bytes.byteLength },
        };
      },
    },

    cimg: {
      action: 'Compresser',
      init: () => ({ quality: Store.settings.imgQuality, maxSide: '0', format: 'keep', exif: false, gps: false }),
      render: (st) => `<h3 class="sec-t">Qualité</h3><div class="range"><input type="range" min="30" max="95" step="1" value="${st.quality}" data-q aria-label="Qualité"><span class="range-v">${st.quality} %</span></div>
        <h3 class="sec-t">Taille maximale</h3>${seg('maxSide', [['0', 'Originale'], ['2560', '2560 px'], ['1920', '1920 px'], ['1280', '1280 px'], ['800', '800 px']], st.maxSide)}
        <h3 class="sec-t">Format</h3>${seg('format', [['keep', 'Garder'], ['jpeg', 'JPG'], ['webp', 'WebP'], ['png', 'PNG']], st.format)}
        <h3 class="sec-t">Données de la photo</h3><div class="card">${toggle('exif', 'Garder les infos EXIF', 'Date, appareil, réglages', st.exif)}${st.exif ? toggle('gps', 'Garder la position GPS', 'Lieu où la photo a été prise', st.gps) : ''}</div>`,
      bind(body, st, refresh) {
        const q = body.querySelector('[data-q]');
        q.addEventListener('input', () => { st.quality = +q.value; body.querySelector('.range-v').textContent = q.value + ' %'; });
        ['maxSide', 'format'].forEach((k) => bindSeg(body, k, (v) => { st[k] = v; }));
        const ex = body.querySelector('[data-tg="exif"]');
        ex.addEventListener('change', () => { st.exif = ex.checked; refresh(); });
        const gp = body.querySelector('[data-tg="gps"]');
        if (gp) gp.addEventListener('change', () => { st.gps = gp.checked; });
      },
      info: (st) => st.files.length ? `${st.files.length} image${st.files.length > 1 ? 's' : ''} · ${size(st.files.reduce((s, f) => s + (f.size || 0), 0))}` : '',
      async run(st) {
        UI.busy('Compression des images…');
        const d = await Native.dirs();
        const files = [];
        let before = 0, after = 0;
        for (let i = 0; i < st.files.length; i++) {
          const f = st.files[i];
          UI.progress((i / st.files.length) * 100, `Image ${i + 1} sur ${st.files.length}…`);
          const e = UI.ext(f.name);
          let fmt = st.format;
          if (fmt === 'keep') fmt = e === 'png' ? 'png' : e === 'webp' ? 'webp' : 'jpeg';
          const ext = fmt === 'jpeg' ? 'jpg' : fmt;
          const out = d.cache + '/work/c' + i + '-' + Date.now() + '.' + ext;
          const r = await Native.processImage({ path: f.path, out, format: fmt, quality: st.quality, maxSide: +st.maxSide, keepExif: st.exif, keepGps: st.gps });
          before += f.size || 0;
          const keep = r.size >= (f.size || Infinity) && UI.ext(f.name) === ext && !+st.maxSide;
          after += keep ? f.size : r.size;
          files.push({ path: keep ? f.path : r.path, name: App.outName(f.name, 'compressé', ext) });
        }
        const gain = before ? Math.round((1 - after / before) * 100) : 0;
        return { files, meta: { sub: gain > 0 ? `${size(before)} → ${size(after)} · ${gain} % plus léger.` : 'Les images étaient déjà légères.' } };
      },
    },

    cvideo: {
      action: 'Compresser',
      init: () => ({ height: String(Store.settings.videoHeight), quality: 'mid', audio: true, info: null }),
      async onFiles(st) { st.info = null; try { st.info = await Native.videoInfo(st.files[0].path); } catch (e) { /* rien */ } },
      after: async (st, refresh) => { if (st.files.length && !st.info) { try { st.info = await Native.videoInfo(st.files[0].path); refresh(); } catch (e) { /* rien */ } } },
      render(st) {
        const inf = st.info;
        const est = inf && inf.duration ? size(estimateVideo(st) * inf.duration / 1000 / 8) : null;
        return `${inf && inf.width ? `<p class="hint">${Math.max(inf.width, inf.height) === inf.width ? inf.height : inf.width}p · ${fmtDur(inf.duration)}</p>` : ''}
          <h3 class="sec-t">Résolution</h3>${seg('height', [['480', '480p'], ['720', '720p'], ['1080', '1080p'], ['0', 'D’origine']], st.height)}
          <h3 class="sec-t">Qualité</h3>${seg('quality', [['low', 'Économe'], ['mid', 'Équilibrée'], ['high', 'Haute']], st.quality)}
          <div class="card">${toggle('audio', 'Garder le son', '', st.audio)}</div>
          ${est ? `<div class="est"><span>Taille estimée</span><b>≈ ${est}</b></div>` : ''}
          <p class="hint">La compression continue tant que l’appli reste ouverte. Une vidéo longue peut prendre plusieurs minutes.</p>`;
      },
      bind(body, st, refresh) {
        ['height', 'quality'].forEach((k) => bindSeg(body, k, (v) => { st[k] = v; refresh(); }));
        const a = body.querySelector('[data-tg="audio"]');
        a.addEventListener('change', () => { st.audio = a.checked; refresh(); });
      },
      async run(st) {
        const f = st.files[0];
        const d = await Native.dirs();
        const out = d.cache + '/work/v-' + Date.now() + '.mp4';
        UI.busy('Compression de la vidéo…', () => Native.cancelVideo());
        const r = await Native.compressVideo({ path: f.path, out, height: +st.height, bitrate: Math.round(estimateVideo(st, true)), removeAudio: !st.audio }, (p) => UI.progress(p, 'Compression de la vidéo… ' + p + ' %'));
        const gain = f.size ? Math.round((1 - r.size / f.size) * 100) : 0;
        return { files: [{ path: r.path, name: App.outName(f.name, 'compressée', 'mp4') }], meta: { sub: gain > 0 ? `${size(f.size)} → ${size(r.size)} · ${gain} % plus légère.` : 'La vidéo était déjà très légère.' } };
      },
    },

    zip: {
      action: 'Créer le ZIP',
      init: (files) => ({ level: '6', name: files.length ? UI.base(files[0].name) : 'Archive' }),
      render: (st) => `${field('name', 'Nom de l’archive', st.name, 'Archive')}<h3 class="sec-t">Compression</h3>${seg('level', [['1', 'Rapide'], ['6', 'Normale'], ['9', 'Maximale']], st.level)}
        <p class="hint">Les photos, vidéos et PDF déjà compressés gagnent peu de place dans un ZIP.</p>`,
      bind(body, st) {
        bindSeg(body, 'level', (v) => { st.level = v; });
        body.querySelector('[data-f="name"]').addEventListener('input', (e) => { st.name = e.target.value; });
      },
      info: (st) => st.files.length ? `${st.files.length} fichier${st.files.length > 1 ? 's' : ''} · ${size(st.files.reduce((s, f) => s + (f.size || 0), 0))}` : '',
      async run(st) {
        UI.busy('Création de l’archive…');
        const d = await Native.dirs();
        const name = (st.name || 'Archive').replace(/\.zip$/i, '') + '.zip';
        const r = await Native.zip(st.files.map((f) => f.path), st.files.map((f) => f.name), d.cache + '/work/' + Date.now() + '.zip', +st.level, (p) => UI.progress(p, 'Création de l’archive…'));
        const before = st.files.reduce((s, f) => s + (f.size || 0), 0);
        const gain = before ? Math.round((1 - r.size / before) * 100) : 0;
        return { files: [{ path: r.path, name }], meta: { sub: `${st.files.length} fichier${st.files.length > 1 ? 's' : ''}${gain > 0 ? ' · ' + gain + ' % de place gagnée' : ''}.` } };
      },
    },

    unzip: {
      action: 'Décompresser',
      async run(st) {
        UI.busy('Extraction des fichiers…');
        const d = await Native.dirs();
        const r = await Native.unzip(st.files[0].path, d.cache + '/work/unzip-' + Date.now());
        if (!r.files.length) throw new Error('Cette archive est vide');
        return { files: r.files.map((f) => ({ path: f.path, name: f.name.split('/').pop() })), meta: { sub: `${r.files.length} fichier${r.files.length > 1 ? 's' : ''} extrait${r.files.length > 1 ? 's' : ''}.`, noAutoSave: r.files.length > 40 } };
      },
    },
  };

  function fmtDur(ms) {
    const s = Math.round((ms || 0) / 1000);
    return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
  }

  /** Débit vidéo visé (bits/s) selon la résolution et la qualité. */
  function estimateVideo(st, videoOnly) {
    const q = { low: 0, mid: 1, high: 2 }[st.quality];
    const table = { 480: [900e3, 1.4e6, 2.2e6], 720: [1.8e6, 2.8e6, 4.5e6], 1080: [3.5e6, 5.5e6, 8e6] };
    let v;
    if (+st.height) v = table[+st.height][q];
    else {
      const src = st.info && st.info.bitrate ? st.info.bitrate : 8e6;
      v = src * [0.4, 0.55, 0.75][q];
    }
    if (st.info && st.info.bitrate) v = Math.min(v, st.info.bitrate * 0.9);
    return videoOnly ? v : v + (st.audio ? 128e3 : 0);
  }

  /** Outils à sélection de pages (Extraire, Supprimer, Pivoter). */
  function selectDef(label, action, fn, suffix, optional) {
    return {
      action,
      init: () => ({ sel: new Set(), ranges: '' }),
      render: (st) => `${DEFS[st.tool.id] && DEFS[st.tool.id].extra ? DEFS[st.tool.id].extra(st) : ''}
        <h3 class="sec-t">Pages${st.n ? ` <small>(${st.n})</small>` : ''}</h3>
        <div class="pg-actions"><button class="chip" data-all>Tout sélectionner</button><button class="chip" data-none>Aucune</button><button class="chip" data-rng>Par numéros…</button></div>
        <div class="pgrid"></div>`,
      bind(body, st, refresh) {
        pageGrid(body, st, { onSel: () => updateCount(st) });
        if (DEFS[st.tool.id] && DEFS[st.tool.id].extra) bindSeg(body, 'angle', (v) => { st.angle = v; });
        body.querySelector('[data-all]').addEventListener('click', () => { for (let i = 0; i < (st.n || 0); i++) st.sel.add(i); refresh(); });
        body.querySelector('[data-none]').addEventListener('click', () => { st.sel.clear(); refresh(); });
        body.querySelector('[data-rng]').addEventListener('click', async () => {
          const v = await UI.ask('Pages', '', 'Sélectionner', { placeholder: '1-3, 5, 8-10' });
          if (!v) return;
          try { Pdf.parseRanges(v, st.n).flat().forEach((i) => st.sel.add(i)); refresh(); } catch (e) { UI.toast(e.message, true); }
        });
      },
      async onFiles(st) { st.js = null; st.sel = new Set(); },
      info: (st) => (st.sel && st.sel.size ? `${st.sel.size} page${st.sel.size > 1 ? 's' : ''} sélectionnée${st.sel.size > 1 ? 's' : ''}` : ''),
      validate: (st) => (!optional && !(st.sel && st.sel.size) ? 'Sélectionne au moins une page' : null),
      async run(st) {
        UI.busy(action + '…');
        const bytes = await Native.read(st.files[0].path);
        const out = await fn(bytes, selList(st), st);
        return { files: [pdfOut(out, App.outName(st.files[0].name, suffix, 'pdf'))] };
      },
    };
  }
  function updateCount(st) {
    const info = UI.topScreen() && UI.topScreen().querySelector('.foot-info');
    if (info) { const t = st.sel.size ? `${st.sel.size} page${st.sel.size > 1 ? 's' : ''} sélectionnée${st.sel.size > 1 ? 's' : ''}` : ''; info.textContent = t; info.hidden = !t; }
  }

  // ---- Conversions de la table (PDF ↔ Word, Excel, PowerPoint, EPUB)
  function convDef(tool) {
    const c = Convert.TABLE[tool.conv];
    const from = { pdf2docx: 'pdf', docx2pdf: 'docx', pdf2xlsx: 'pdf', xlsx2pdf: 'xlsx', pdf2pptx: 'pdf', pptx2pdf: 'pptx', pdf2epub: 'pdf', epub2pdf: 'epub' }[tool.conv];
    return {
      action: 'Convertir',
      init: () => ({ mode: c.run ? 'offline' : 'online', images: true, cover: true, title: '', author: '', font: 'serif' }),
      render(st) {
        let h = modeBlock(st, !!c.run, true);
        if (st.mode === 'offline') {
          if (tool.conv === 'pdf2docx') h += `<h3 class="sec-t">Options</h3><div class="card">${toggle('images', 'Garder les pages scannées en image', 'Utile pour les PDF issus d’un scanner', st.images)}</div>`;
          if (tool.conv === 'pdf2epub') h += `<h3 class="sec-t">Livre</h3>${field('title', 'Titre', st.title, st.files[0] ? UI.base(st.files[0].name) : '')}${field('author', 'Auteur', st.author, '')}<div class="card">${toggle('cover', 'Couverture à partir de la 1re page', '', st.cover)}</div>`;
          if (tool.conv === 'epub2pdf') h += `<h3 class="sec-t">Police</h3>${seg('font', [['serif', 'Avec empattements'], ['sans', 'Sans empattements']], st.font)}`;
          if (tool.conv === 'pdf2pptx') h += `<p class="hint">Hors ligne, chaque page devient une diapositive (image de la page, texte en notes).</p>`;
          if (tool.conv === 'pdf2xlsx') h += `<p class="hint">Hors ligne, Pliage reconstruit les tableaux à partir de la position du texte : une feuille par page.</p>`;
        }
        return h;
      },
      bind(body, st, refresh) {
        bindMode(body, st, refresh);
        body.querySelectorAll('[data-tg]').forEach((t) => t.addEventListener('change', () => { st[t.dataset.tg] = t.checked; }));
        body.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; }));
        bindSeg(body, 'font', (v) => { st.font = v; });
      },
      async run(st) {
        const f = st.files[0];
        const realFrom = UI.ext(f.name) || from;
        if (st.mode === 'online') return online(st, realFrom, c.online, c.to === 'pdf' ? 'PDF' : c.to.toUpperCase());
        UI.busy('Conversion…');
        const bytes = await Native.read(f.path);
        if (tool.conv === 'docx2pdf' && realFrom !== 'docx') throw new Error('Hors ligne, seul le format .docx est pris en charge : choisis la haute fidélité');
        if (tool.conv === 'xlsx2pdf' && !['xlsx', 'xls', 'csv', 'ods'].includes(realFrom)) throw new Error('Format de tableur non reconnu');
        const r = await c.run(bytes, { key: f.path, images: st.images, cover: st.cover, title: st.title, author: st.author, font: st.font, baseName: UI.base(f.name) }, step('Conversion…'));
        if (r.html) return htmlOut(r.html, f, 'PDF', r.landscape);
        return { files: [{ bytes: r.bytes, name: App.outName(f.name, '', c.to) }] };
      },
    };
  }

  function open(id, files) {
    const tool = byId(id);
    if (!tool) return;
    files = (files || []).filter((f) => !f.error);
    if (!tool.multi && files.length > 1) files = [files[0]];
    const def = tool.conv ? convDef(tool) : DEFS[id];
    screen(tool, files, def);
  }

  window.Tools = { TOOLS, byId, forKind, open };
})();
