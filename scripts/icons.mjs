import sharp from 'sharp';
const bird = (tx, ty, s, c1, c2) => `<g transform="translate(${tx} ${ty}) scale(${s})"><polygon points="34,80 92,80 62,52" fill="${c1}"/><polygon points="62,52 92,80 88,26" fill="${c2}"/><polygon points="34,80 24,52 46,70" fill="${c1}"/><polygon points="24,52 18,56 28,58" fill="${c2}"/></g>`;
// bird bbox x 18..92 (74), y 26..80 (54); centre 55,53
const centred = (size, w, c1, c2) => { const s = w / 74; return bird(size / 2 - 55 * s, size / 2 - 53 * s, s, c1, c2); };
const svg = (size, bg, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${inner}</svg>`);
await sharp(svg(1024, '#FFFFFF', centred(1024, 700, '#7B1E2B', '#5A1520'))).png().toFile('assets/icon-only.png');
await sharp(svg(1024, null, centred(1024, 820, '#7B1E2B', '#5A1520'))).png().toFile('assets/icon-foreground.png');
await sharp(svg(1024, '#FFFFFF', '')).png().toFile('assets/icon-background.png');
await sharp(svg(2732, '#FAF9F8', '')).png().toFile('assets/splash.png');
await sharp(svg(2732, '#151112', '')).png().toFile('assets/splash-dark.png');
await sharp(svg(512, '#FFFFFF', centred(512, 350, '#7B1E2B', '#5A1520'))).png().toFile('/tmp/icon-preview.png');
console.log('icons ok');

// Icône Mac : macOS n'arrondit pas les icônes, on dessine donc le carré arrondi
// (grille Apple : carré de 824 px aux coins de 185 px, centré dans 1024 px, avec une ombre légère).
{
  const s = 1024, sq = 824, off = (s - sq) / 2;
  const mac = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs><filter id="o" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/></filter></defs>
    <rect x="${off}" y="${off}" width="${sq}" height="${sq}" rx="185" ry="185" fill="#FFFFFF" filter="url(#o)"/>
    ${centred(s, 560, '#7B1E2B', '#5A1520')}
  </svg>`;
  await sharp(Buffer.from(mac)).png().toFile('assets/icon-mac.png');
  console.log('icône Mac ok');
}
