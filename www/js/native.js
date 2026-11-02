/* Pliage — pont vers les fonctions Android, avec une version de secours pour tester dans un navigateur. */
(function () {
  const C = window.Capacitor;
  const isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
  const P = isNative && C.Plugins ? C.Plugins.Pliage : null;
  const App = isNative && C.Plugins ? C.Plugins.App : null;
  // Version Windows (Electron) : fonctions du PC exposées par preload.js
  const D = !isNative && window.PliageDesktop ? window.PliageDesktop : null;

  // ---- Version navigateur : les fichiers vivent en mémoire
  const mem = new Map();
  let memId = 0;
  const FILES = isNative ? null : '/mem/files';
  const CACHE = isNative ? null : '/mem/cache';

  function pickerBrowser(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.multiple = !!multiple;
      input.style.display = 'none';
      input.onchange = async () => {
        const out = [];
        for (const f of Array.from(input.files || [])) {
          const path = CACHE + '/in/' + (++memId) + '/' + f.name;
          mem.set(path, f);
          out.push({ path, name: f.name, size: f.size, mime: f.type || mimeOf(f.name) });
        }
        input.remove();
        resolve(out);
      };
      document.body.appendChild(input);
      input.click();
    });
  }

  function mimeOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ({
      pdf: 'application/pdf', epub: 'application/epub+zip', mobi: 'application/x-mobipocket-ebook', azw3: 'application/vnd.amazon.ebook',
      fb2: 'application/x-fictionbook+xml', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
      zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      heic: 'image/heic', heif: 'image/heic', bmp: 'image/bmp', mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
      webm: 'video/webm', '3gp': 'video/3gpp', txt: 'text/plain', html: 'text/html', htm: 'text/html', json: 'application/json',
    })[ext] || 'application/octet-stream';
  }

  function b64(bytes) {
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(s);
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  let dirs = null;
  async function blobOf(path) {
    if (D) return new Blob([await D.read(path)], { type: mimeOf(path) });
    return mem.get(path);
  }

  const Native = {
    isNative,
    mimeOf,

    async dirs() {
      if (dirs) return dirs;
      dirs = P ? await P.paths() : D ? await D.dirs() : { files: FILES, cache: CACHE };
      return dirs;
    },

    /** Ouvre le gestionnaire de fichiers. accept : liste de types MIME. */
    async pick(mimes, multiple) {
      if (P) {
        const r = await P.pickFiles({ mimes: mimes || [], multiple: !!multiple });
        return r.files || [];
      }
      if (D) return D.pick(mimes || [], !!multiple);
      const accept = (mimes || []).map((m) => (m === 'application/pdf' ? '.pdf,application/pdf' : m)).join(',');
      return pickerBrowser(accept, multiple);
    },

    /** Lit un fichier et renvoie un ArrayBuffer. */
    async read(path) {
      if (D) return D.read(path);
      if (!P) {
        const b = mem.get(path);
        if (!b) throw new Error('Fichier introuvable');
        return b.arrayBuffer();
      }
      const res = await fetch(C.convertFileSrc('file://' + path));
      if (!res.ok) throw new Error('Fichier introuvable');
      return res.arrayBuffer();
    },

    /** URL utilisable dans <img>, <video>… */
    url(path) {
      if (D) return D.url(path);
      if (!P) {
        const b = mem.get(path);
        return b ? URL.createObjectURL(b) : '';
      }
      return C.convertFileSrc('file://' + path);
    },

    /** Écrit des octets (Uint8Array, ArrayBuffer ou Blob) dans un fichier de l'appli. */
    async write(path, data) {
      if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
      else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
      if (D) return D.write(path, data);
      if (!P) {
        mem.set(path, new Blob([data], { type: mimeOf(path) }));
        return { path, size: data.length };
      }
      const CH = 1536 * 1024;
      let r = null;
      if (data.length === 0) return P.writeChunk({ path, data: '', append: false });
      for (let i = 0; i < data.length; i += CH) {
        r = await P.writeChunk({ path, data: b64(data.subarray(i, i + CH)), append: i > 0 });
      }
      return r;
    },

    async copy(from, to) {
      if (D) return D.copy(from, to);
      if (!P) {
        const b = mem.get(from);
        if (!b) throw new Error('Fichier introuvable');
        mem.set(to, b);
        return { path: to, size: b.size };
      }
      return P.copyFile({ from, to });
    },

    async remove(path) {
      if (D) return D.remove(path).catch(() => {});
      if (!P) { for (const k of [...mem.keys()]) if (k === path || k.startsWith(path + '/')) mem.delete(k); return; }
      return P.deleteFile({ path }).catch(() => {});
    },

    async exists(path) {
      if (D) return D.exists(path);
      if (!P) return mem.has(path);
      const r = await P.fileInfo({ path });
      return r.exists;
    },

    async clearCache() { if (D) return D.clearCache(); if (P) return P.clearCache(); },

    async saveToDownloads(path, name) {
      if (D) return D.saveToDownloads(path, name);
      if (!P) {
        download(mem.get(path), name);
        return { shown: 'Téléchargements/' + name };
      }
      return P.saveToDownloads({ path, name, mime: mimeOf(name) });
    },

    async saveAs(path, name) {
      if (D) return D.saveAs(path, name);
      if (!P) { download(mem.get(path), name); return { saved: true, name }; }
      return P.saveAs({ path, name, mime: mimeOf(name) });
    },

    async share(paths) {
      if (D) return D.share(paths);
      if (!P) {
        if (navigator.share && navigator.canShare) {
          const files = paths.map((p) => new File([mem.get(p)], p.split('/').pop()));
          if (navigator.canShare({ files })) return navigator.share({ files });
        }
        for (const p of paths) download(mem.get(p), p.split('/').pop());
        return;
      }
      return P.share({ paths });
    },

    async openWith(path) {
      if (D) return D.openWith(path);
      if (!P) { window.open(Native.url(path), '_blank'); return; }
      return P.openWith({ path });
    },

    /** Réencode une image (jpeg/png/webp), avec redimensionnement et EXIF. */
    async processImage(o) {
      if (P) return P.processImage(o);
      const blob = await blobOf(o.path);
      const bmp = await createImageBitmap(blob);
      let k = o.scalePct && o.scalePct < 100 ? o.scalePct / 100 : 1;
      if (o.maxSide && Math.max(bmp.width, bmp.height) * k > o.maxSide) k = o.maxSide / Math.max(bmp.width, bmp.height);
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      if (o.format !== 'png') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
      g.drawImage(bmp, 0, 0, w, h);
      const type = o.format === 'png' ? 'image/png' : o.format === 'webp' ? 'image/webp' : 'image/jpeg';
      const out = await new Promise((r) => cv.toBlob(r, type, (o.quality || 80) / 100));
      if (D) { await D.write(o.out, new Uint8Array(await out.arrayBuffer())); return { path: o.out, size: out.size, width: w, height: h }; }
      mem.set(o.out, out);
      return { path: o.out, size: out.size, width: w, height: h };
    },

    async videoInfo(path) {
      if (P) return P.videoInfo({ path });
      return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration * 1000, bitrate: 0, rotation: 0 });
        v.onerror = () => resolve({ width: 0, height: 0, duration: 0, bitrate: 0 });
        v.src = Native.url(path);
      });
    },

    async compressVideo(o, onProgress) {
      if (D) return D.compressVideo(o, onProgress);
      if (!P) throw new Error('La compression vidéo fonctionne uniquement sur le téléphone');
      const h = await P.addListener('videoProgress', (d) => onProgress && onProgress(d.progress));
      try { return await P.compressVideo(o); } finally { h.remove(); }
    },

    cancelVideo() { if (D) D.cancelVideo(); if (P) P.cancelVideo(); },

    async zip(paths, names, out, level, onProgress) {
      if (D) return D.zip(paths, names || null, out, level == null ? 6 : level, onProgress);
      if (!P) {
        const z = new JSZip();
        paths.forEach((p, i) => z.file(names ? names[i] : p.split('/').pop(), mem.get(p)));
        const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: level || 6 } });
        mem.set(out, blob);
        return { path: out, size: blob.size };
      }
      const h = await P.addListener('zipProgress', (d) => onProgress && onProgress(d.progress));
      try { return await P.zip({ paths, names: names || null, out, level: level == null ? 6 : level }); } finally { h.remove(); }
    },

    async unzip(path, outDir) {
      if (D) return D.unzip(path, outDir);
      if (!P) {
        const z = await JSZip.loadAsync(await mem.get(path).arrayBuffer());
        const files = [];
        for (const [name, e] of Object.entries(z.files)) {
          if (e.dir) continue;
          const b = await e.async('blob');
          const p = outDir + '/' + name;
          mem.set(p, b);
          files.push({ path: p, name, size: b.size });
        }
        return { files };
      }
      return P.unzip({ path, outDir });
    },

    async htmlToPdf(html, out, pageSize, landscape) {
      if (D) return D.htmlToPdf(html, out, pageSize || 'A4', !!landscape);
      if (!P) throw new Error('Cette conversion hors ligne fonctionne uniquement sur le téléphone');
      return P.htmlToPdf({ html, out, pageSize: pageSize || 'A4', landscape: !!landscape });
    },

    async setSecret(key, value) { if (D) return D.setSecret(key, value); if (P) return P.setSecret({ key, value }); localStorage.setItem('secret.' + key, value); },
    async hasSecret(key) {
      if (D) return D.hasSecret(key);
      if (P) return P.hasSecret({ key });
      const v = localStorage.getItem('secret.' + key) || '';
      return { has: !!v, tail: v.slice(-4) };
    },
    async testOnline(service) {
      if (D) return D.testOnline(service);
      if (!P) throw new Error('Test disponible uniquement sur le téléphone');
      return P.testOnline({ service });
    },
    async onlineConvert(o, onStep) {
      if (D) return D.onlineConvert(o, onStep);
      if (!P) throw new Error('Conversion en ligne disponible uniquement sur le téléphone');
      const h = await P.addListener('onlineProgress', (d) => onStep && onStep(d.label));
      try { return await P.onlineConvert(o); } finally { h.remove(); }
    },

    async backup(json, out) {
      if (D) return D.backup(json, out);
      if (!P) { const blob = new Blob([json]); mem.set(out, blob); return { path: out, size: blob.size }; }
      return P.backup({ json, out });
    },
    async restore(path) {
      if (D) return D.restore(path);
      if (!P) return { json: await mem.get(path).text(), dir: FILES + '/essentiels' };
      return P.restore({ path });
    },

    updateWidget(name, path) { if (P) P.updateWidget({ name: name || '', path: path || '' }).catch(() => {}); },

    onIncoming(cb) { if (D) D.onIncoming(cb); if (P) P.addListener('incoming', cb); },
    onShortcut(cb) { if (P) P.addListener('shortcut', cb); },
    onBack(cb) { if (App) App.addListener('backButton', cb); },
    exitApp() { if (D) D.quit(); if (App) App.exitApp(); },
    isDesktop: !!D,
    async launchInfo() { if (P) return P.launchInfo(); return { file: false }; },
    async importDropped(fileList) {
      if (!D) return [];
      return D.importPaths(Array.from(fileList).map((f) => D.pathOf(f)).filter(Boolean));
    },
    showDownloads() { if (D) D.showDownloads(); },
    async version() { if (D) return D.version(); return null; },
  };

  window.Native = Native;
})();
