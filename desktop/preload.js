// Pliage pour Windows — pont entre l'interface et les fonctions du PC.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('node:url');

async function call(name, ...args) {
  const r = await ipcRenderer.invoke(name, ...args);
  if (r && r.err) throw new Error(r.err);
  return r ? r.ok : undefined;
}

function listen(channel, cb) {
  const fn = (e, d) => cb(d);
  ipcRenderer.on(channel, fn);
  return { remove: () => ipcRenderer.removeListener(channel, fn) };
}

contextBridge.exposeInMainWorld('PliageDesktop', {
  dirs: () => call('dirs'),
  pick: (mimes, multiple) => call('pick', mimes, multiple),
  read: async (p) => { const u8 = await call('read', p); return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); },
  url: (p) => pathToFileURL(p).href,
  write: (p, u8) => call('write', p, u8),
  copy: (a, b) => call('copy', a, b),
  remove: (p) => call('remove', p),
  exists: (p) => call('exists', p),
  clearCache: () => call('clearCache'),
  saveToDownloads: (p, n) => call('saveToDownloads', p, n),
  saveAs: (p, n) => call('saveAs', p, n),
  share: (paths) => call('share', paths),
  openWith: (p) => call('openWith', p),
  showDownloads: () => call('showDownloads'),
  compressVideo: async (o, onProgress) => {
    const l = listen('videoProgress', (d) => onProgress && onProgress(d.progress));
    try { return await call('compressVideo', o); } finally { l.remove(); }
  },
  cancelVideo: () => call('cancelVideo'),
  zip: async (paths, names, out, level, onProgress) => {
    const l = listen('zipProgress', (d) => onProgress && onProgress(d.progress));
    try { return await call('zip', paths, names, out, level); } finally { l.remove(); }
  },
  unzip: (p, dir) => call('unzip', p, dir),
  htmlToPdf: (html, out, size, landscape) => call('htmlToPdf', html, out, size, landscape),
  setSecret: (k, v) => call('setSecret', k, v),
  hasSecret: (k) => call('hasSecret', k),
  testOnline: (s) => call('testOnline', s),
  onlineConvert: async (o, onStep) => {
    const l = listen('onlineProgress', (d) => onStep && onStep(d.label));
    try { return await call('onlineConvert', o); } finally { l.remove(); }
  },
  backup: (json, out) => call('backup', json, out),
  restore: (p) => call('restore', p),
  version: () => call('version'),
  quit: () => call('quit'),
  setTitleBar: (dark) => call('setTitleBar', dark),
  onIncoming: (cb) => listen('incoming', cb),
  /** Chemin réel d'un fichier glissé dans la fenêtre. */
  pathOf: (file) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path),
  importPaths: (paths) => call('importPaths', paths),
});
