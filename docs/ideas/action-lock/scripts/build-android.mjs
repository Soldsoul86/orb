// Builds the Pixel app's page into the Android assets folder: public/app.html
// with the lock core (src/android.ts) bundled inside.
import { mkdirSync, writeFileSync } from 'node:fs';
import { inlineBundle, root } from './inline.mjs';

const out = await inlineBundle('public/app.html', 'src/android.ts');
const dir = new URL('android/app/src/main/assets/', root);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('index.html', dir), out);
console.log(`android/app/src/main/assets/index.html ${(out.length / 1024).toFixed(1)} KB`);
