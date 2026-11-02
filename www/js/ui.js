/* Pliage — petits outils d'interface : éléments, icônes, écrans, feuilles, messages. */
(function () {
  const ICONS = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    folder: 'M3 6h6l2 2h10v11H3z',
    pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
    search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-6-6',
    plus: 'M12 5v14M5 12h14',
    back: 'M15 6l-6 6 6 6',
    close: 'M6 6l12 12M18 6L6 18',
    chevron: 'M9 6l6 6-6 6',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    more: 'M12 5h.01M12 12h.01M12 19h.01',
    check: 'M5 12l5 5 9-10',
    merge: 'M8 4v5l4 4 4-4V4M12 13v7',
    scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 7.5L20 18M8.5 16.5L20 6',
    rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    extract: 'M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3 3 3-3',
    del: 'M14 3H6v18h12V7zM14 3v4h4M9 14h6',
    word: 'M14 3H6v18h12V7zM14 3v4h4M9 12l1 5 2-3 2 3 1-5',
    swap: 'M4 7h13l-3-3M20 17H7l3 3',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5',
    img2pdf: 'M4 5h10v10H4zM4 12l3-3 3 3M17 9h3v11H9v-3',
    table: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
    slides: 'M3 4h18v12H3zM12 16v4M8 20h8',
    book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 21V5',
    book2: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 21V5M9 8h5',
    kindle: 'M6 3h12v18H6zM9 17h6',
    compress: 'M8 4l4 4 4-4M8 20l4-4 4 4M4 12h16',
    video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
    zip: 'M14 3H6v18h12V7zM14 3v4h4M10 6h2M10 9h2M10 12h2v4h-2z',
    unzip: 'M8 8l4-4 4 4M8 16l4 4 4-4M4 12h16',
    share: 'M6 12a2 2 0 1 0 0 .1M18 6a2 2 0 1 0 0 .1M18 18a2 2 0 1 0 0 .1M8 11l8-4M8 13l8 4',
    save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    star: 'M3 6h6l2 2h10v11H3zM12 11l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 13.3l2-.3z',
    file: 'M14 3H6v18h12V7zM14 3v4h4',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    highlight: 'M9 15l-4 4h6l1-1M9 15l6-6 4 4-6 6zM15 9l2-2 4 4-2 2',
    underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
    strike: 'M5 12h14M8 6a4 3 0 0 1 8 0M8 18a4 3 0 0 0 8 0',
    pen: 'M4 20c4-1 5-6 8-6s3 4 8 2M14 4l6 6',
    shapes: 'M4 4h8v8H4zM17 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    note: 'M4 4h16v12H9l-5 4z',
    text: 'M5 6V4h14v2M12 4v16M9 20h6',
    replace: 'M4 7h9M4 12h6M4 17h9M16 9l4 4-4 4',
    mask: 'M4 8h16v8H4z',
    eraser: 'M8 20h12M5 15l8-8 6 6-5 5H9z',
    signature: 'M3 17c3 0 4-8 6-8s0 8 3 8 3-4 5-4 2 2 4 2',
    initials: 'M5 18V6l5 8 5-8v12',
    date: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    tick: 'M5 12l4 4 10-10',
    fields: 'M4 7h16v4H4zM4 15h10v4H4z',
    boxes: 'M4 4h7v7H4zM13 6h7M13 17h7M4 13h7v7H4zM6 16l2 2 2-3',
    flatten: 'M4 12h16M8 8l4-4 4 4M8 16l4 4 4-4',
    hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2 7-6 7-3 0-4-1-6-4l-2-3a1.5 1.5 0 0 1 2.5-1.5L8 13',
    zoomin: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-6-6M10 7v6M7 10h6',
    zoomout: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-6-6M7 10h6',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    move: 'M3 6h6l2 2h10v11H3zM10 13h6M13 10l3 3-3 3',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
    warn: 'M12 3l9 16H3zM12 10v4M12 17h.01',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    select: 'M5 3l14 8-6 2-2 6z',
    widget: 'M4 4h16v10H4zM7 17h10M9 20h6',
  };

  function icon(name, size, extra) {
    const d = ICONS[name] || ICONS.file;
    return `<svg class="ic${extra ? ' ' + extra : ''}" width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  const BIRD = `<svg class="bird" viewBox="14 20 84 66" aria-hidden="true"><polygon class="b1" points="34,80 92,80 62,52"/><polygon class="b2" points="62,52 92,80 88,26"/><polygon class="b1" points="34,80 24,52 46,70"/><polygon class="b2" points="24,52 18,56 28,58"/></svg>`;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /** Crée un élément à partir de HTML. */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function size(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' Mo';
    return (n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',') + ' Go';
  }

  function when(ts) {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'hier ' + hm;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function ext(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1).toLowerCase() : '';
  }
  function base(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }
  function badge(name) {
    const e = ext(name).toUpperCase();
    const map = { DOCX: 'DOC', JPEG: 'JPG', PPTX: 'PPT', XLSX: 'XLS', AZW3: 'AZW' };
    return (map[e] || e || 'FIC').slice(0, 4);
  }
  function kind(f) {
    const e = ext(f.name), m = f.mime || '';
    if (e === 'pdf' || m === 'application/pdf') return 'pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return 'word';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(e)) return 'excel';
    if (['ppt', 'pptx', 'odp'].includes(e)) return 'ppt';
    if (['epub', 'mobi', 'azw3', 'fb2', 'azw'].includes(e)) return 'ebook';
    if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'].includes(e)) return 'image';
    if (m.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm', '3gp', 'avi'].includes(e)) return 'video';
    if (e === 'zip') return 'zip';
    return 'other';
  }

  // ---- Messages courts
  let toastTimer = null;
  function toast(msg, isError) {
    let t = document.getElementById('toast');
    if (!t) {
      t = el('<div id="toast" role="status" aria-live="polite"></div>');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, isError ? 4200 : 2600);
  }

  // ---- Pile d'écrans (pour le bouton retour)
  const stack = [];
  function push(screen, onClose) {
    document.getElementById('screens').appendChild(screen);
    screen.classList.add('screen');
    requestAnimationFrame(() => screen.classList.add('in'));
    stack.push({ screen, onClose });
    return screen;
  }
  function pop() {
    const top = stack.pop();
    if (!top) return false;
    if (top.onClose) try { top.onClose(); } catch (e) { /* rien */ }
    top.screen.classList.remove('in');
    top.screen.classList.add('out');
    setTimeout(() => top.screen.remove(), 220);
    return true;
  }
  function popAll() { while (stack.length) pop(); }
  function depth() { return stack.length; }
  function topScreen() { return stack.length ? stack[stack.length - 1].screen : null; }

  /** En-tête d'écran avec bouton retour. */
  function header(title, sub, right) {
    return `<header class="bar"><button class="ib" data-back aria-label="Retour">${icon('back')}</button>
      <div class="bar-t"><span class="t1">${esc(title)}</span>${sub ? `<span class="t2">${esc(sub)}</span>` : ''}</div>${right || ''}</header>`;
  }

  // ---- Feuille du bas (menus)
  function sheet(html, opts) {
    opts = opts || {};
    const scrim = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`);
    document.body.appendChild(scrim);
    const close = () => {
      if (!scrim.parentNode) return;
      scrim.classList.add('out');
      setTimeout(() => scrim.remove(), 180);
      const i = sheets.indexOf(close);
      if (i >= 0) sheets.splice(i, 1);
      if (opts.onClose) opts.onClose();
    };
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    sheets.push(close);
    return { el: scrim.querySelector('.sheet'), close };
  }
  const sheets = [];
  function closeTopSheet() {
    const c = sheets[sheets.length - 1];
    if (!c) return false;
    c();
    return true;
  }

  /** Menu d'actions : items = [{icon,label,danger,run}] */
  function menu(title, items, subtitle) {
    const s = sheet(`${title ? `<div class="sh-title">${esc(title)}</div>` : ''}${subtitle ? `<div class="sh-sub">${esc(subtitle)}</div>` : ''}
      <div class="menu">${items.map((it, i) => `<button class="mi${it.danger ? ' danger' : ''}" data-i="${i}">${icon(it.icon || 'chevron')}<span>${esc(it.label)}</span></button>`).join('')}</div>`);
    s.el.querySelectorAll('.mi').forEach((b) => b.addEventListener('click', () => {
      const it = items[+b.dataset.i];
      s.close();
      setTimeout(() => it.run && it.run(), 60);
    }));
    return s;
  }

  function ask(title, value, okLabel, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const s = sheet(`<div class="sh-title">${esc(title)}</div>${opts.hint ? `<div class="sh-sub">${esc(opts.hint)}</div>` : ''}
        <${opts.multiline ? 'textarea rows="4"' : 'input'} class="field" ${opts.type ? `type="${opts.type}"` : ''} aria-label="${esc(title)}" placeholder="${esc(opts.placeholder || '')}">${opts.multiline ? esc(value || '') + '</textarea>' : ''}
        <div class="err-msg" hidden></div>
        <div class="row2"><button class="btn sec" data-c>Annuler</button><button class="btn" data-ok>${esc(okLabel || 'Valider')}</button></div>`,
        { onClose: () => { if (!done) resolve(null); } });
      const inp = s.el.querySelector('.field');
      if (!opts.multiline) inp.value = value || '';
      const err = s.el.querySelector('.err-msg');
      setTimeout(() => { inp.focus(); if (inp.select && !opts.multiline) inp.select(); }, 120);
      inp.addEventListener('input', () => { err.hidden = true; });
      const ok = () => {
        const v = inp.value.trim();
        if (!v && !opts.allowEmpty) { err.textContent = opts.emptyMsg || 'Écris quelque chose d’abord'; err.hidden = false; return; }
        done = true;
        s.close();
        resolve(v);
      };
      s.el.querySelector('[data-ok]').addEventListener('click', ok);
      s.el.querySelector('[data-c]').addEventListener('click', () => s.close());
      if (!opts.multiline) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
  }

  function confirm(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const s = sheet(`<div class="sh-title">${esc(title)}</div>${text ? `<div class="sh-sub">${esc(text)}</div>` : ''}
        <div class="row2"><button class="btn sec" data-c>Annuler</button><button class="btn${danger ? ' danger' : ''}" data-ok>${esc(okLabel || 'Continuer')}</button></div>`,
        { onClose: () => { if (!done) resolve(false); } });
      s.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; s.close(); resolve(true); });
      s.el.querySelector('[data-c]').addEventListener('click', () => s.close());
    });
  }

  // ---- Progression des opérations longues
  let busyEl = null, busyCancel = null;
  function busy(label, onCancel) {
    if (!busyEl) {
      busyEl = el(`<div class="busy"><div class="busy-card"><div class="spin"></div><div class="busy-l"></div>
        <div class="bar-p" hidden><div></div></div><button class="btn sec busy-c" hidden>Annuler</button></div></div>`);
      document.body.appendChild(busyEl);
      busyEl.querySelector('.busy-c').addEventListener('click', () => busyCancel && busyCancel());
    }
    busyEl.querySelector('.busy-l').textContent = label || 'Un instant…';
    busyEl.querySelector('.bar-p').hidden = true;
    busyCancel = onCancel || null;
    busyEl.querySelector('.busy-c').hidden = !onCancel;
    busyEl.classList.add('show');
  }
  function progress(pct, label) {
    if (!busyEl) busy(label);
    const b = busyEl.querySelector('.bar-p');
    b.hidden = false;
    b.firstElementChild.style.width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
    if (label) busyEl.querySelector('.busy-l').textContent = label;
  }
  function idle() { if (busyEl) busyEl.classList.remove('show'); busyCancel = null; }
  const isBusy = () => !!(busyEl && busyEl.classList.contains('show'));

  // ---- Chargement à la demande des grosses bibliothèques
  const loaded = {};
  function lib(name) {
    if (loaded[name]) return loaded[name];
    loaded[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/' + name;
      s.onload = resolve;
      s.onerror = () => { delete loaded[name]; reject(new Error('Bibliothèque manquante : ' + name)); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  function longPress(node, cb) {
    let t = null, moved = false;
    node.addEventListener('pointerdown', (e) => {
      moved = false;
      const x = e.clientX, y = e.clientY;
      t = setTimeout(() => { t = null; if (!moved) { node.dataset.lp = '1'; cb(e); } }, 480);
      const mv = (ev) => { if (Math.abs(ev.clientX - x) > 8 || Math.abs(ev.clientY - y) > 8) { moved = true; clearTimeout(t); } };
      node.addEventListener('pointermove', mv, { once: false });
      const up = () => { clearTimeout(t); node.removeEventListener('pointermove', mv); };
      node.addEventListener('pointerup', up, { once: true });
      node.addEventListener('pointercancel', up, { once: true });
    });
    node.addEventListener('click', (e) => { if (node.dataset.lp) { delete node.dataset.lp; e.stopPropagation(); e.preventDefault(); } }, true);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.UI = { icon, BIRD, esc, el, size, when, ext, base, badge, kind, toast, push, pop, popAll, depth, topScreen, header, sheet, closeTopSheet, menu, ask, confirm, busy, progress, idle, isBusy, lib, tick, longPress };
})();
