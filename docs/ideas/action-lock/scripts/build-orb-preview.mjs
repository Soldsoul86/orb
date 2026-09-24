// Builds dist/orb.html: the Orb page with invented sample data, for a browser preview.
import { mkdirSync, writeFileSync } from 'node:fs';
import { inlineBundle, root } from './inline.mjs';

const html = await inlineBundle('public/orb.html', 'src/orb/app.ts');
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/orb.html', root), html);
console.log(`dist/orb.html ${(html.length / 1024).toFixed(1)} KB`);
