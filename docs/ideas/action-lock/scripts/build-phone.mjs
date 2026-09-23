// Builds dist/action-lock.html: the demo page with the lock bundled inside,
// so it runs on a phone with no server. The output has no <html>/<head>/<body>
// wrapper; the host that serves it (claude.ai Artifacts) adds that.
import { mkdirSync, writeFileSync } from 'node:fs';
import { inlineBundle, root } from './inline.mjs';

const full = await inlineBundle('public/index.html', 'src/browser.ts');
const title = full.match(/<title>[\s\S]*?<\/title>/)?.[0];
const style = full.match(/<style>[\s\S]*?<\/style>/)?.[0];
const body = full.match(/<body>([\s\S]*?)<\/body>/)?.[1];
if (!title || !style || body === undefined) throw new Error('build-phone: page structure not found');

const out = `${title}\n${style}\n${body.trim()}\n`;
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/action-lock.html', root), out);
console.log(`dist/action-lock.html ${(out.length / 1024).toFixed(1)} KB`);
