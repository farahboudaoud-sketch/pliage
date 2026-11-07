/* Pliage — opérations PDF : fusion, découpe, pages, images, compression, lecture du texte. */
(function () {
  const { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray, PDFRef, degrees } = PDFLib;
  const deref = (v, ctx) => (v instanceof PDFRef && ctx ? ctx.lookup(v) : v);
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  const passwords = new Map(); // mot de passe déjà saisi pour un document (pdf.js)

  async function loadLib(bytes) {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (e) {
      if (/encrypt/i.test(e.message || '')) {
        throw new Error('Ce PDF est protégé par un mot de passe. Retire la protection avant de le modifier.');
      }
      throw new Error('Ce fichier PDF est illisible ou abîmé');
    }
  }

  /** Ouvre un PDF avec pdf.js (affichage, texte). Demande le mot de passe si besoin. */
  async function loadJs(bytes, key) {
    let password = key ? passwords.get(key) : undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), password, isEvalSupported: false, disableFontFace: false });
        const doc = await task.promise;
        if (key && password) passwords.set(key, password);
        return doc;
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          password = await UI.ask(attempt === 0 ? 'Ce PDF est protégé' : 'Mot de passe incorrect', '', 'Ouvrir', { type: 'password', hint: 'Indique son mot de passe pour l’ouvrir.', emptyMsg: 'Indique le mot de passe' });
          if (password == null) throw new Error('Ouverture annulée');
          continue;
        }
        throw new Error('Ce fichier PDF est illisible ou abîmé');
      }
    }
    throw new Error('Mot de passe incorrect');
  }

  /** "1-3, 5, 8-10" → [[0,1,2],[4],[7,8,9]] (indices à partir de 0). */
  function parseRanges(str, n) {
    const groups = [];
    const parts = String(str || '').replace(/;/g, ',').split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error('Indique des pages, par exemple 1-3, 5');
    for (const p of parts) {
      const m = p.match(/^(\d+)\s*(?:[-–à]\s*(\d+|fin|n))?$/i);
      if (!m) throw new Error('Plage incorrecte : « ' + p + ' »');
      const a = parseInt(m[1], 10);
      const b = m[2] == null ? a : /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : n;
      if (a < 1 || b < 1 || a > n || b > n) throw new Error('Le document a ' + n + ' pages : « ' + p + ' » dépasse');
      const g = [];
      if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1);
      else for (let i = a; i >= b; i--) g.push(i - 1);
      groups.push(g);
    }
    return groups;
  }

  async function count(bytes) {
    const d = await loadLib(bytes);
    return d.getPageCount();
  }

  async function subset(src, indices) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    return out;
  }

  const save = (doc) => doc.save({ useObjectStreams: true });

  // ---------------------------------------------------------------- Fusion

  /** items : [{bytes, kind:'pdf'|'image', mime}] */
  async function merge(items, onStep) {
    const out = await PDFDocument.create();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (onStep) onStep(i, items.length);
      if (it.kind === 'pdf') {
        const src = await loadLib(it.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else {
        await addImagePage(out, it.bytes, it.mime, { size: 'fit', margin: 0 });
      }
      await UI.tick();
    }
    return save(out);
  }

  // ---------------------------------------------------------------- Découpe et pages

  async function split(bytes, groups) {
    const src = await loadLib(bytes);
    const res = [];
    for (const g of groups) {
      res.push(await save(await subset(src, g)));
      await UI.tick();
    }
    return res;
  }

  /** Découpe en fichiers d'au plus maxBytes octets (approximatif). */
  async function splitBySize(bytes, maxBytes) {
    const src = await loadLib(bytes);
    const n = src.getPageCount();
    const groups = [];
    let cur = [];
    for (let i = 0; i < n; i++) {
      const trial = cur.concat([i]);
      const size = (await save(await subset(src, trial))).length;
      if (size > maxBytes && cur.length) {
        groups.push(cur);
        cur = [i];
      } else {
        cur = trial;
      }
      await UI.tick();
    }
    if (cur.length) groups.push(cur);
    return split(bytes, groups);
  }

  async function extract(bytes, indices) {
    const src = await loadLib(bytes);
    return save(await subset(src, indices));
  }

  async function removePages(bytes, indices) {
    const src = await loadLib(bytes);
    const n = src.getPageCount();
    const keep = [];
    for (let i = 0; i < n; i++) if (!indices.includes(i)) keep.push(i);
    if (!keep.length) throw new Error('Il faut garder au moins une page');
    return save(await subset(src, keep));
  }

  async function rotate(bytes, indices, angle) {
    const doc = await loadLib(bytes);
    const pages = doc.getPages();
    indices.forEach((i) => {
      const p = pages[i];
      p.setRotation(degrees(((p.getRotation().angle + angle) % 360 + 360) % 360));
    });
    return save(doc);
  }

  /** order : [{src:index|null (page blanche), rot:0..270}] */
  async function rebuild(bytes, order) {
    const src = await loadLib(bytes);
    const out = await PDFDocument.create();
    const used = order.filter((o) => o.src != null).map((o) => o.src);
    const copied = await out.copyPages(src, used);
    let k = 0;
    let lastSize = [595.28, 841.89];
    for (const o of order) {
      if (o.src == null) {
        out.addPage(lastSize);
        continue;
      }
      const p = copied[k++];
      lastSize = [p.getWidth(), p.getHeight()];
      if (o.rot) p.setRotation(degrees(((p.getRotation().angle + o.rot) % 360 + 360) % 360));
      out.addPage(p);
    }
    return save(out);
  }

  // ---------------------------------------------------------------- Images ↔ PDF

  const PAGE = { a4: [595.28, 841.89], letter: [612, 792] };

  async function embedImage(doc, bytes, mime) {
    const u8 = new Uint8Array(bytes);
    const isPng = u8[0] === 0x89 && u8[1] === 0x50;
    const isJpg = u8[0] === 0xff && u8[1] === 0xd8;
    if (isJpg) return doc.embedJpg(u8);
    if (isPng) return doc.embedPng(u8);
    // Autre format (WebP, GIF, BMP…) : passage par un canvas
    const bmp = await createImageBitmap(new Blob([u8], { type: mime || 'image/*' }));
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(bmp, 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    return doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  }

  /** opts : size 'a4'|'letter'|'fit', orientation 'auto'|'portrait'|'landscape', margin (pt) */
  async function addImagePage(doc, bytes, mime, opts) {
    const img = await embedImage(doc, bytes, mime);
    let w = img.width * 0.75, h = img.height * 0.75; // px → pt (96 ppp)
    const margin = opts.margin || 0;
    if (opts.size === 'fit') {
      const cap = 1440;
      if (Math.max(w, h) > cap) { const k = cap / Math.max(w, h); w *= k; h *= k; }
      const page = doc.addPage([w + margin * 2, h + margin * 2]);
      page.drawImage(img, { x: margin, y: margin, width: w, height: h });
      return;
    }
    let [pw, ph] = PAGE[opts.size] || PAGE.a4;
    const land = opts.orientation === 'landscape' || (opts.orientation === 'auto' && img.width > img.height);
    if (land) [pw, ph] = [ph, pw];
    const page = doc.addPage([pw, ph]);
    const aw = pw - margin * 2, ah = ph - margin * 2;
    const k = Math.min(aw / w, ah / h);
    const dw = w * k, dh = h * k;
    page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
  }

  async function imagesToPdf(images, opts, onStep) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < images.length; i++) {
      if (onStep) onStep(i, images.length);
      await addImagePage(doc, images[i].bytes, images[i].mime, opts);
      await UI.tick();
    }
    return save(doc);
  }

  async function renderPage(doc, index, scale, bg) {
    const page = await doc.getPage(index + 1);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(vp.width));
    cv.height = Math.max(1, Math.floor(vp.height));
    const g = cv.getContext('2d');
    g.fillStyle = bg || '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    page.cleanup();
    return cv;
  }

  /** Renvoie [{blob, page}] — format 'jpeg'|'png'|'webp' */
  async function toImages(doc, pages, dpi, format, quality, onStep) {
    const out = [];
    const type = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    let scale = dpi / 72;
    for (let k = 0; k < pages.length; k++) {
      if (onStep) onStep(k, pages.length);
      const page = await doc.getPage(pages[k] + 1);
      const vp0 = page.getViewport({ scale: 1 });
      // Garde-fou mémoire : 40 millions de pixels au plus
      const s = Math.min(scale, Math.sqrt(40e6 / (vp0.width * vp0.height)));
      const cv = await renderPage(doc, pages[k], s, format === 'png' ? '#ffffff' : '#ffffff');
      const blob = await new Promise((r) => cv.toBlob(r, type, (quality || 90) / 100));
      cv.width = cv.height = 0;
      out.push({ blob, page: pages[k] });
    }
    return out;
  }

  // ---------------------------------------------------------------- Compression

  const LEVELS = [
    { maxSide: 2200, q: 0.82, min: 120000 },
    { maxSide: 1600, q: 0.68, min: 60000 },
    { maxSide: 1100, q: 0.5, min: 30000 },
  ];

  function nameOf(dict, key, context) {
    let v = deref(dict.get(PDFName.of(key)), context);
    if (!v) return null;
    if (v instanceof PDFArray) {
      if (v.size() !== 1) return 'multiple';
      v = deref(v.get(0), context);
    }
    return v ? v.toString() : null;
  }
  function num(dict, key, context) {
    const v = deref(dict.get(PDFName.of(key)), context);
    return v instanceof PDFNumber ? v.asNumber() : null;
  }

  /** Nombre de composantes de couleur, ou 0 si non géré. */
  function components(dict, context) {
    const cs = deref(dict.get(PDFName.of('ColorSpace')), context);
    if (!cs) return 0;
    if (cs instanceof PDFArray) {
      const kind = String(deref(cs.get(0), context));
      if (kind === '/ICCBased') {
        const s = deref(cs.get(1), context);
        const n = s && s.dict ? num(s.dict, 'N', context) : null;
        return n === 3 || n === 1 ? n : 0;
      }
      if (kind === '/CalRGB') return 3;
      if (kind === '/CalGray') return 1;
      return 0; // Indexed, Separation, DeviceN… : on ne touche pas
    }
    const s = cs.toString();
    if (s === '/DeviceRGB') return 3;
    if (s === '/DeviceGray') return 1;
    return 0;
  }

  function unpredict(data, width, colors, bpc, predictor) {
    if (!predictor || predictor < 10) return data;
    const bpp = Math.max(1, (colors * bpc) >> 3);
    const rowLen = Math.ceil((width * colors * bpc) / 8);
    const rows = Math.floor(data.length / (rowLen + 1));
    const out = new Uint8Array(rows * rowLen);
    let prev = new Uint8Array(rowLen);
    for (let r = 0; r < rows; r++) {
      const f = data[r * (rowLen + 1)];
      const line = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
      const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
      for (let i = 0; i < rowLen; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let x = line[i];
        if (f === 1) x += a;
        else if (f === 2) x += b;
        else if (f === 3) x += (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[i] = x & 255;
      }
      prev = cur;
    }
    return out;
  }

  async function jpegFromCanvasSource(src, w, h, maxSide, q) {
    let k = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, tw, th);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, tw, th);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
    cv.width = cv.height = 0;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: tw, h: th };
  }

  async function compress(bytes, level, stripMeta, onStep) {
    await UI.lib('pako.min.js');
    const doc = await loadLib(bytes);
    const ctx = doc.context;
    const L = LEVELS[Math.max(0, Math.min(2, level))];
    const objs = ctx.enumerateIndirectObjects();
    const images = objs.filter(([, o]) => o instanceof PDFRawStream && nameOf(o.dict, 'Subtype') === '/Image');
    let done = 0, changed = 0;
    for (const [ref, obj] of images) {
      done++;
      if (onStep) onStep(done, images.length);
      try {
        const d = obj.dict;
        if (d.get(PDFName.of('ImageMask')) || d.get(PDFName.of('Decode')) || d.get(PDFName.of('Mask'))) continue;
        const raw = obj.contents;
        if (raw.length < L.min) continue;
        const filter = nameOf(d, 'Filter', ctx);
        const w = num(d, 'Width', ctx), h = num(d, 'Height', ctx);
        const ncomp = components(d, ctx);
        if (!w || !h || !ncomp) continue;
        let result = null;
        if (filter === '/DCTDecode') {
          if (ncomp !== 3 && ncomp !== 1) continue;
          const bmp = await createImageBitmap(new Blob([raw], { type: 'image/jpeg' }));
          if (Math.max(w, h) <= L.maxSide && L.q >= 0.8) { bmp.close && bmp.close(); continue; }
          result = await jpegFromCanvasSource(bmp, bmp.width, bmp.height, L.maxSide, L.q);
          bmp.close && bmp.close();
        } else if (filter === '/FlateDecode') {
          const bpc = num(d, 'BitsPerComponent', ctx);
          if (bpc !== 8) continue;
          let parms = deref(d.get(PDFName.of('DecodeParms')), ctx);
          if (parms instanceof PDFArray) parms = deref(parms.get(0), ctx);
          const predictor = parms instanceof PDFDict ? num(parms, 'Predictor', ctx) : null;
          let data = pako.inflate(raw);
          data = unpredict(data, w, ncomp, 8, predictor);
          if (data.length < w * h * ncomp) continue;
          const rgba = new Uint8ClampedArray(w * h * 4);
          for (let i = 0, j = 0; i < w * h; i++, j += ncomp) {
            if (ncomp === 3) { rgba[i * 4] = data[j]; rgba[i * 4 + 1] = data[j + 1]; rgba[i * 4 + 2] = data[j + 2]; }
            else { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = data[j]; }
            rgba[i * 4 + 3] = 255;
          }
          const bmp = await createImageBitmap(new ImageData(rgba, w, h));
          result = await jpegFromCanvasSource(bmp, w, h, L.maxSide, L.q);
          bmp.close && bmp.close();
        } else {
          continue;
        }
        if (!result || result.bytes.length >= raw.length * 0.92) continue;
        const nd = d.clone(ctx);
        nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        nd.delete(PDFName.of('DecodeParms'));
        nd.set(PDFName.of('Width'), PDFNumber.of(result.w));
        nd.set(PDFName.of('Height'), PDFNumber.of(result.h));
        nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        nd.set(PDFName.of('Length'), PDFNumber.of(result.bytes.length));
        ctx.assign(ref, PDFRawStream.of(nd, result.bytes));
        changed++;
      } catch (e) {
        console.warn('image ignorée', e);
      }
      if (done % 3 === 0) await UI.tick();
    }
    if (stripMeta) {
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer('Pliage');
      doc.catalog.delete(PDFName.of('Metadata'));
      doc.catalog.delete(PDFName.of('PieceInfo'));
    }
    const out = await doc.save({ useObjectStreams: true });
    return { bytes: out.length < bytes.byteLength ? out : new Uint8Array(bytes), changed, smaller: out.length < bytes.byteLength };
  }

  // ---------------------------------------------------------------- Lecture du texte (conversions)

  /**
   * Lit le texte d'une page et le regroupe en lignes puis en blocs.
   * Renvoie { width, height, lines:[{y,x,size,bold,text,items}], blocks:[{type:'h1'|'h2'|'p', text}] }
   */
  async function pageText(doc, index) {
    const page = await doc.getPage(index + 1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const styles = tc.styles || {};
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) { if (it.str === ' ' && items.length) items[items.length - 1].tail = true; continue; }
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(t[2], t[3]) || 10;
      const st = styles[it.fontName] || {};
      const bold = /bold|black|heavy|semibold/i.test((st.fontFamily || '') + ' ' + (it.fontName || ''));
      items.push({ str: it.str, x: t[4], y: t[5], w: it.width * (vp.scale || 1), size, bold, font: st.fontFamily || '', fontName: it.fontName });
    }
    // Regroupement en lignes (même hauteur)
    items.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.size, b.size) * 0.4 ? a.x - b.x : a.y - b.y));
    const lines = [];
    for (const it of items) {
      const line = lines.length ? lines[lines.length - 1] : null;
      if (line && Math.abs(line.y - it.y) < Math.min(line.size, it.size) * 0.5) {
        const last = line.items[line.items.length - 1];
        const gap = it.x - (last.x + last.w);
        line.text += (gap > it.size * 0.18 || last.tail) && !/\s$/.test(line.text) ? ' ' + it.str : it.str;
        line.items.push(it);
        line.size = Math.max(line.size, it.size);
        line.bold = line.bold && it.bold;
        line.x2 = it.x + it.w;
      } else {
        lines.push({ y: it.y, x: it.x, x2: it.x + it.w, size: it.size, bold: it.bold, text: it.str, items: [it] });
      }
    }
    page.cleanup();
    return { width: vp.width, height: vp.height, lines, chars: items.reduce((s, i) => s + i.str.length, 0) };
  }

  /** Taille de texte la plus fréquente du document (corps du texte). */
  function bodySize(pages) {
    const hist = {};
    pages.forEach((p) => p.lines.forEach((l) => { const k = Math.round(l.size); hist[k] = (hist[k] || 0) + l.text.length; }));
    let best = 11, n = 0;
    for (const [k, v] of Object.entries(hist)) if (v > n) { n = v; best = +k; }
    return best;
  }

  /** Lignes → paragraphes et titres. */
  function blocks(pageInfo, body) {
    const out = [];
    let cur = null;
    const lines = pageInfo.lines.filter((l) => !(/^\s*\d+\s*$/.test(l.text) && (l.y > pageInfo.height - 50 || l.y < 50))); // numéros de page
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const prev = lines[i - 1];
      const isHead = l.size >= body * 1.3 || (l.bold && l.text.length < 90 && l.size >= body * 1.05 && (!prev || l.y - prev.y > body * 1.8));
      const type = isHead ? (l.size >= body * 1.7 ? 'h1' : 'h2') : 'p';
      const gap = prev ? l.y - prev.y : 0;
      const bullet = /^\s*([•●▪◦\-–*]|\d+[.)])\s+/.test(l.text);
      const newBlock = !cur || cur.type !== type || type !== 'p' || gap > Math.max(l.size, prev.size) * 1.55 || gap < 0 || bullet
        || (prev && /[.!?:»]$/.test(prev.text.trim()) && prev.x2 < pageInfo.width * 0.7);
      if (newBlock) {
        cur = { type, text: l.text.trim(), size: l.size, bold: l.bold, bullet };
        out.push(cur);
      } else {
        const t = cur.text;
        cur.text = /-$/.test(t) && /^[a-zà-ÿ]/.test(l.text.trim()) ? t.slice(0, -1) + l.text.trim() : t + ' ' + l.text.trim();
      }
    }
    return out;
  }

  window.Pdf = {
    loadLib, loadJs, parseRanges, count, merge, split, splitBySize, extract, removePages, rotate, rebuild,
    imagesToPdf, renderPage, toImages, compress, pageText, bodySize, blocks, PAGE,
  };
})();
