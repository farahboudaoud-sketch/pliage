/* Pliage — conversions hors ligne (Word, Excel, PowerPoint, EPUB, FB2) et en ligne. */
(function () {
  const xml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  async function readPdfText(bytes, key, onStep) {
    const doc = await Pdf.loadJs(bytes, key);
    const pages = [];
    for (let i = 0; i < doc.numPages; i++) {
      if (onStep) onStep(i, doc.numPages);
      pages.push(await Pdf.pageText(doc, i));
      if (i % 4 === 0) await UI.tick();
    }
    return { doc, pages, body: Pdf.bodySize(pages) };
  }

  async function canvasJpeg(cv, q) {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q || 0.85));
    return new Uint8Array(await blob.arrayBuffer());
  }

  function htmlPage(body, opts) {
    opts = opts || {};
    const font = opts.font === 'serif' ? 'Georgia, "Noto Serif", serif' : 'Roboto, "Noto Sans", Arial, sans-serif';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${opts.landscape ? 'A4 landscape' : 'A4'}; margin: ${opts.margin || '18mm 16mm'}; }
      html, body { margin: 0; padding: 0; }
      body { font-family: ${font}; font-size: ${opts.fontSize || 11}pt; line-height: 1.45; color: #111; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; font-size: 9pt; margin: 0 0 12pt; }
      td, th { border: 0.6pt solid #999; padding: 2pt 4pt; vertical-align: top; }
      h1, h2, h3 { line-height: 1.2; page-break-after: avoid; }
      .chap { page-break-before: always; }
      .chap:first-child { page-break-before: auto; }
      ${opts.css || ''}
    </style></head><body>${body}</body></html>`;
  }

  // ---------------------------------------------------------------- PDF → Word

  async function pdfToDocx(bytes, opts, onStep) {
    await UI.lib('docx.umd.js');
    const D = window.docx;
    const { pages, body, doc } = await readPdfText(bytes, opts.key, (i, n) => onStep && onStep(i, n * 2, 'Lecture du texte…'));
    const children = [];
    for (let i = 0; i < pages.length; i++) {
      if (onStep) onStep(pages.length + i, pages.length * 2, 'Création du document…');
      const p = pages[i];
      let first = true;
      const pb = () => { const v = i > 0 && first; first = false; return v; };
      if (opts.images && p.chars < 40) {
        // Page scannée ou image : on la garde en image
        const cv = await Pdf.renderPage(doc, i, 1.6);
        const data = await canvasJpeg(cv, 0.82);
        const maxW = 600, k = maxW / cv.width;
        children.push(new D.Paragraph({ pageBreakBefore: pb(), children: [new D.ImageRun({ data, transformation: { width: Math.round(cv.width * k), height: Math.round(cv.height * k) } })] }));
        cv.width = cv.height = 0;
        continue;
      }
      for (const b of Pdf.blocks(p, body)) {
        const run = new D.TextRun({ text: b.text, bold: b.bold && b.type === 'p' ? true : undefined });
        if (b.type === 'h1') children.push(new D.Paragraph({ pageBreakBefore: pb(), heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun(b.text)] }));
        else if (b.type === 'h2') children.push(new D.Paragraph({ pageBreakBefore: pb(), heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun(b.text)] }));
        else if (b.bullet) children.push(new D.Paragraph({ pageBreakBefore: pb(), bullet: { level: 0 }, children: [new D.TextRun(b.text.replace(/^\s*([•●▪◦\-–*])\s+/, ''))] }));
        else children.push(new D.Paragraph({ pageBreakBefore: pb(), spacing: { after: 120 }, children: [run] }));
      }
      if (first && i > 0) children.push(new D.Paragraph({ pageBreakBefore: true, children: [] }));
      await UI.tick();
    }
    if (!children.length) children.push(new D.Paragraph({ children: [new D.TextRun('')] }));
    const d = new D.Document({
      creator: 'Pliage',
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      sections: [{ properties: {}, children }],
    });
    const blob = await D.Packer.toBlob(d);
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ---------------------------------------------------------------- Word → PDF

  async function docxToHtml(bytes) {
    await UI.lib('mammoth.browser.min.js');
    const r = await mammoth.convertToHtml({ arrayBuffer: bytes });
    return r.value;
  }

  // ---------------------------------------------------------------- PDF → Excel

  function toNumber(s) {
    const t = s.replace(/ /g, ' ').trim();
    if (!/^-?[\d  .]+(,\d+)?\s*%?$/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) return s;
    let n = t.replace(/[  ]/g, '');
    const pct = n.endsWith('%');
    if (pct) n = n.slice(0, -1);
    if (n.includes(',')) n = n.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '');
    const v = parseFloat(n);
    if (isNaN(v)) return s;
    return pct ? v / 100 : v;
  }

  async function pdfToXlsx(bytes, opts, onStep) {
    await UI.lib('xlsx.full.min.js');
    const { pages } = await readPdfText(bytes, opts.key, (i, n) => onStep && onStep(i, n, 'Lecture des tableaux…'));
    const wb = XLSX.utils.book_new();
    pages.forEach((p, pi) => {
      // Cellules : morceaux d'une ligne séparés par un grand espace
      const rows = p.lines.map((l) => {
        const cells = [];
        let cur = null;
        for (const it of l.items) {
          if (cur && it.x - cur.x2 < Math.max(it.size, 6) * 1.1) {
            cur.text += (it.x - cur.x2 > it.size * 0.18 ? ' ' : '') + it.str;
            cur.x2 = it.x + it.w;
          } else {
            cur = { x: it.x, x2: it.x + it.w, text: it.str };
            cells.push(cur);
          }
        }
        return cells;
      });
      const starts = rows.flat().map((c) => c.x).sort((a, b) => a - b);
      const anchors = [];
      for (const x of starts) if (!anchors.length || x - anchors[anchors.length - 1] > 14) anchors.push(x);
      const colOf = (x) => {
        let best = 0;
        for (let i = 0; i < anchors.length; i++) if (anchors[i] <= x + 7) best = i;
        return best;
      };
      const aoa = rows.map((cells) => {
        const r = [];
        cells.forEach((c) => {
          let k = colOf(c.x);
          while (r[k] != null) k++;
          r[k] = toNumber(c.text.trim());
        });
        for (let i = 0; i < r.length; i++) if (r[i] == null) r[i] = '';
        return r;
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [['']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Page ' + (pi + 1));
    });
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  }

  async function xlsxToHtml(bytes) {
    await UI.lib('xlsx.full.min.js');
    const wb = XLSX.read(bytes, { type: 'array' });
    let html = '';
    let wide = false;
    wb.SheetNames.forEach((name, i) => {
      const ws = wb.Sheets[name];
      if (!ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      if (range.e.c - range.s.c > 7) wide = true;
      const t = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
      const table = (t.match(/<table[\s\S]*<\/table>/i) || [''])[0];
      html += `<section class="${i ? 'chap' : ''}"><h3>${xml(name)}</h3>${table}</section>`;
    });
    return { html, wide };
  }

  // ---------------------------------------------------------------- PDF → PowerPoint

  async function pdfToPptx(bytes, opts, onStep) {
    await UI.lib('pptxgen.bundle.js');
    const doc = await Pdf.loadJs(bytes, opts.key);
    const pptx = new PptxGenJS();
    const p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
    pptx.defineLayout({ name: 'PDF', width: p1.width / 72, height: p1.height / 72 });
    pptx.layout = 'PDF';
    for (let i = 0; i < doc.numPages; i++) {
      if (onStep) onStep(i, doc.numPages, 'Création des diapositives…');
      const page = await doc.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const cv = await Pdf.renderPage(doc, i, Math.min(2.2, 2400 / Math.max(vp.width, vp.height)));
      const data = cv.toDataURL('image/jpeg', 0.86);
      cv.width = cv.height = 0;
      const slide = pptx.addSlide();
      const k = Math.min(p1.width / vp.width, p1.height / vp.height);
      const w = (vp.width * k) / 72, h = (vp.height * k) / 72;
      slide.addImage({ data, x: (p1.width / 72 - w) / 2, y: (p1.height / 72 - h) / 2, w, h });
      try {
        const t = await Pdf.pageText(doc, i);
        const notes = t.lines.map((l) => l.text).join('\n').slice(0, 5000);
        if (notes.trim()) slide.addNotes(notes);
      } catch (e) { /* rien */ }
      await UI.tick();
    }
    const out = await pptx.write({ outputType: 'uint8array' });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  // ---------------------------------------------------------------- EPUB : création

  async function buildEpub(book) {
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    z.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const id = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Store.uid());
    const lang = book.lang || 'fr';
    const css = 'body{font-family:serif;line-height:1.5;margin:0 4%;}h1,h2,h3{line-height:1.2;}p{margin:0 0 .6em;text-indent:0;}img{max-width:100%;}';
    z.file('OEBPS/style.css', css);
    const manifest = ['<item id="css" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'];
    const spine = [];
    if (book.cover) {
      z.file('OEBPS/images/cover.jpg', book.cover);
      manifest.push('<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
      z.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}"><head><title>${xml(book.title)}</title><style>body{margin:0;text-align:center}img{max-height:100%;max-width:100%}</style></head><body><img src="images/cover.jpg" alt="${xml(book.title)}"/></body></html>`);
      manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="cover"/>');
    }
    (book.images || []).forEach((im) => {
      z.file('OEBPS/images/' + im.name, im.bytes);
      manifest.push(`<item id="${im.id}" href="images/${im.name}" media-type="${im.mime}"/>`);
    });
    book.chapters.forEach((c, i) => {
      const f = `chap${String(i + 1).padStart(3, '0')}.xhtml`;
      z.file('OEBPS/' + f, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><title>${xml(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${c.html}</body></html>`);
      manifest.push(`<item id="c${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="c${i + 1}"/>`);
    });
    const navItems = book.chapters.map((c, i) => `<li><a href="chap${String(i + 1).padStart(3, '0')}.xhtml">${xml(c.title)}</a></li>`).join('');
    z.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}"><head><title>Sommaire</title></head><body><nav epub:type="toc" id="toc"><h1>Sommaire</h1><ol>${navItems}</ol></nav></body></html>`);
    const navPoints = book.chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(c.title)}</text></navLabel><content src="chap${String(i + 1).padStart(3, '0')}.xhtml"/></navPoint>`).join('');
    z.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${xml(book.title)}</text></docTitle><navMap>${navPoints}</navMap></ncx>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    z.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${xml(book.title)}</dc:title><dc:creator>${xml(book.author || 'Inconnu')}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${now}</meta>${book.cover ? '<meta name="cover" content="cover-img"/>' : ''}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`);
    return z.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
  }

  function chaptersFromBlocks(allBlocks, fallbackTitle) {
    const chapters = [];
    const hasH1 = allBlocks.some((b) => b.type === 'h1');
    const cut = hasH1 ? 'h1' : 'h2';
    let cur = null;
    for (const b of allBlocks) {
      if (b.type === cut || !cur) {
        cur = { title: b.type !== 'p' ? b.text.slice(0, 120) : (chapters.length ? 'Partie ' + (chapters.length + 1) : fallbackTitle), html: '' };
        chapters.push(cur);
        if (b.type !== 'p') { cur.html += `<h2>${xml(b.text)}</h2>`; continue; }
      }
      if (b.type === 'h1' || b.type === 'h2') cur.html += `<h3>${xml(b.text)}</h3>`;
      else cur.html += `<p>${xml(b.text)}</p>`;
    }
    // Évite les chapitres trop nombreux et minuscules
    if (chapters.length > 200) {
      const merged = [];
      chapters.forEach((c, i) => { if (i % 5 === 0) merged.push({ title: c.title, html: c.html }); else merged[merged.length - 1].html += c.html; });
      return merged;
    }
    return chapters.length ? chapters : [{ title: fallbackTitle, html: '<p></p>' }];
  }

  async function pdfToEpub(bytes, opts, onStep) {
    const { doc, pages, body } = await readPdfText(bytes, opts.key, (i, n) => onStep && onStep(i, n, 'Lecture du texte…'));
    const all = [];
    const images = [];
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].chars < 40 && opts.images !== false) {
        const cv = await Pdf.renderPage(doc, i, 1.4);
        const name = `page${i + 1}.jpg`;
        images.push({ id: 'img' + (i + 1), name, bytes: await canvasJpeg(cv, 0.8), mime: 'image/jpeg' });
        cv.width = cv.height = 0;
        all.push({ type: 'img', name });
        continue;
      }
      Pdf.blocks(pages[i], body).forEach((b) => all.push(b));
    }
    let meta = {};
    try { meta = (await doc.getMetadata()).info || {}; } catch (e) { /* rien */ }
    const title = opts.title || meta.Title || opts.baseName || 'Livre';
    let chapters = chaptersFromBlocks(all.filter((b) => b.type !== 'img'), title);
    if (images.length) {
      // Insère les pages-images à leur place approximative : en fin du chapitre courant
      let ci = 0, html = '';
      chapters = [];
      let cur = null;
      const hasH1 = all.some((b) => b.type === 'h1');
      const cut = hasH1 ? 'h1' : 'h2';
      for (const b of all) {
        if (!cur || b.type === cut) { cur = { title: b.type === cut ? b.text.slice(0, 120) : (ci ? 'Partie ' + (ci + 1) : title), html: '' }; chapters.push(cur); ci++; if (b.type === cut) { cur.html += `<h2>${xml(b.text)}</h2>`; continue; } }
        if (b.type === 'img') cur.html += `<p><img src="images/${b.name}" alt=""/></p>`;
        else if (b.type === 'p') cur.html += `<p>${xml(b.text)}</p>`;
        else cur.html += `<h3>${xml(b.text)}</h3>`;
      }
      void html;
    }
    let cover = null;
    if (opts.cover !== false) {
      const cv = await Pdf.renderPage(doc, 0, 1.6);
      cover = await canvasJpeg(cv, 0.85);
      cv.width = cv.height = 0;
    }
    return buildEpub({ title, author: opts.author || meta.Author || '', chapters, cover, images });
  }

  // ---------------------------------------------------------------- EPUB : lecture

  function resolvePath(base, href) {
    const parts = base.split('/');
    parts.pop();
    for (const seg of href.split('#')[0].split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  }

  async function readEpub(bytes) {
    const z = await JSZip.loadAsync(bytes);
    const container = await z.file('META-INF/container.xml').async('string');
    const opfPath = (container.match(/full-path="([^"]+)"/) || [])[1];
    if (!opfPath) throw new Error('EPUB illisible');
    const opf = new DOMParser().parseFromString(await z.file(opfPath).async('string'), 'application/xml');
    const items = {};
    opf.querySelectorAll('manifest > item').forEach((it) => { items[it.getAttribute('id')] = { href: resolvePath(opfPath, decodeURIComponent(it.getAttribute('href'))), type: it.getAttribute('media-type') }; });
    const title = (opf.getElementsByTagName('dc:title')[0] || {}).textContent || 'Livre';
    const author = (opf.getElementsByTagName('dc:creator')[0] || {}).textContent || '';
    const chapters = [];
    const cache = {};
    for (const ref of opf.querySelectorAll('spine > itemref')) {
      const it = items[ref.getAttribute('idref')];
      if (!it || !z.file(it.href)) continue;
      const text = await z.file(it.href).async('string');
      let d = new DOMParser().parseFromString(text, 'application/xhtml+xml');
      if (d.getElementsByTagName('parsererror').length) d = new DOMParser().parseFromString(text, 'text/html');
      const body = d.body || d.getElementsByTagName('body')[0];
      if (!body) continue;
      body.querySelectorAll('script, style, link').forEach((n) => n.remove());
      // Images en données intégrées
      const imgs = [...body.querySelectorAll('img')];
      body.querySelectorAll('image').forEach((im) => imgs.push(im));
      for (const im of imgs) {
        const attr = im.hasAttribute('src') ? 'src' : (im.hasAttribute('xlink:href') ? 'xlink:href' : 'href');
        const src = im.getAttribute(attr);
        if (!src || /^data:/.test(src)) continue;
        const p = resolvePath(it.href, decodeURIComponent(src));
        if (!z.file(p)) continue;
        if (!cache[p]) {
          const ext = p.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          cache[p] = `data:${mime};base64,` + (await z.file(p).async('base64'));
        }
        if (im.tagName.toLowerCase() === 'image') {
          const img = d.createElement('img');
          img.setAttribute('src', cache[p]);
          (im.closest('svg') || im).replaceWith(img);
        } else im.setAttribute('src', cache[p]);
      }
      const head = body.querySelector('h1, h2, h3');
      chapters.push({ title: head ? head.textContent.trim().slice(0, 120) : '', html: body.innerHTML });
    }
    return { title: title.trim(), author: author.trim(), chapters };
  }

  function epubHtml(book, opts) {
    const cover = `<div style="text-align:center;padding-top:30%"><h1 style="font-size:24pt">${xml(book.title)}</h1><p style="font-size:13pt;color:#555">${xml(book.author)}</p></div>`;
    const body = (opts.titlePage === false ? '' : `<section>${cover}</section>`) + book.chapters.map((c) => `<section class="chap">${c.html}</section>`).join('');
    return htmlPage(body, { font: opts.font || 'serif', fontSize: opts.fontSize || 11, css: 'p{margin:0 0 .5em;text-align:justify}' });
  }

  // ---------------------------------------------------------------- FB2

  function textOf(n) { return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }

  async function readFb2(bytes) {
    let text = new TextDecoder('utf-8').decode(bytes);
    const enc = (text.slice(0, 200).match(/encoding="([^"]+)"/i) || [])[1];
    if (enc && !/utf-?8/i.test(enc)) {
      try { text = new TextDecoder(enc).decode(bytes); } catch (e) { /* rien */ }
    }
    const d = new DOMParser().parseFromString(text, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Fichier FB2 illisible');
    const ti = d.getElementsByTagName('title-info')[0];
    const title = textOf(ti && ti.getElementsByTagName('book-title')[0]) || 'Livre';
    const au = ti && ti.getElementsByTagName('author')[0];
    const author = au ? [textOf(au.getElementsByTagName('first-name')[0]), textOf(au.getElementsByTagName('last-name')[0])].filter(Boolean).join(' ') : '';
    const bins = {};
    for (const b of d.getElementsByTagName('binary')) bins[b.getAttribute('id')] = { type: b.getAttribute('content-type') || 'image/jpeg', data: b.textContent.replace(/\s+/g, '') };
    const imgHtml = (node) => {
      const href = (node.getAttribute('l:href') || node.getAttribute('xlink:href') || node.getAttribute('href') || '').replace(/^#/, '');
      const b = bins[href];
      return b ? `<p><img src="data:${b.type};base64,${b.data}" alt=""/></p>` : '';
    };
    const conv = (node) => {
      let h = '';
      for (const c of node.children) {
        const t = c.localName;
        if (t === 'title') h += `<h2>${xml(textOf(c))}</h2>`;
        else if (t === 'subtitle') h += `<h3>${xml(textOf(c))}</h3>`;
        else if (t === 'p' || t === 'v' || t === 'text-author') h += `<p>${xml(textOf(c))}</p>`;
        else if (t === 'empty-line') h += '<p>&#160;</p>';
        else if (t === 'image') h += imgHtml(c);
        else if (t === 'epigraph' || t === 'cite' || t === 'poem' || t === 'stanza') h += `<blockquote>${conv(c)}</blockquote>`;
        else if (t === 'section') h += conv(c);
      }
      return h;
    };
    const chapters = [];
    const body = d.getElementsByTagName('body')[0];
    if (body) {
      const sections = [...body.children].filter((c) => c.localName === 'section');
      if (!sections.length) chapters.push({ title, html: conv(body) });
      sections.forEach((s, i) => {
        const tt = [...s.children].find((c) => c.localName === 'title');
        chapters.push({ title: tt ? textOf(tt) : 'Partie ' + (i + 1), html: conv(s) });
      });
    }
    return { title, author, chapters };
  }

  async function bookToEpub(book) {
    // Les images en data: des chapitres sont extraites en vrais fichiers
    const images = [];
    let n = 0;
    const chapters = book.chapters.map((c) => {
      const html = c.html.replace(/<img([^>]*?)src="data:([^;]+);base64,([^"]+)"([^>]*)>/g, (m, a, mime, data, b) => {
        n++;
        const extn = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
        const name = `img${n}.${extn}`;
        const bin = atob(data);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        images.push({ id: 'im' + n, name, bytes: u8, mime });
        return `<img${a}src="images/${name}"${b.replace(/\/?$/, '')}/>`;
      });
      return { title: c.title || book.title, html: sanitizeXhtml(html) };
    });
    return buildEpub({ title: book.title, author: book.author, chapters, images });
  }

  /** Remet du HTML au propre en XHTML valide (pour l'EPUB). */
  function sanitizeXhtml(html) {
    const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    d.body.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());
    return new XMLSerializer().serializeToString(d.body).replace(/^<body[^>]*>/, '').replace(/<\/body>$/, '');
  }

  function bookToFb2(book) {
    const paras = (html) => {
      const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      let out = '';
      d.body.querySelectorAll('h1, h2, h3, h4, p, li, blockquote').forEach((n) => {
        if (n.closest('li') && n.tagName !== 'LI') return;
        const t = n.textContent.replace(/\s+/g, ' ').trim();
        if (!t) return;
        out += /^H/.test(n.tagName) ? `<subtitle>${xml(t)}</subtitle>` : `<p>${xml(t)}</p>`;
      });
      return out || '<empty-line/>';
    };
    const [first, ...rest] = (book.author || '').split(' ');
    const sections = book.chapters.map((c) => `<section><title><p>${xml(c.title || book.title)}</p></title>${paras(c.html)}</section>`).join('');
    return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><author><first-name>${xml(first || '')}</first-name><last-name>${xml(rest.join(' '))}</last-name></author><book-title>${xml(book.title)}</book-title><lang>fr</lang></title-info><document-info><program-used>Pliage</program-used><date>${new Date().toISOString().slice(0, 10)}</date><id>${Store.uid()}</id><version>1.0</version></document-info></description><body>${sections}</body></FictionBook>`);
  }

  async function pdfToBook(bytes, opts, onStep) {
    const { doc, pages, body } = await readPdfText(bytes, opts.key, (i, n) => onStep && onStep(i, n, 'Lecture du texte…'));
    let meta = {};
    try { meta = (await doc.getMetadata()).info || {}; } catch (e) { /* rien */ }
    const title = opts.title || meta.Title || opts.baseName || 'Livre';
    const all = [];
    pages.forEach((p) => Pdf.blocks(p, body).forEach((b) => all.push(b)));
    return { title, author: opts.author || meta.Author || '', chapters: chaptersFromBlocks(all, title) };
  }

  // ---------------------------------------------------------------- Table des conversions

  /**
   * Chaque conversion : from (extensions acceptées), to, offline (fonction ou null), online (format de sortie).
   * run(bytes, opts, onStep) → { bytes } ou { html, landscape } (rendu en PDF par le téléphone)
   */
  const TABLE = {
    pdf2docx: { label: 'PDF → Word', to: 'docx', online: 'docx', run: (b, o, s) => pdfToDocx(b, o, s).then((bytes) => ({ bytes })) },
    docx2pdf: { label: 'Word → PDF', to: 'pdf', online: 'pdf', run: async (b) => ({ html: htmlPage(await docxToHtml(b)) }) },
    pdf2xlsx: { label: 'PDF → Excel', to: 'xlsx', online: 'xlsx', run: (b, o, s) => pdfToXlsx(b, o, s).then((bytes) => ({ bytes })) },
    xlsx2pdf: { label: 'Excel → PDF', to: 'pdf', online: 'pdf', run: async (b) => { const r = await xlsxToHtml(b); return { html: htmlPage(r.html, { landscape: r.wide, margin: '10mm' }), landscape: r.wide }; } },
    pdf2pptx: { label: 'PDF → PowerPoint', to: 'pptx', online: 'pptx', run: (b, o, s) => pdfToPptx(b, o, s).then((bytes) => ({ bytes })) },
    pptx2pdf: { label: 'PowerPoint → PDF', to: 'pdf', online: 'pdf', run: null },
    pdf2epub: { label: 'PDF → EPUB', to: 'epub', online: 'epub', run: (b, o, s) => pdfToEpub(b, o, s).then((bytes) => ({ bytes })) },
    epub2pdf: { label: 'EPUB → PDF', to: 'pdf', online: 'pdf', run: async (b, o) => ({ html: epubHtml(await readEpub(b), o) }) },
  };

  /** Conversions de livres numériques : from → to */
  async function ebook(bytes, from, to, opts, onStep) {
    if (from === to) throw new Error('Choisis un autre format que celui du fichier');
    if (['mobi', 'azw3', 'azw'].includes(from) || ['mobi', 'azw3'].includes(to)) return null; // en ligne uniquement
    let book;
    if (from === 'pdf') {
      if (to === 'epub') return { bytes: await pdfToEpub(bytes, opts, onStep) };
      book = await pdfToBook(bytes, opts, onStep);
    } else if (from === 'epub') book = await readEpub(bytes);
    else if (from === 'fb2') book = await readFb2(bytes);
    else throw new Error('Format de départ non pris en charge');
    if (to === 'epub') return { bytes: await bookToEpub(book) };
    if (to === 'fb2') return { bytes: bookToFb2(book) };
    if (to === 'pdf') return { html: epubHtml(book, opts) };
    throw new Error('Format d’arrivée non pris en charge');
  }

  const EBOOK_FORMATS = ['epub', 'pdf', 'fb2', 'mobi', 'azw3'];
  function ebookOffline(from, to) {
    if (from === to) return false;
    if (['mobi', 'azw3', 'azw'].includes(from) || ['mobi', 'azw3'].includes(to)) return false;
    return true;
  }

  window.Convert = { TABLE, ebook, EBOOK_FORMATS, ebookOffline, htmlPage, buildEpub, readEpub, readFb2, pdfToDocx, pdfToXlsx, pdfToEpub, bookToFb2 };
})();
