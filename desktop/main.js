// Pliage pour Windows — processus principal (fenêtre, fichiers, vidéo, ZIP, PDF, clés, en ligne).
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const JSZip = require('jszip');
const online = require('./online');

let win = null;
const pending = []; // fichiers reçus avant que la fenêtre soit prête

const ROOT = () => app.getPath('userData');
const FILES = () => path.join(ROOT(), 'files');
const CACHE = () => path.join(ROOT(), 'cache');

const MIME_EXT = {
  'application/pdf': ['pdf'], 'application/epub+zip': ['epub'], 'application/x-mobipocket-ebook': ['mobi'], 'application/vnd.amazon.ebook': ['azw3', 'azw'],
  'application/x-fictionbook+xml': ['fb2'], 'application/msword': ['doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.oasis.opendocument.text': ['odt'], 'application/rtf': ['rtf'], 'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'], 'application/vnd.oasis.opendocument.spreadsheet': ['ods'], 'text/csv': ['csv'],
  'application/vnd.ms-powerpoint': ['ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.oasis.opendocument.presentation': ['odp'], 'application/zip': ['zip'], 'application/x-zip-compressed': ['zip'],
  'image/*': ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'], 'video/*': ['mp4', 'mov', 'mkv', 'webm', 'avi', '3gp', 'm4v'],
};

/** Empêche l'interface d'écrire hors des dossiers de l'appli. */
function inApp(p) {
  const r = path.resolve(p);
  if (!(r.startsWith(FILES() + path.sep) || r.startsWith(CACHE() + path.sep))) throw new Error('Chemin non autorisé');
  return r;
}

function safeName(n) {
  return (String(n || 'fichier').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'fichier').slice(-150);
}

async function uniquePath(dir, name) {
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(name), base = path.basename(name, ext);
  let p = path.join(dir, name), i = 1;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}

async function copyIn(src) {
  const name = safeName(path.basename(src));
  const dir = path.join(CACHE(), 'in', Math.random().toString(36).slice(2, 10));
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, name);
  await fsp.copyFile(src, dest);
  const st = await fsp.stat(dest);
  return { path: dest, name, size: st.size, mime: mimeOf(name) };
}

function mimeOf(name) {
  const e = path.extname(name).slice(1).toLowerCase();
  for (const [m, exts] of Object.entries(MIME_EXT)) {
    if (!exts.includes(e)) continue;
    if (m === 'image/*') return e === 'jpg' ? 'image/jpeg' : 'image/' + (e === 'heif' ? 'heic' : e);
    if (m === 'video/*') return e === 'mov' ? 'video/quicktime' : 'video/' + e;
    return m;
  }
  return 'application/octet-stream';
}

// ---------------------------------------------------------------- Fenêtre

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 380, minHeight: 600,
    backgroundColor: '#FAF9F8', title: 'Pliage', autoHideMenuBar: true,
    icon: path.join(__dirname, 'www', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: false },
  });
  if (process.platform === 'darwin') {
    // Sur Mac, le menu donne les raccourcis Cmd+C, Cmd+V, Cmd+Q…
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  win.loadFile(path.join(__dirname, 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
  win.webContents.on('did-finish-load', () => {
    const args = process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile());
    args.forEach((a) => pending.push(a));
    flushPending();
  });
}

async function flushPending() {
  if (!win || !pending.length) return;
  const list = pending.splice(0);
  const files = [];
  for (const p of list) {
    try { files.push(await copyIn(p)); } catch (e) { files.push({ error: 'Fichier illisible', name: path.basename(p) }); }
  }
  win.webContents.send('incoming', { files, mode: 'open' });
}

// Sur Mac, « Ouvrir avec Pliage » arrive par cet évènement
app.on('open-file', (e, p) => {
  e.preventDefault();
  pending.push(p);
  if (win && !win.webContents.isLoading()) flushPending();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    argv.slice(1).filter((a) => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile() && !a.endsWith('.exe')).forEach((a) => pending.push(a));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); flushPending(); }
  });
  app.whenReady().then(async () => {
    await fsp.mkdir(FILES(), { recursive: true });
    await fsp.mkdir(CACHE(), { recursive: true });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}

// ---------------------------------------------------------------- Fichiers

const h = (name, fn) => ipcMain.handle(name, async (e, ...args) => {
  try { return { ok: await fn(...args) }; } catch (err) { return { err: (err && err.message) || 'Opération impossible' }; }
});

h('dirs', () => ({ files: FILES(), cache: CACHE() }));

h('pick', async (mimes, multiple) => {
  const exts = [...new Set((mimes || []).flatMap((m) => MIME_EXT[m] || []))];
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'].concat(multiple ? ['multiSelections'] : []),
    filters: exts.length ? [{ name: 'Fichiers pris en charge', extensions: exts }, { name: 'Tous les fichiers', extensions: ['*'] }] : [{ name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) {
    try { out.push(await copyIn(p)); } catch (e) { out.push({ error: 'Fichier illisible', name: path.basename(p) }); }
  }
  return out;
});

h('read', async (p) => {
  const b = await fsp.readFile(p);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
});
h('url', (p) => pathToFileURL(p).href);
h('write', async (p, data) => {
  const f = inApp(p);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, Buffer.from(data));
  return { path: f, size: data.byteLength };
});
h('copy', async (from, to) => {
  const t = inApp(to);
  await fsp.mkdir(path.dirname(t), { recursive: true });
  await fsp.copyFile(from, t);
  return { path: t, size: (await fsp.stat(t)).size };
});
h('remove', async (p) => { await fsp.rm(inApp(p), { recursive: true, force: true }); });
h('exists', (p) => fs.existsSync(p));
h('clearCache', async () => {
  await fsp.rm(path.join(CACHE(), 'in'), { recursive: true, force: true });
  await fsp.rm(path.join(CACHE(), 'work'), { recursive: true, force: true });
});

h('saveToDownloads', async (p, name) => {
  const dest = await uniquePath(path.join(app.getPath('downloads'), 'Pliage'), safeName(name));
  await fsp.copyFile(p, dest);
  return { shown: ['Téléchargements', 'Pliage', path.basename(dest)].join(path.sep), full: dest };
});
h('saveAs', async (p, name) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), safeName(name)) });
  if (r.canceled || !r.filePath) return { saved: false };
  await fsp.copyFile(p, r.filePath);
  return { saved: true, name: path.basename(r.filePath) };
});
h('share', async (paths) => {
  // Pas de partage système sous Windows : on montre le fichier dans l'Explorateur
  shell.showItemInFolder(paths[0]);
});
h('openWith', async (p) => {
  const err = await shell.openPath(p);
  if (err) throw new Error('Aucune appli ne peut ouvrir ce fichier');
});
h('showDownloads', async () => {
  const d = path.join(app.getPath('downloads'), 'Pliage');
  await fsp.mkdir(d, { recursive: true });
  shell.openPath(d);
});

