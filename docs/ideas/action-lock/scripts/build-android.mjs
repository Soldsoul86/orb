// Builds the Pixel app's pages into the Android assets folder:
//   index.html — Orb (public/orb.html + src/orb/app.ts)
//   lock.html  — the lock (public/app.html + src/android.ts)
import { mkdirSync, writeFileSync } from 'node:fs';
import { inlineBundle, root } from './inline.mjs';

const dir = new URL('android/app/src/main/assets/', root);
mkdirSync(dir, { recursive: true });
for (const [page, entry, out] of [
  ['public/orb.html', 'src/orb/app.ts', 'index.html'],
  ['public/app.html', 'src/android.ts', 'lock.html'],
]) {
  const html = await inlineBundle(page, entry);
  writeFileSync(new URL(out, dir), html);
  console.log(`android/app/src/main/assets/${out} ${(html.length / 1024).toFixed(1)} KB`);
}
