// Fabrique les icônes de documents (PDF, EPUB) affichées dans l'Explorateur Windows.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const svg = (label, band) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <path d="M52 14h108l52 52v168a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill="#FFFFFF" stroke="#C9C2C2" stroke-width="5"/>
  <path d="M160 14v44a8 8 0 0 0 8 8h44" fill="#EEE8E8" stroke="#C9C2C2" stroke-width="5" stroke-linejoin="round"/>
  <g stroke="#D6CFCF" stroke-width="9" stroke-linecap="round"><line x1="76" y1="96" x2="180" y2="96"/><line x1="76" y1="120" x2="180" y2="120"/></g>
  <rect x="24" y="146" width="184" height="72" rx="10" fill="${band}"/>
  <text x="116" y="200" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${label.length > 3 ? 50 : 60}" fill="#FFFFFF" text-anchor="middle">${label}</text>
</svg>`;

async function ico(label, band, out) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg(label, band))).resize(s, s).png().toBuffer()));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(out, Buffer.concat([head, ...pngs]));
  await sharp(Buffer.from(svg(label, band))).png().toFile(out.replace('.ico', '-apercu.png'));
}

await ico('PDF', '#D93025', 'desktop/build-res/pdf.ico');
await ico('EPUB', '#2E7D52', 'desktop/build-res/epub.ico');
console.log('icônes ok');
