// Conversion « haute fidélité » via ConvertAPI ou CloudConvert (clé de l'utilisateur).
const fsp = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');

async function json(res) {
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error('Clé API refusée : vérifie-la dans Réglages');
  if (res.status === 402) throw new Error('Quota gratuit épuisé sur ce service');
  if (res.status === 429) throw new Error('Trop de demandes, réessaie dans un moment');
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* rien */ }
  if (!res.ok) throw new Error(data.Message || data.message || `Le service a refusé la conversion (${res.status})`);
  return data;
}

async function fileBlob(p) {
  return new Blob([await fsp.readFile(p)]);
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Téléchargement du résultat impossible (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

async function saveFiles(list, dest) {
  if (list.length === 1) return fsp.writeFile(dest, await download(list[0].url));
  const z = new JSZip();
  for (const f of list) z.file(f.name, await download(f.url));
  await fsp.writeFile(dest, await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function convertApi(key, input, from, to, dest, step) {
  step('Envoi du fichier…');
  const fd = new FormData();
  fd.append('File', await fileBlob(input), path.basename(input));
  const res = await fetch(`https://v2.convertapi.com/convert/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}?StoreFile=true`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, body: fd,
  });
  step('Conversion en cours…');
  const data = await json(res);
  const files = (data.Files || []).map((f) => ({ url: f.Url, name: f.FileName }));
  if (!files.length) throw new Error("Le service n'a renvoyé aucun fichier");
  step('Téléchargement du résultat…');
  await saveFiles(files, dest);
}

async function testConvertApi(key) {
  const u = await json(await fetch('https://v2.convertapi.com/user', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }));
  if (u.ConversionsTotal != null && u.ConversionsConsumed != null) return `Connexion réussie · ${u.ConversionsTotal - u.ConversionsConsumed} conversions restantes`;
  if (u.SecondsLeft != null) return `Connexion réussie · ${u.SecondsLeft} secondes restantes`;
  return 'Connexion réussie';
}

async function cloudConvert(key, input, from, to, dest, step) {
  const auth = { Authorization: 'Bearer ' + key, Accept: 'application/json' };
  step('Préparation…');
  const job = (await json(await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ tag: 'pliage', tasks: {
      envoi: { operation: 'import/upload' },
      conversion: { operation: 'convert', input: 'envoi', input_format: from, output_format: to },
      export: { operation: 'export/url', input: 'conversion' },
    } }),
  }))).data;
  const up = job.tasks.find((t) => t.name === 'envoi');
  if (!up || !up.result) throw new Error('Réponse inattendue du service');
  step('Envoi du fichier…');
  const fd = new FormData();
  for (const [k, v] of Object.entries(up.result.form.parameters || {})) fd.append(k, v);
  fd.append('file', await fileBlob(input), path.basename(input));
  const r = await fetch(up.result.form.url, { method: 'POST', body: fd });
  if (r.status >= 400) throw new Error(`Envoi refusé par le service (${r.status})`);
  step('Conversion en cours…');
  const deadline = Date.now() + 15 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('La conversion prend trop de temps');
    await new Promise((res) => setTimeout(res, 2000));
    const j = (await json(await fetch('https://api.cloudconvert.com/v2/jobs/' + job.id, { headers: auth }))).data;
    if (j.status === 'error') {
      const t = j.tasks.find((x) => x.status === 'error');
      throw new Error((t && t.message) || 'Conversion refusée par le service');
    }
    if (j.status === 'finished') {
      const t = j.tasks.find((x) => x.name === 'export');
      const files = ((t && t.result && t.result.files) || []).map((f) => ({ url: f.url, name: f.filename }));
      if (!files.length) throw new Error("Le service n'a renvoyé aucun fichier");
      step('Téléchargement du résultat…');
      return saveFiles(files, dest);
    }
  }
}

async function testCloudConvert(key) {
  const u = (await json(await fetch('https://api.cloudconvert.com/v2/users/me', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }))).data;
  if (u && u.credits != null) return `Connexion réussie · ${u.credits} crédits restants`;
  return 'Connexion réussie';
}

module.exports = { convertApi, testConvertApi, cloudConvert, testCloudConvert };
