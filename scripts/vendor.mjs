// Copie les bibliothèques et les polices dans www/ (à relancer après une mise à jour des paquets).
import { copyFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('www/lib', { recursive: true });
mkdirSync('www/fonts', { recursive: true });
const libs = [
  ['pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
  ['pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['pako/dist/pako.min.js', 'pako.min.js'],
  ['docx/build/index.umd.js', 'docx.umd.js'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
  ['pptxgenjs/dist/pptxgen.bundle.js', 'pptxgen.bundle.js'],
];
for (const [src, dst] of libs) copyFileSync('node_modules/' + src, 'www/lib/' + dst);
const fonts = [['Inter', 'inter', [400, 500, 600]], ['Caveat', 'caveat', [600]]];
let css = '';
for (const [family, pkg, weights] of fonts) {
  for (const w of weights) for (const sub of ['latin', 'latin-ext']) {
    const name = `${pkg}-${sub}-${w}-normal.woff2`;
    const src = `node_modules/@fontsource/${pkg}/files/${name}`;
    if (!existsSync(src)) continue;
    copyFileSync(src, `www/fonts/${name}`);
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url('${name}') format('woff2');${sub === 'latin' ? '' : 'unicode-range:U+0100-02AF,U+1E00-1E9F,U+2020,U+20A0-20C0,U+2C60-2C7F,U+A720-A7FF;'}}\n`;
  }
}
writeFileSync('www/fonts/fonts.css', css);
console.log('ok');
