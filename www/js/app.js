/* Pliage — application : onglets, Outils, Fichiers, Mes essentiels, Réglages, résultat. */
(function () {
  const { icon, esc, el, size, when, badge, kind } = UI;
  let current = 'outils';

  // ---------------------------------------------------------------- Thème

  function applyTheme() {
    const t = Store.settings.theme;
    const dark = t === 'sombre' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#151112' : '#FAF9F8';
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // ---------------------------------------------------------------- Onglets

  const TABS = [['outils', 'Outils', 'grid'], ['fichiers', 'Fichiers', 'folder'], ['modifier', 'Modifier', 'pencil'], ['reglages', 'Réglages', 'sliders']];

  function nav() {
    const n = document.getElementById('nav');
    n.innerHTML = (Native.isDesktop ? `<div class="nav-brand">${UI.BIRD}<span>Pliage</span></div>` : '') + TABS.map(([id, label, ic]) => `<button data-tab="${id}" class="${id === current ? 'on' : ''}" aria-current="${id === current ? 'page' : 'false'}"><span class="pill">${icon(ic, 22)}</span><span>${label}</span></button>`).join('');
    n.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
  }

  function tab(id) {
    UI.popAll();
    current = id;
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + id; });
    nav();
    if (id === 'outils') renderOutils();
    if (id === 'fichiers') renderFichiers();
    if (id === 'reglages') renderReglages();
    if (id === 'modifier') {
      if (!Editor.isOpen()) showEditorEmpty();
      else setTimeout(() => Editor.relayout(), 30);
    }
    const t = document.getElementById('tab-' + id);
    if (t && id !== 'modifier') t.scrollTop = 0;
  }

  // ---------------------------------------------------------------- Outils (accueil)

  function renderOutils(filter) {
    const host = document.getElementById('tab-outils');
    const q = (filter || '').trim().toLowerCase();
    const last = Store.last();
    const secs = ['Organiser', 'Convertir', 'Compresser'];
    const tiles = (sec) => Tools.TOOLS.filter((t) => t.sec === sec && (!q || (t.label + ' ' + sec).toLowerCase().includes(q)))
      .map((t) => `<button class="tile" data-tool="${t.id}">${icon(t.icon, 26)}<span>${esc(t.label)}</span></button>`).join('');
    const body = secs.map((s) => { const t = tiles(s); return t ? `<h2 class="sec-t">${s}</h2><div class="tiles">${t}</div>` : ''; }).join('')
      + (q && 'modifier signer annoter éditer'.includes(q) ? `<h2 class="sec-t">Modifier</h2><div class="tiles"><button class="tile" data-edit>${icon('pencil', 26)}<span>Modifier un PDF</span></button><button class="tile" data-sign>${icon('signature', 26)}<span>Signer</span></button></div>` : '');
    if (filter !== undefined) {
      host.querySelector('.tools-body').innerHTML = body || '<p class="empty">Aucun outil ne correspond.</p>';
      bindTiles(host);
      return;
    }
    host.innerHTML = `<div class="page">
      <header class="home-h"><div class="brand">${UI.BIRD}<span>Pliage</span></div>
        <button class="ib boxed" data-open aria-label="Ouvrir un fichier">${icon('plus', 22)}</button></header>
      <label class="search">${icon('search', 18)}<input placeholder="Chercher un outil" aria-label="Chercher un outil"></label>
      ${last ? `<button class="resume" data-resume><span class="fb lg">${badge(last.name)}</span><span class="ft"><span class="fm">Reprendre</span><span class="fn">${esc(last.name)}</span><span class="fm">${when(last.date)}${last.size ? ' · ' + size(last.size) : ''}</span></span>${icon('chevron', 20, 'acc')}</button>` : ''}
      <div class="tools-body">${body}</div>
    </div>`;
    host.querySelector('.search input').addEventListener('input', (e) => renderOutils(e.target.value));
    host.querySelector('[data-open]').addEventListener('click', openFiles);
    const r = host.querySelector('[data-resume]');
    if (r) r.addEventListener('click', resume);
    bindTiles(host);
  }
  function bindTiles(host) {
    host.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => Tools.open(b.dataset.tool, [])));
    const e = host.querySelector('[data-edit]');
    if (e) e.addEventListener('click', () => pickAndEdit());
    const s = host.querySelector('[data-sign]');
    if (s) s.addEventListener('click', () => pickAndEdit('Signer'));
  }

  async function resume() {
    const last = Store.last();
    if (!last) return openFiles();
    if (!(await Native.exists(last.path))) { UI.toast('Ce fichier n’est plus disponible', true); return; }
    openFile(last);
  }

  async function openFiles() {
    const files = (await Native.pick([], true)).filter((f) => !f.error);
    if (!files.length) return;
    files.forEach((f) => Store.addHistory({ name: f.name, path: f.path, size: f.size, mime: f.mime, tool: 'Ouvert' }));
    suggest(files, 'open');
  }

  async function pickAndEdit(cat) {
    const files = (await Native.pick(['application/pdf'], false)).filter((f) => !f.error);
    if (!files.length) return;
    Store.addHistory({ name: files[0].name, path: files[0].path, size: files[0].size, mime: files[0].mime, tool: 'Ouvert' });
    tab('modifier');
    Editor.open(files[0], cat ? { cat } : undefined);
  }

  // ---------------------------------------------------------------- Feuille « Que veux-tu faire ? »

  function suggest(files, mode) {
    if (!files.length) return;
    const multi = files.length > 1;
    const k = kind(files[0]);
    const same = files.every((f) => kind(f) === k);
    let actions = [];
    if (!multi && k === 'pdf') actions.push({ id: 'edit', label: 'Modifier', icon: 'pencil' }, { id: 'sign', label: 'Signer', icon: 'signature' });
    const tools = multi ? Tools.TOOLS.filter((t) => t.multi && (same ? t.kinds.includes(k) : t.id === 'zip' || t.id === 'merge')) : Tools.forKind(k, false);
    tools.forEach((t) => actions.push({ id: t.id, label: t.label, icon: t.icon }));
    if (multi && !same && files.every((f) => ['pdf', 'image'].includes(kind(f)))) actions = actions.filter((a) => a.id === 'merge' || a.id === 'zip');
    if (!actions.find((a) => a.id === 'zip')) actions.push({ id: 'zip', label: 'Créer un ZIP', icon: 'zip' });
    actions.push({ id: 'ess', label: 'Mes essentiels', icon: 'star' });
    const f = files[0];
    const s = UI.sheet(`<div class="file-head"><span class="fb lg">${multi ? files.length : badge(f.name)}</span><span class="ft"><span class="fn">${multi ? files.length + ' fichiers' : esc(f.name)}</span><span class="fm">${size(files.reduce((a, b) => a + (b.size || 0), 0))}</span></span></div>
      <div class="sh-sub2">Que veux-tu faire ?</div>
      <div class="acts">${actions.map((a) => `<button class="act" data-a="${a.id}"><span class="act-i">${icon(a.icon, 22)}</span><span>${esc(a.label)}</span></button>`).join('')}</div>
      ${!multi && k === 'pdf' ? '<button class="btn wide" data-a="edit">Ouvrir dans l’éditeur</button>' : (!multi ? '<button class="btn wide sec" data-a="openwith">Ouvrir avec une autre appli</button>' : '')}
      <button class="link wide" data-a="close">${mode === 'share' || mode === 'open' ? 'Juste l’ajouter aux fichiers' : 'Fermer'}</button>`);
    s.el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      s.close();
      setTimeout(() => {
        if (a === 'edit' || a === 'sign') { tab('modifier'); Editor.open(f, a === 'sign' ? { cat: 'Signer' } : undefined); }
        else if (a === 'openwith') Native.openWith(f.path).catch((e) => UI.toast(e.message, true));
        else if (a === 'ess') Ess.addFiles(files);
        else if (a === 'close') { if (current === 'fichiers') renderFichiers(); }
        else Tools.open(a, files);
      }, 80);
    }));
  }

  /** Ouvre un fichier : PDF dans l'éditeur, le reste avec une autre appli. */
  function openFile(f) {
    if (kind(f) === 'pdf') { tab('modifier'); Editor.open(f); return; }
    Store.setLast(f);
    Native.openWith(f.path).catch((e) => UI.toast(e.message || 'Aucune appli ne peut ouvrir ce fichier', true));
  }

  // ---------------------------------------------------------------- Noms et résultat

  function outName(src, label, ext) {
    const b = UI.base(src || 'fichier').replace(/ \((modifié|compressé|fusion|extrait|pivoté|réorganisé)\)$/, '');
    if (!label) return `${b}.${ext}`;
    if (Store.settings.naming === 'date') {
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      return `${b}-${label.replace(/\s+/g, '-')}-${stamp}.${ext}`;
    }
    return `${b} (${label}).${ext}`;
  }

  /**
   * Enregistre les fichiers produits par un outil, les ajoute à l'historique
   * et affiche l'écran « C'est prêt ». outputs : [{bytes|path, name}]
   */
  async function finish(outputs, meta) {
    meta = meta || {};
    UI.busy('Enregistrement…');
    const d = await Native.dirs();
    const dir = d.files + '/out/' + Store.uid();
    const saved = [];
    for (let i = 0; i < outputs.length; i++) {
      const o = outputs[i];
      if (outputs.length > 3) UI.progress(((i + 1) / outputs.length) * 100, 'Enregistrement…');
      const path = dir + '/' + o.name.replace(/[\\/:*?"<>|]/g, '_');
      if (o.bytes) await Native.write(path, o.bytes);
      else await Native.copy(o.path, path);
      let sz = o.bytes ? (o.bytes.byteLength != null ? o.bytes.byteLength : o.bytes.size || o.bytes.length) : null;
      if (sz == null || isNaN(sz)) { const r = await Native.exists(path); void r; }
      const entry = Store.addHistory({ name: o.name, path, size: sz, mime: Native.mimeOf(o.name), tool: meta.tool });
      saved.push(entry);
    }
    let where = '';
    if (Store.settings.autoSave && !meta.noAutoSave) {
      try {
        for (const e of saved) {
          const r = await Native.saveToDownloads(e.path, e.name);
          where = r.shown;
          Store.updateHistory(e.id, { shown: r.shown });
        }
        if (saved.length > 1) where = 'Téléchargements/Pliage';
      } catch (e) {
        where = '';
        UI.toast('Copie dans Téléchargements impossible : ' + e.message, true);
      }
    }
    UI.idle();
    if (saved.length === 1) Store.setLast(saved[0]);
    if (meta.from === 'editor') { /* l'éditeur reste ouvert derrière */ }
    result(saved, meta, where);
    return saved;
  }

  function result(files, meta, where) {
    const multi = files.length > 1;
    const f = files[0];
    const k = kind(f);
    const next = multi ? [] : [
      k === 'pdf' && ['sign', 'Signer'], k === 'pdf' && ['edit', 'Modifier'], k === 'pdf' && ['pdf2docx', 'Convertir en Word'],
      k === 'pdf' && ['split', 'Découper'], k === 'pdf' && meta.toolId !== 'cpdf' && ['cpdf', 'Compresser'], ['zip', 'Créer un ZIP'],
    ].filter(Boolean);
    const scr = el(`<section class="scr result">
      <div class="res-top"><button class="ib" data-back aria-label="Fermer">${icon('close')}</button></div>
      <div class="scr-body">
        <div class="res-ok">${icon('check', 34)}</div>
        <h1 class="res-t">C’est prêt</h1>
        <p class="res-s">${esc(meta.sub || (multi ? files.length + ' fichiers créés.' : ''))}</p>
        <div class="flist">${files.slice(0, 60).map((x, i) => `<button class="frow" data-i="${i}"><div class="fb">${badge(x.name)}</div><div class="ft"><span class="fn">${esc(x.name)}</span><span class="fm">${x.size ? size(x.size) : ''}${where && !multi ? ' · ' + esc(where) : ''}</span></div>${icon('chevron', 18, 'acc')}</button>`).join('')}
          ${files.length > 60 ? `<p class="hint">… et ${files.length - 60} autres</p>` : ''}</div>
        ${multi && where ? `<p class="hint">Enregistrés dans ${esc(where)}</p>` : ''}
        <div class="acts3">
          <button class="act2" data-a="share">${icon(Native.isDesktop ? 'folder' : 'share', 22)}<span>${Native.isDesktop ? 'Montrer dans le dossier' : 'Partager'}</span></button>
          ${multi ? `<button class="act2" data-a="zip">${icon('zip', 22)}<span>Tout en ZIP</span></button>` : `<button class="act2" data-a="saveas">${icon('save', 22)}<span>Enregistrer sous</span></button>`}
          <button class="act2" data-a="ess">${icon('star', 22)}<span>Mes essentiels</span></button>
        </div>
        ${next.length ? `<h3 class="sec-t">Continuer avec ce fichier</h3><div class="chips">${next.map(([id, l]) => `<button class="chip" data-n="${id}">${esc(l)}</button>`).join('')}</div>` : ''}
      </div>
      <footer class="foot"><button class="btn wide" data-a="open">${multi ? 'Terminé' : (k === 'pdf' ? 'Ouvrir' : 'Ouvrir avec…')}</button></footer>
    </section>`);
    scr.querySelector('[data-back]').addEventListener('click', () => UI.pop());
    scr.querySelectorAll('.frow').forEach((b) => b.addEventListener('click', () => fileMenu(files[+b.dataset.i])));
    scr.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      try {
        if (a === 'share') await Native.share(files.map((x) => x.path));
        if (a === 'saveas') { const r = await Native.saveAs(f.path, f.name); if (r.saved) UI.toast('Enregistré'); }
        if (a === 'ess') Ess.addFiles(files);
        if (a === 'zip') { UI.popAll(); Tools.open('zip', files.map((x) => ({ path: x.path, name: x.name, size: x.size, mime: x.mime }))); }
        if (a === 'open') {
          if (multi) { UI.popAll(); return; }
          if (meta.from === 'editor') { UI.popAll(); Editor.open(f); return; }
          UI.popAll();
          openFile(f);
        }
      } catch (e) { UI.toast(e.message || 'Action impossible', true); }
    }));
    scr.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
      const n = b.dataset.n;
      UI.popAll();
      if (n === 'sign' || n === 'edit') { tab('modifier'); Editor.open(f, n === 'sign' ? { cat: 'Signer' } : undefined); }
      else Tools.open(n, [f]);
    }));
    UI.push(scr);
  }

  // ---------------------------------------------------------------- Menu d'un fichier

  function fileMenu(f, extra) {
    const items = [
      { icon: kind(f) === 'pdf' ? 'pencil' : 'open', label: kind(f) === 'pdf' ? 'Ouvrir dans l’éditeur' : 'Ouvrir', run: () => { UI.popAll(); openFile(f); } },
      { icon: Native.isDesktop ? 'folder' : 'share', label: Native.isDesktop ? 'Montrer dans le dossier' : 'Partager', run: () => Native.share([f.path]).catch((e) => UI.toast(e.message, true)) },
      { icon: 'save', label: 'Enregistrer sous…', run: async () => { try { const r = await Native.saveAs(f.path, f.name); if (r.saved) UI.toast('Enregistré'); } catch (e) { UI.toast(e.message, true); } } },
      { icon: 'open', label: 'Ouvrir avec une autre appli', run: () => Native.openWith(f.path).catch((e) => UI.toast(e.message, true)) },
      { icon: 'grid', label: 'Envoyer vers un outil', run: () => suggest([f], 'tool') },
    ];
    if (!extra || !extra.inEss) items.push({ icon: 'star', label: 'Ajouter à Mes essentiels', run: () => Ess.addFiles([f]) });
    if (extra && extra.items) items.push(...extra.items);
    if (!extra) {
      items.push({ icon: 'pencil', label: 'Renommer', run: async () => {
        const v = await UI.ask('Renommer', UI.base(f.name), 'Renommer');
        if (!v) return;
        const name = v + (UI.ext(f.name) ? '.' + UI.ext(f.name) : '');
        const d = await Native.dirs();
        const np = d.files + '/out/' + Store.uid() + '/' + name.replace(/[\\/:*?"<>|]/g, '_');
        try { await Native.copy(f.path, np); Store.updateHistory(f.id, { name, path: np }); renderFichiers(); UI.toast('Renommé'); } catch (e) { UI.toast(e.message, true); }
      } });
      items.push({ icon: 'trash', label: 'Retirer de l’historique', danger: true, run: () => { Store.removeHistory(f.id); renderFichiers(); } });
    }
    UI.menu(f.name, items, [size(f.size), f.tool, f.date ? when(f.date) : ''].filter(Boolean).join(' · '));
  }

  // ---------------------------------------------------------------- Fichiers

  const CHIPS = [['all', 'Tous'], ['pdf', 'PDF'], ['word', 'Word'], ['image', 'Images'], ['video', 'Vidéos'], ['ebook', 'E-books'], ['zip', 'ZIP']];
  let filesFilter = 'all', filesQuery = '';

  function renderFichiers() {
    const host = document.getElementById('tab-fichiers');
    const e = Store.ess();
    const roots = e.folders.filter((x) => !x.parent);
    const docsCount = e.docs.length;
    host.innerHTML = `<div class="page">
      <h1 class="h1">Fichiers</h1>
      <div class="ess-card">
        <div class="ess-top">
          <button class="ess-ic" data-ess aria-label="Ouvrir ${esc(e.name)}">${icon('star', 24)}</button>
          <button class="ess-t" data-ess><span class="ess-n">${esc(e.name)}</span><span class="fm">${roots.length} sous-dossier${roots.length > 1 ? 's' : ''} · ${docsCount} document${docsCount > 1 ? 's' : ''}</span></button>
          <button class="ib" data-ren aria-label="Renommer le dossier">${icon('pencil', 20)}</button>
        </div>
        <div class="ess-subs">${roots.map((f) => `<button class="sub" data-sub="${f.id}">${icon('folder', 16, 'acc')}${esc(f.name)}<span>${Ess.count(f.id)}</span></button>`).join('')}
          <button class="sub add" data-newsub>+ Sous-dossier</button></div>
      </div>
      <label class="search">${icon('search', 18)}<input placeholder="Chercher un fichier" aria-label="Chercher un fichier" value="${esc(filesQuery)}"></label>
      <div class="chips">${CHIPS.map(([id, l]) => `<button class="chip${filesFilter === id ? ' on' : ''}" data-c="${id}">${l}</button>`).join('')}</div>
      <div class="hist"></div>
    </div>
    <button class="fab" data-add aria-label="Ajouter des fichiers">${icon('plus', 26)}</button>`;
    host.querySelectorAll('[data-ess]').forEach((b) => b.addEventListener('click', () => Ess.open(null)));
    host.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => Ess.open(b.dataset.sub)));
    host.querySelector('[data-ren]').addEventListener('click', async () => {
      const v = await UI.ask('Renommer le dossier', e.name, 'Renommer');
      if (!v) return;
      const x = Store.ess(); x.name = v; Store.saveEss(x); renderFichiers();
    });
    host.querySelector('[data-newsub]').addEventListener('click', async () => { await Ess.newFolder(null); renderFichiers(); });
    host.querySelector('.search input').addEventListener('input', (ev) => { filesQuery = ev.target.value; renderHistory(); });
    host.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { filesFilter = b.dataset.c; host.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); renderHistory(); }));
    host.querySelector('[data-add]').addEventListener('click', openFiles);
    renderHistory();
  }

  function renderHistory() {
    const box = document.querySelector('#tab-fichiers .hist');
    if (!box) return;
    const q = filesQuery.trim().toLowerCase();
    const list = Store.history().filter((f) => (filesFilter === 'all' || kind(f) === filesFilter) && (!q || f.name.toLowerCase().includes(q)));
    if (!list.length) {
      box.innerHTML = `<div class="empty-st">${icon('folder', 34)}<b>${Store.history().length ? 'Aucun fichier ne correspond' : 'Tes fichiers apparaîtront ici'}</b><span>${Store.history().length ? 'Essaie un autre filtre.' : 'Chaque fichier ouvert ou créé avec Pliage est gardé dans cet historique.'}</span></div>`;
      return;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const groups = [["Aujourd'hui", (t) => t >= today], ['Cette semaine', (t) => t < today && t >= today - 6 * 864e5], ['Plus ancien', (t) => t < today - 6 * 864e5]];
    box.innerHTML = groups.map(([title, test]) => {
      const items = list.filter((f) => test(f.date));
      if (!items.length) return '';
      return `<h2 class="sec-t">${title}</h2><div class="card list">${items.slice(0, 120).map((f) => `<div class="frow" data-id="${f.id}"><button class="frow-main" data-open><div class="fb">${badge(f.name)}</div><div class="ft"><span class="fn">${esc(f.name)}</span><span class="fm">${esc([f.tool, size(f.size), when(f.date)].filter(Boolean).join(' · '))}</span></div></button>
        <button class="ib" data-more aria-label="Actions sur ${esc(f.name)}">${icon('more', 22)}</button></div>`).join('')}</div>`;
    }).join('');
    box.querySelectorAll('.frow').forEach((row) => {
      const f = list.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-open]').addEventListener('click', async () => {
        if (!(await Native.exists(f.path))) { UI.toast('Ce fichier n’est plus disponible', true); return; }
        openFile(f);
      });
      row.querySelector('[data-more]').addEventListener('click', () => fileMenu(f));
      UI.longPress(row.querySelector('[data-open]'), () => fileMenu(f));
    });
  }

  // ---------------------------------------------------------------- Mes essentiels

  const Ess = {
    count(folderId) {
      const e = Store.ess();
      const ids = new Set([folderId]);
      let grew = true;
      while (grew) { grew = false; e.folders.forEach((f) => { if (ids.has(f.parent) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }); }
      return e.docs.filter((d) => ids.has(d.folder)).length;
    },

    async newFolder(parent) {
      const v = await UI.ask('Nouveau sous-dossier', '', 'Créer', { placeholder: 'Administratif' });
      if (!v) return null;
      const e = Store.ess();
      const f = { id: Store.uid(), name: v, parent: parent || null };
      e.folders.push(f);
      Store.saveEss(e);
      return f;
    },

    async addFiles(files, folder) {
      if (folder === undefined) {
        folder = await Ess.pickFolder('Ajouter dans…');
        if (folder === false) return;
      }
      UI.busy('Ajout à ' + Store.ess().name + '…');
      try {
        const d = await Native.dirs();
        const e = Store.ess();
        for (const f of files) {
          const id = Store.uid();
          const path = d.files + '/essentiels/' + id + '-' + f.name.replace(/[\\/:*?"<>|]/g, '_');
          await Native.copy(f.path, path);
          e.docs.push({ id, name: f.name, path, size: f.size, mime: f.mime || Native.mimeOf(f.name), folder: folder || null, date: Date.now() });
        }
        Store.saveEss(e);
        UI.idle();
        UI.toast(files.length > 1 ? files.length + ' fichiers ajoutés' : 'Ajouté à ' + e.name);
        if (current === 'fichiers') renderFichiers();
        Ess.refresh();
      } catch (err) {
        UI.idle();
        UI.toast(err.message || 'Ajout impossible', true);
      }
    },

    /** Choix d'un dossier. Renvoie id, null (racine) ou false (annulé). */
    pickFolder(title, exclude) {
      return new Promise((resolve) => {
        const e = Store.ess();
        let done = false;
        const depthOf = (f) => { let n = 0, p = f.parent; while (p) { n++; const x = e.folders.find((y) => y.id === p); p = x ? x.parent : null; } return n; };
        const ordered = [];
        const walk = (parent) => e.folders.filter((f) => (f.parent || null) === parent).forEach((f) => { ordered.push(f); walk(f.id); });
        walk(null);
        const banned = new Set();
        if (exclude) { banned.add(exclude); let grew = true; while (grew) { grew = false; e.folders.forEach((f) => { if (banned.has(f.parent) && !banned.has(f.id)) { banned.add(f.id); grew = true; } }); } }
        const s = UI.sheet(`<div class="sh-title">${esc(title)}</div><div class="menu">
          <button class="mi" data-f="">${icon('star')}<span>${esc(e.name)}</span></button>
          ${ordered.filter((f) => !banned.has(f.id)).map((f) => `<button class="mi" data-f="${f.id}" style="padding-left:${16 + depthOf(f) * 22}px">${icon('folder')}<span>${esc(f.name)}</span></button>`).join('')}
          <button class="mi" data-new>${icon('plus')}<span>Nouveau sous-dossier</span></button></div>`, { onClose: () => { if (!done) resolve(false); } });
        s.el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { done = true; s.close(); resolve(b.dataset.f || null); }));
        s.el.querySelector('[data-new]').addEventListener('click', async () => { done = true; s.close(); const f = await Ess.newFolder(null); resolve(f ? f.id : false); });
      });
    },

    view: null,

    open(folderId) {
      const scr = el(`<section class="scr ess">${UI.header('', '', `<button class="ib" data-more aria-label="Plus d'actions">${icon('more', 22)}</button>`)}<div class="scr-body"></div></section>`);
      Ess.view = { scr, folder: folderId || null, renaming: false };
      scr.querySelector('[data-back]').addEventListener('click', () => {
        const v = Ess.view;
        const e = Store.ess();
        if (v.folder) { const f = e.folders.find((x) => x.id === v.folder); v.folder = f ? f.parent : null; Ess.refresh(); }
        else UI.pop();
      });
      scr.querySelector('[data-more]').addEventListener('click', () => Ess.folderMenu());
      UI.push(scr, () => { Ess.view = null; if (current === 'fichiers') renderFichiers(); });
      Ess.refresh();
    },

    refresh() {
      const v = Ess.view;
      if (!v) return;
      const e = Store.ess();
      const folder = v.folder ? e.folders.find((x) => x.id === v.folder) : null;
      if (v.folder && !folder) v.folder = null;
      const crumbs = [];
      let p = folder;
      while (p) { crumbs.unshift(p.name); const par = p.parent; p = par ? e.folders.find((x) => x.id === par) : null; }
      v.scr.querySelector('.t1').textContent = folder ? folder.name : e.name;
      let t2 = v.scr.querySelector('.t2');
      if (!t2) { t2 = el('<span class="t2"></span>'); v.scr.querySelector('.bar-t').appendChild(t2); }
      t2.textContent = ['Fichiers', e.name].concat(crumbs).join(' › ');
      const subs = e.folders.filter((x) => (x.parent || null) === (v.folder || null));
      const docs = e.docs.filter((d) => (d.folder || null) === (v.folder || null));
      const body = v.scr.querySelector('.scr-body');
      body.innerHTML = `<div class="acts3">
          <button class="act2" data-a="ren">${icon('pencil', 22)}<span>Renommer</span></button>
          <button class="act2" data-a="sub">${icon('folder', 22)}<span>Sous-dossier</span></button>
          <button class="act2" data-a="add">${icon('plus', 22)}<span>Ajouter</span></button></div>
        ${subs.length ? `<h3 class="sec-t">Sous-dossiers</h3><div class="fgrid">${subs.map((s) => `<button class="fcell" data-f="${s.id}"><span class="fold">${icon('folder', 28)}</span><span class="fn">${esc(s.name)}</span><span class="fm">${Ess.count(s.id)} document${Ess.count(s.id) > 1 ? 's' : ''}</span></button>`).join('')}</div>` : ''}
        <h3 class="sec-t">Documents</h3>
        ${docs.length ? `<div class="card list">${docs.map((d) => `<div class="frow" data-d="${d.id}"><button class="frow-main" data-open><div class="fb">${badge(d.name)}</div><div class="ft"><span class="fn">${esc(d.name)}</span><span class="fm">${esc([size(d.size), when(d.date)].filter(Boolean).join(' · '))}</span></div></button><button class="ib" data-more aria-label="Actions">${icon('more', 22)}</button></div>`).join('')}</div>`
        : `<div class="empty-st sm">${icon('file', 30)}<b>Aucun document ici</b><span>Ajoute tes documents les plus utiles : ils restent disponibles même si l’original est supprimé.</span></div>`}
        <p class="hint center">Appui long sur un document ou un dossier pour le renommer, le déplacer ou le retirer.</p>`;
      body.querySelector('[data-a="ren"]').addEventListener('click', () => Ess.rename(v.folder));
      body.querySelector('[data-a="sub"]').addEventListener('click', async () => { await Ess.newFolder(v.folder); Ess.refresh(); });
      body.querySelector('[data-a="add"]').addEventListener('click', async () => {
        const files = (await Native.pick([], true)).filter((f) => !f.error);
        if (files.length) Ess.addFiles(files, v.folder || null);
      });
      body.querySelectorAll('[data-f]').forEach((b) => {
        b.addEventListener('click', () => { v.folder = b.dataset.f; Ess.refresh(); });
        UI.longPress(b, () => Ess.folderMenu(b.dataset.f));
      });
      body.querySelectorAll('[data-d]').forEach((row) => {
        const d = e.docs.find((x) => x.id === row.dataset.d);
        row.querySelector('[data-open]').addEventListener('click', () => openFile(d));
        row.querySelector('[data-more]').addEventListener('click', () => Ess.docMenu(d));
        UI.longPress(row.querySelector('[data-open]'), () => Ess.docMenu(d));
      });
    },

    async rename(folderId) {
      const e = Store.ess();
      const f = folderId ? e.folders.find((x) => x.id === folderId) : null;
      const v = await UI.ask(f ? 'Renommer le sous-dossier' : 'Renommer le dossier', f ? f.name : e.name, 'Renommer');
      if (!v) return;
      const x = Store.ess();
      if (f) x.folders.find((y) => y.id === folderId).name = v; else x.name = v;
      Store.saveEss(x);
      Ess.refresh();
    },

    folderMenu(folderId) {
      const id = folderId || (Ess.view && Ess.view.folder);
      const e = Store.ess();
      const f = id ? e.folders.find((x) => x.id === id) : null;
      if (!f) {
        UI.menu(e.name, [
          { icon: 'pencil', label: 'Renommer', run: () => Ess.rename(null) },
          { icon: 'folder', label: 'Nouveau sous-dossier', run: async () => { await Ess.newFolder(null); Ess.refresh(); } },
          { icon: 'save', label: 'Sauvegarder (Réglages)', run: () => { UI.popAll(); tab('reglages'); } },
        ]);
        return;
      }
      const siblings = e.folders.filter((x) => (x.parent || null) === (f.parent || null));
      UI.menu(f.name, [
        { icon: 'pencil', label: 'Renommer', run: () => Ess.rename(f.id) },
        { icon: 'folder', label: 'Nouveau sous-dossier dedans', run: async () => { await Ess.newFolder(f.id); Ess.refresh(); } },
        { icon: 'move', label: 'Déplacer', run: async () => {
          const to = await Ess.pickFolder('Déplacer « ' + f.name + ' » vers…', f.id);
          if (to === false) return;
          const x = Store.ess(); x.folders.find((y) => y.id === f.id).parent = to; Store.saveEss(x); Ess.refresh();
        } },
        siblings.indexOf(f) > 0 && { icon: 'up', label: 'Monter dans la liste', run: () => Ess.reorder(f.id, -1) },
        siblings.indexOf(f) < siblings.length - 1 && { icon: 'down', label: 'Descendre dans la liste', run: () => Ess.reorder(f.id, 1) },
        { icon: 'trash', label: 'Supprimer le dossier', danger: true, run: () => Ess.removeFolder(f.id) },
      ].filter(Boolean));
    },

    reorder(id, dir) {
      const e = Store.ess();
      const f = e.folders.find((x) => x.id === id);
      const sib = e.folders.filter((x) => (x.parent || null) === (f.parent || null));
      const i = sib.indexOf(f), j = i + dir;
      if (j < 0 || j >= sib.length) return;
      const a = e.folders.indexOf(sib[i]), b = e.folders.indexOf(sib[j]);
      [e.folders[a], e.folders[b]] = [e.folders[b], e.folders[a]];
      Store.saveEss(e);
      Ess.refresh();
    },

    async removeFolder(id) {
      const n = Ess.count(id);
      const ok = await UI.confirm('Supprimer ce dossier ?', n ? `Ses ${n} document${n > 1 ? 's' : ''} et sous-dossiers seront supprimés de Pliage.` : 'Il est vide.', 'Supprimer', true);
      if (!ok) return;
      const e = Store.ess();
      const ids = new Set([id]);
      let grew = true;
      while (grew) { grew = false; e.folders.forEach((f) => { if (ids.has(f.parent) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }); }
      for (const d of e.docs.filter((x) => ids.has(x.folder))) await Native.remove(d.path);
      e.docs = e.docs.filter((x) => !ids.has(x.folder));
      const parent = (e.folders.find((x) => x.id === id) || {}).parent || null;
      e.folders = e.folders.filter((x) => !ids.has(x.id));
      Store.saveEss(e);
      if (Ess.view && ids.has(Ess.view.folder)) Ess.view.folder = parent;
      Ess.refresh();
    },

    docMenu(d) {
      fileMenu(d, { inEss: true, items: [
        { icon: 'pencil', label: 'Renommer', run: async () => {
          const v = await UI.ask('Renommer', UI.base(d.name), 'Renommer');
          if (!v) return;
          const e = Store.ess(); e.docs.find((x) => x.id === d.id).name = v + (UI.ext(d.name) ? '.' + UI.ext(d.name) : ''); Store.saveEss(e); Ess.refresh();
        } },
        { icon: 'move', label: 'Déplacer vers…', run: async () => {
          const to = await Ess.pickFolder('Déplacer vers…');
          if (to === false) return;
          const e = Store.ess(); e.docs.find((x) => x.id === d.id).folder = to; Store.saveEss(e); Ess.refresh();
        } },
        { icon: 'trash', label: 'Retirer de ' + Store.ess().name, danger: true, run: async () => {
          const ok = await UI.confirm('Retirer ce document ?', 'La copie gardée par Pliage sera supprimée.', 'Retirer', true);
          if (!ok) return;
          const e = Store.ess(); e.docs = e.docs.filter((x) => x.id !== d.id); Store.saveEss(e); await Native.remove(d.path); Ess.refresh();
        } },
      ] });
    },
  };

  // ---------------------------------------------------------------- Modifier (sans document)

  function showEditorEmpty() {
    const host = document.getElementById('tab-modifier');
    const pdfs = Store.history().filter((f) => kind(f) === 'pdf').slice(0, 6);
    host.innerHTML = `<div class="page">
      <h1 class="h1">Modifier</h1>
      <div class="empty-st big">${icon('pencil', 40)}<b>Ouvre un PDF pour le modifier</b><span>Surligne, écris, ajoute des images, signe ou remplis un formulaire.</span>
        <button class="btn" data-pick>Ouvrir un PDF</button></div>
      ${pdfs.length ? `<h2 class="sec-t">PDF récents</h2><div class="card list">${pdfs.map((f) => `<button class="frow" data-id="${f.id}"><div class="fb">PDF</div><div class="ft"><span class="fn">${esc(f.name)}</span><span class="fm">${esc([size(f.size), when(f.date)].filter(Boolean).join(' · '))}</span></div>${icon('chevron', 18, 'acc')}</button>`).join('')}</div>` : ''}
    </div>`;
    host.querySelector('[data-pick]').addEventListener('click', async () => {
      const files = (await Native.pick(['application/pdf'], false)).filter((f) => !f.error);
      if (!files.length) return;
      Store.addHistory({ name: files[0].name, path: files[0].path, size: files[0].size, mime: files[0].mime, tool: 'Ouvert' });
      Editor.open(files[0]);
    });
    host.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', async () => {
      const f = pdfs.find((x) => x.id === b.dataset.id);
      if (!(await Native.exists(f.path))) return UI.toast('Ce fichier n’est plus disponible', true);
      Editor.open(f);
    }));
  }

  // ---------------------------------------------------------------- Réglages

  async function renderReglages() {
    const host = document.getElementById('tab-reglages');
    const s = Store.settings;
    const key = await Native.hasSecret(s.service).catch(() => ({ has: false }));
    const seg = (name, opts, v) => `<div class="seg sm" data-seg="${name}">${opts.map(([k, l]) => `<button class="${String(k) === String(v) ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`;
    const row = (label, value, attr) => `<button class="srow" ${attr}><span>${label}</span><span class="sv">${esc(value)}</span>${icon('chevron', 16)}</button>`;
    const sw = (name, label, sub, on) => `<label class="tg"><span class="tg-t"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-sw="${name}" ${on ? 'checked' : ''}><span class="sl" aria-hidden="true"></span></label>`;
    const sigs = Store.signatures();
    const svc = s.service === 'cloudconvert' ? 'CloudConvert' : 'ConvertAPI';
    host.innerHTML = `<div class="page">
      <h1 class="h1">Réglages</h1>
      <h2 class="sec-t">Apparence</h2>
      <div class="card"><div class="srow static"><span>Thème</span>${seg('theme', [['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']], s.theme)}</div></div>

      <h2 class="sec-t">Enregistrement</h2>
      <div class="card">
        ${sw('autoSave', 'Copier dans Téléchargements/Pliage', 'Chaque fichier créé y est aussi enregistré', s.autoSave)}
        ${Native.isDesktop ? row('Ouvrir le dossier Téléchargements/Pliage', '', 'data-dl') : ''}
        <div class="srow static"><span>Nom des fichiers</span>${seg('naming', [['outil', 'nom (outil)'], ['date', 'nom-outil-date']], s.naming)}</div>
      </div>

      <h2 class="sec-t">Qualité par défaut</h2>
      <div class="card">
        <div class="srow static"><span>Compression PDF</span>${seg('pdfLevel', [[0, 'Légère'], [1, 'Recomm.'], [2, 'Forte']], s.pdfLevel)}</div>
        <div class="srow static"><span>Vidéos</span>${seg('videoHeight', [[480, '480p'], [720, '720p'], [1080, '1080p']], s.videoHeight)}</div>
        <div class="srow static"><span>PDF → Image</span>${seg('dpi', [[72, '72'], [150, '150'], [300, '300 ppp']], s.dpi)}</div>
        <div class="srow static col"><span>Qualité des images <b class="qv">${s.imgQuality} %</b></span><input type="range" min="30" max="95" step="1" value="${s.imgQuality}" data-imgq aria-label="Qualité des images"></div>
      </div>

      <h2 class="sec-t">Conversion haute fidélité (en ligne)</h2>
      <div class="card">
        <div class="srow static"><span>Service</span>${seg('service', [['convertapi', 'ConvertAPI'], ['cloudconvert', 'CloudConvert']], s.service)}</div>
        <div class="srow static col">
          <label for="apikey">Clé API ${svc}</label>
          <div class="row2 tight"><input id="apikey" class="field" type="password" autocomplete="off" placeholder="${key.has ? '••••••••••••' + esc(key.tail) : 'Colle ta clé ici'}"><button class="btn sm sec" data-savekey>Enregistrer</button></div>
          <div class="row2 tight"><button class="btn sm sec" data-test ${key.has ? '' : 'disabled'}>Tester la connexion</button><span class="kmsg">${key.has ? 'Clé enregistrée (chiffrée sur le téléphone)' : 'Aucune clé enregistrée'}</span></div>
          <a class="link" href="${s.service === 'cloudconvert' ? 'https://cloudconvert.com/dashboard/api/v2/keys' : 'https://www.convertapi.com/a/auth'}" target="_blank" rel="noopener">Créer un compte gratuit et obtenir une clé</a>
        </div>
        ${sw('askOnline', 'Demander avant chaque envoi', 'Le fichier passe par un serveur externe', s.askOnline)}
      </div>

      <h2 class="sec-t">Signatures</h2>
      <div class="card">
        ${sigs.length ? `<div class="sig-grid pad">${sigs.map((x) => `<div class="sig-item"><img src="${x.dataUrl}" alt="${x.kind === 'initiales' ? 'Initiales' : 'Signature'}"><button class="ib sm" data-delsig="${x.id}" aria-label="Supprimer">${icon('trash', 16)}</button></div>`).join('')}</div>` : '<div class="srow static"><span class="muted">Aucune signature enregistrée</span></div>'}
        ${row('Tracer une signature', '', 'data-newsig')}
      </div>

      ${Native.isDesktop ? '' : `<h2 class="sec-t">Widget</h2>
      <div class="card"><div class="srow static col"><span>Ajoute le widget Pliage depuis l’écran d’accueil (appui long › Widgets). Pour changer son thème ou ses quatre raccourcis : appui long sur le widget › Paramètres.</span></div></div>`}

      <h2 class="sec-t">Données</h2>
      <div class="card">
        ${row('Créer une sauvegarde', 'ZIP', 'data-backup')}
        ${row('Restaurer une sauvegarde', '', 'data-restore')}
        <button class="srow danger" data-clear><span>Vider l’historique</span></button>
        <div class="srow static"><span>Version</span><span class="sv">${esc(window.PLIAGE_VERSION || '1.0')}</span></div>
      </div>
    </div>`;
    host.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const k = g.dataset.seg;
      let v = b.dataset.v;
      if (['pdfLevel', 'videoHeight', 'dpi'].includes(k)) v = +v;
      Store.set(k, v);
      g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'theme') applyTheme();
      if (k === 'service') renderReglages();
    })));
    host.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => Store.set(i.dataset.sw, i.checked)));
    const q = host.querySelector('[data-imgq]');
    q.addEventListener('input', () => { host.querySelector('.qv').textContent = q.value + ' %'; });
    q.addEventListener('change', () => Store.set('imgQuality', +q.value));
    host.querySelector('[data-savekey]').addEventListener('click', async () => {
      const v = host.querySelector('#apikey').value.trim();
      if (!v) return UI.toast('Colle d’abord ta clé', true);
      try { await Native.setSecret(Store.settings.service, v); UI.toast('Clé enregistrée'); renderReglages(); } catch (e) { UI.toast(e.message, true); }
    });
    host.querySelector('[data-test]').addEventListener('click', async () => {
      const m = host.querySelector('.kmsg');
      m.textContent = 'Test en cours…';
      try { const r = await Native.testOnline(Store.settings.service); m.textContent = r.info; m.className = 'kmsg ok'; } catch (e) { m.textContent = e.message; m.className = 'kmsg err'; }
    });
    host.querySelectorAll('[data-delsig]').forEach((b) => b.addEventListener('click', () => { Store.removeSignature(b.dataset.delsig); renderReglages(); }));
    host.querySelector('[data-newsig]').addEventListener('click', async () => { const r = await Sig.draw('signature'); void r; renderReglages(); });
    host.querySelector('[data-backup]').addEventListener('click', backup);
    const dl = host.querySelector('[data-dl]');
    if (dl) dl.addEventListener('click', () => Native.showDownloads());
    host.querySelector('[data-restore]').addEventListener('click', restore);
    host.querySelector('[data-clear]').addEventListener('click', async () => {
      const ok = await UI.confirm('Vider l’historique ?', 'Les fichiers restent dans Téléchargements/Pliage et dans ' + Store.ess().name + '.', 'Vider', true);
      if (!ok) return;
      Store.clearHistory();
      Native.clearCache();
      UI.toast('Historique vidé');
    });
  }

  async function backup() {
    UI.busy('Création de la sauvegarde…');
    try {
      const d = await Native.dirs();
      const stamp = new Date().toISOString().slice(0, 10);
      const r = await Native.backup(Store.exportJson(), d.cache + '/work/pliage-sauvegarde-' + stamp + '.zip');
      UI.idle();
      const s = await Native.saveAs(r.path, 'pliage-sauvegarde-' + stamp + '.zip');
      if (s.saved) UI.toast('Sauvegarde enregistrée');
    } catch (e) { UI.idle(); UI.toast(e.message, true); }
  }
  async function restore() {
    const files = (await Native.pick(['application/zip', 'application/octet-stream'], false)).filter((f) => !f.error);
    if (!files.length) return;
    const ok = await UI.confirm('Restaurer cette sauvegarde ?', 'Ton dossier personnel, tes signatures et tes réglages seront remplacés.', 'Restaurer', true);
    if (!ok) return;
    UI.busy('Restauration…');
    try {
      const r = await Native.restore(files[0].path);
      Store.importJson(r.json, r.dir);
      UI.idle();
      applyTheme();
      UI.toast('Sauvegarde restaurée');
      renderReglages();
    } catch (e) { UI.idle(); UI.toast(e.message, true); }
  }

  // ---------------------------------------------------------------- Raccourcis du widget, fichiers reçus, retour

  function shortcut(action) {
    UI.popAll();
    switch (action) {
      case 'compresser': tab('outils'); UI.menu('Compresser', Tools.TOOLS.filter((t) => t.sec === 'Compresser').map((t) => ({ icon: t.icon, label: t.label, run: () => Tools.open(t.id, []) }))); break;
      case 'convertir': tab('outils'); UI.menu('Convertir', Tools.TOOLS.filter((t) => t.sec === 'Convertir').map((t) => ({ icon: t.icon, label: t.label, run: () => Tools.open(t.id, []) }))); break;
      case 'modifier': tab('modifier'); if (!Editor.isOpen()) pickAndEdit(); break;
      case 'signer': pickAndEdit('Signer'); break;
      case 'fusionner': tab('outils'); Tools.open('merge', []); break;
      case 'essentiels': tab('fichiers'); Ess.open(null); break;
      case 'fichiers': tab('fichiers'); break;
      case 'resume': tab('outils'); resume(); break;
      case 'ouvrir': tab('outils'); openFiles(); break;
      default: tab('outils');
    }
  }

  function incoming(d) {
    const files = (d.files || []).filter((f) => {
      if (f.error) { UI.toast((f.name || 'Fichier') + ' : ' + f.error, true); return false; }
      return true;
    });
    if (!files.length) return;
    files.forEach((f) => Store.addHistory({ name: f.name, path: f.path, size: f.size, mime: f.mime, tool: d.mode === 'share' ? 'Reçu' : 'Ouvert' }));
    UI.popAll();
    if (current === 'fichiers') renderFichiers();
    // Un PDF ouvert depuis une autre appli arrive directement dans l'éditeur
    if (d.mode === 'open' && files.length === 1 && kind(files[0]) === 'pdf') {
      tab('modifier');
      // Sur le téléphone : lecture seule d'abord, bouton « Modifier » pour éditer
      Editor.open(files[0], Native.isDesktop ? undefined : { view: true, outside: true });
      return;
    }
    suggest(files, d.mode);
  }

  let lastBack = 0;
  function back() {
    if (UI.isBusy()) return;
    if (UI.closeTopSheet()) return;
    if (UI.depth()) {
      const top = UI.topScreen();
      const b = top && top.querySelector('[data-back]');
      if (b && top.classList.contains('ess')) { b.click(); return; }
      UI.pop();
      return;
    }
    if (current === 'modifier' && Editor.handleBack()) return;
    if (current !== 'outils') { tab('outils'); return; }
    if (Date.now() - lastBack < 2000) { Native.exitApp(); return; }
    lastBack = Date.now();
    UI.toast('Appuie encore pour quitter');
  }

  // ---------------------------------------------------------------- Démarrage

  async function start() {
    applyTheme();
    nav();
    tab('outils');
    Native.onIncoming(incoming);
    Native.onShortcut((d) => shortcut(d.action));
    Native.onBack(back);
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (current === 'modifier') Editor.relayout(); }, 250); });
    if (Native.isDesktop) {
      document.documentElement.classList.add('desktop');
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
      document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
      document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
      document.addEventListener('drop', async (e) => {
        e.preventDefault();
        document.body.classList.remove('dropping');
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        const files = await Native.importDropped(e.dataTransfer.files);
        incoming({ files, mode: 'open' });
      });
      Native.version().then((v) => { if (v) window.PLIAGE_VERSION = v; }).catch(() => {});
    }
    try {
      const info = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App ? await window.Capacitor.Plugins.App.getInfo() : null;
      if (info) window.PLIAGE_VERSION = info.version;
    } catch (e) { /* rien */ }
    // Animation seulement au lancement normal sur le téléphone (pas sur PC, pas en ouvrant un fichier)
    let noIntro = Native.isDesktop;
    if (!noIntro) { try { noIntro = !!(await Native.launchInfo()).file; } catch (e) { /* rien */ } }
    if (noIntro) Intro.skip(); else Intro.play();
  }

  window.App = { tab, outName, finish, openFile, showEditorEmpty, Ess };
  window.Ess = Ess;
  document.addEventListener('DOMContentLoaded', start);
})();