// ---------------------------------------------------------------- Vidéo (ffmpeg)

let ffmpegProc = null;
function ffmpegPath() {
  let p = require('ffmpeg-static');
  return p.replace('app.asar', 'app.asar.unpacked');
}

h('compressVideo', (o) => new Promise((resolve, reject) => {
  const out = inApp(o.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ['-y', '-i', o.path];
  if (o.height) args.push('-vf', `scale=-2:'min(${o.height},ih)'`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  if (o.bitrate) args.push('-b:v', String(o.bitrate), '-maxrate', String(Math.round(o.bitrate * 1.3)), '-bufsize', String(o.bitrate * 2));
  else args.push('-crf', '24');
  if (o.removeAudio) args.push('-an'); else args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart', out);
  let duration = 0, errText = '';
  const p = spawn(ffmpegPath(), args, { windowsHide: true });
  ffmpegProc = p;
  p.stderr.on('data', (d) => {
    const s = d.toString();
    errText = (errText + s).slice(-2000);
    const md = s.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (md) duration = +md[1] * 3600 + +md[2] * 60 + +md[3];
    const mt = s.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (mt && duration && win) win.webContents.send('videoProgress', { progress: Math.min(99, Math.round(((+mt[1] * 3600 + +mt[2] * 60 + +mt[3]) / duration) * 100)) });
  });
  p.on('error', (e) => { ffmpegProc = null; reject(new Error('Compression impossible : ' + e.message)); });
  p.on('close', (code) => {
    ffmpegProc = null;
    if (code === 0) resolve({ path: out, size: fs.statSync(out).size });
    else { try { fs.rmSync(out, { force: true }); } catch (e) { /* rien */ } reject(new Error(code === null || code === 255 ? 'Compression annulée' : 'Compression impossible (' + errText.split('\n').filter(Boolean).pop() + ')')); }
  });
}));
h('cancelVideo', () => { if (ffmpegProc) ffmpegProc.kill('SIGKILL'); });

// ---------------------------------------------------------------- ZIP

h('zip', async (paths, names, out, level) => {
  const dest = inApp(out);
  const z = new JSZip();
  const used = new Set();
  paths.forEach((p, i) => {
    let n = (names && names[i]) || path.basename(p);
    n = n.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.\//g, '');
    const base = n; let k = 1;
    while (used.has(n)) { const ext = path.extname(base); n = base.slice(0, base.length - ext.length) + ` (${k++})` + ext; }
    used.add(n);
    z.file(n, fs.createReadStream(p));
  });
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    z.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: level ? 'DEFLATE' : 'STORE', compressionOptions: { level: level || 6 } }, (meta) => {
      if (win) win.webContents.send('zipProgress', { progress: Math.round(meta.percent) });
    }).pipe(fs.createWriteStream(dest)).on('finish', resolve).on('error', reject);
  });
  return { path: dest, size: (await fsp.stat(dest)).size };
});

