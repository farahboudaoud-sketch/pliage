/* Pliage — données gardées sur le téléphone (localStorage). */
(function () {
  const K = { settings: 'pliage.settings', history: 'pliage.history', ess: 'pliage.essentiels', sigs: 'pliage.signatures', last: 'pliage.last' };

  function load(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn('stockage plein', e); }
  }

  const DEFAULTS = {
    theme: 'auto',
    autoSave: true,
    naming: 'outil',
    pdfLevel: 1,
    imgQuality: 80,
    videoHeight: 720,
    dpi: 150,
    service: 'convertapi',
    askOnline: true,
    onlineWarned: false,
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const Store = {
    uid,

    get settings() { return Object.assign({}, DEFAULTS, load(K.settings, {})); },
    set(key, value) {
      const s = Store.settings;
      s[key] = value;
      save(K.settings, s);
    },

    // ---- Historique des fichiers ouverts et créés
    history() { return load(K.history, []); },
    addHistory(entry) {
      const h = Store.history().filter((e) => e.path !== entry.path);
      h.unshift(Object.assign({ id: uid(), date: Date.now() }, entry));
      save(K.history, h.slice(0, 300));
      return h[0];
    },
    updateHistory(id, patch) {
      const h = Store.history();
      const e = h.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
      save(K.history, h);
    },
    removeHistory(id) { save(K.history, Store.history().filter((e) => e.id !== id)); },
    clearHistory() { save(K.history, []); },

    // ---- Dossier personnel « Mes essentiels »
    ess() {
      const e = load(K.ess, null);
      if (e) return e;
      return { name: 'Mes essentiels', folders: [], docs: [] };
    },
    saveEss(e) { save(K.ess, e); },

    // ---- Signatures enregistrées
    signatures() { return load(K.sigs, []); },
    addSignature(sig) {
      const s = Store.signatures();
      s.unshift(Object.assign({ id: uid() }, sig));
      save(K.sigs, s.slice(0, 12));
      return s[0];
    },
    removeSignature(id) { save(K.sigs, Store.signatures().filter((s) => s.id !== id)); },

    // ---- Dernier fichier (carte « Reprendre » et widget)
    last() { return load(K.last, null); },
    setLast(f) {
      save(K.last, { name: f.name, path: f.path, mime: f.mime, size: f.size, date: Date.now() });
      Native.updateWidget(f.name, f.path);
    },

    // ---- Sauvegarde
    exportJson() {
      return JSON.stringify({ app: 'pliage', v: 1, settings: load(K.settings, {}), ess: Store.ess(), sigs: Store.signatures() });
    },
    importJson(text, essDir) {
      const d = JSON.parse(text);
      if (d.app !== 'pliage') throw new Error("Ce fichier n'est pas une sauvegarde Pliage");
      if (d.settings) save(K.settings, d.settings);
      if (d.sigs) save(K.sigs, d.sigs);
      if (d.ess) {
        // Les chemins sont recalculés pour ce téléphone
        d.ess.docs.forEach((doc) => { doc.path = essDir + '/' + doc.path.split('/').pop(); });
        save(K.ess, d.ess);
      }
    },
  };

  window.Store = Store;
})();
