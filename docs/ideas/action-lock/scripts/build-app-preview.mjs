// Builds dist/app-preview.html: the Pixel app's screen with the lock bundled,
// for trying in a phone browser. Payments are simulated (stand-in bridge).
// No <html>/<head>/<body> wrapper: the host that serves it adds that.
import { mkdirSync, writeFileSync } from 'node:fs';
import { inlineBundle, root } from './inline.mjs';

const full = await inlineBundle('public/app.html', 'src/android.ts');
const title = full.match(/<title>[\s\S]*?<\/title>/)?.[0];
const style = full.match(/<style>[\s\S]*?<\/style>/)?.[0];
const body = full.match(/<body>([\s\S]*?)<\/body>/)?.[1];
if (!title || !style || body === undefined) throw new Error('build-app-preview: page structure not found');
const out = `${title}\n${style}\n${body.trim()}\n`;
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/app-preview.html', root), out);
console.log(`dist/app-preview.html ${(out.length / 1024).toFixed(1)} KB`);