h('unzip', async (p, outDir) => {
  const dir = inApp(outDir);
  const z = await JSZip.loadAsync(await fsp.readFile(p));
  const files = [];
  for (const [name, entry] of Object.entries(z.files)) {
    if (entry.dir) continue;
    const f = path.resolve(dir, name);
    if (!f.startsWith(dir + path.sep)) continue;
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, await entry.async('nodebuffer'));
    files.push({ path: f, name, size: (await fsp.stat(f)).size });
  }
  return { files };
});

// ---------------------------------------------------------------- HTML → PDF

h('htmlToPdf', async (html, out, pageSize, landscape) => {
  const dest = inApp(out);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = path.join(CACHE(), 'work', 'page-' + Date.now() + '.html');
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  await fsp.writeFile(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, offscreen: true } });
  try {
    await w.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 300));
    const pdf = await w.webContents.printToPDF({ pageSize: pageSize === 'LETTER' ? 'Letter' : 'A4', landscape: !!landscape, printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
    await fsp.writeFile(dest, pdf);
    return { path: dest, size: pdf.length };
  } finally {
    w.destroy();
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------------- Clés API chiffrées

const SECRETS = () => path.join(ROOT(), 'secrets.json');
function readSecrets() { try { return JSON.parse(fs.readFileSync(SECRETS(), 'utf8')); } catch (e) { return {}; } }
function secret(key) {
  const s = readSecrets()[key];
  if (!s) return '';
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s, 'base64')) : Buffer.from(s, 'base64').toString('utf8'); } catch (e) { return ''; }
}
h('setSecret', (key, value) => {
  const all = readSecrets();
  if (!value) delete all[key];
  else all[key] = (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value) : Buffer.from(value, 'utf8')).toString('base64');
  fs.writeFileSync(SECRETS(), JSON.stringify(all));
});
h('hasSecret', (key) => { const v = secret(key); return { has: !!v, tail: v.length > 4 ? v.slice(-4) : '' }; });

// ---------------------------------------------------------------- Conversion en ligne

h('onlineConvert', async (o) => {
  const key = secret(o.service);
  if (!key) throw new Error('Ajoute ta clé API dans Réglages');
  const dest = inApp(o.out);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const step = (label) => win && win.webContents.send('onlineProgress', { label });
  if (o.service === 'cloudconvert') await online.cloudConvert(key, o.path, o.from, o.to, dest, step);
  else await online.convertApi(key, o.path, o.from, o.to, dest, step);
  return { path: dest, size: (await fsp.stat(dest)).size };
});
h('testOnline', async (service) => {
  const key = secret(service);
  if (!key) throw new Error('Aucune clé enregistrée');
  return { info: service === 'cloudconvert' ? await online.testCloudConvert(key) : await online.testConvertApi(key) };
});

// ---------------------------------------------------------------- Sauvegarde

h('backup', async (json, out) => {
  const dest = inApp(out);
  const z = new JSZip();
  z.file('data.json', json);
  const ess = path.join(FILES(), 'essentiels');
  if (fs.existsSync(ess)) for (const f of await fsp.readdir(ess)) {
    const p = path.join(ess, f);
    if ((await fsp.stat(p)).isFile()) z.file('essentiels/' + f, fs.createReadStream(p));
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => z.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' }).pipe(fs.createWriteStream(dest)).on('finish', resolve).on('error', reject));
  return { path: dest, size: (await fsp.stat(dest)).size };
});
h('restore', async (p) => {
  const z = await JSZip.loadAsync(await fsp.readFile(p));
  const data = z.file('data.json');
  if (!data) throw new Error("Ce fichier n'est pas une sauvegarde Pliage");
  const ess = path.join(FILES(), 'essentiels');
  await fsp.mkdir(ess, { recursive: true });
  for (const [name, entry] of Object.entries(z.files)) {
    if (entry.dir || !name.startsWith('essentiels/')) continue;
    const f = path.resolve(ess, name.slice(11));
    if (!f.startsWith(ess + path.sep)) continue;
    await fsp.writeFile(f, await entry.async('nodebuffer'));
  }
  return { json: await data.async('string'), dir: ess };
});

h('importPaths', async (paths) => {
  const out = [];
  for (const p of paths || []) {
    try { if (fs.statSync(p).isFile()) out.push(await copyIn(p)); } catch (e) { out.push({ error: 'Fichier illisible', name: path.basename(p) }); }
  }
  return out;
});
h('quit', () => app.quit());
h('version', () => app.getVersion());
