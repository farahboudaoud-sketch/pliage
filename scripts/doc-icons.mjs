// Fabrique les icônes de documents (PDF, EPUB) affichées dans l'Explorateur Windows.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const svg = (label, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">
  <path d="M62 12h96l58 58v158a16 16 0 0 1-16 16H62a16 16 0 0 1-16-16V28a16 16 0 0 1 16-16z" fill="#FFFFFF" stroke="${color}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M156 12v42a16 16 0 0 0 16 16h44" fill="none" stroke="${color}" stroke-width="10" stroke-linejoin="round"/>
  <g transform="translate(76 52) scale(1.45)"><polygon points="20,60 78,60 48,32" fill="${color}"/><polygon points="48,32 78,60 74,6" fill="${color}" fill-opacity="0.72"/><polygon points="20,60 10,32 32,50" fill="${color}"/><polygon points="10,32 4,36 14,38" fill="${color}" fill-opacity="0.72"/></g>
  <text x="131" y="214" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${label.length > 3 ? 46 : 56}" fill="#1E1E1E" text-anchor="middle">${label}</text>
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
  // Même icône pour le Mac (.icns : images PNG 128, 256 et 512)
  const parts = [];
  for (const [type, size] of [['ic07', 128], ['ic08', 256], ['ic09', 512]]) {
    const png = await sharp(Buffer.from(svg(label, band))).resize(size, size).png().toBuffer();
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(png.length + 8, 4);
    parts.push(h, png);
  }
  const body = Buffer.concat(parts);
  const top = Buffer.alloc(8);
  top.write('icns', 0, 'ascii');
  top.writeUInt32BE(body.length + 8, 4);
  writeFileSync(out.replace('.ico', '.icns'), Buffer.concat([top, body]));
}

await ico('PDF', '#E5322D', 'desktop/build-res/pdf.ico');
await ico('EPUB', '#2E7D52', 'desktop/build-res/epub.ico');
console.log('icônes ok');
