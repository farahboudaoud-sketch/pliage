// Copie l'interface de l'appli (../www) dans le dossier de l'appli de bureau.
import { cpSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
cpSync('../www', 'www', { recursive: true });
mkdirSync('build', { recursive: true });
if (existsSync('../assets/icon-only.png')) { copyFileSync('../assets/icon-only.png', 'build/icon.png'); copyFileSync('../assets/icon-only.png', 'www/icon.png'); }
console.log('www copié');
