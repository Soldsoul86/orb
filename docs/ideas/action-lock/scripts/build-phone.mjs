// Builds dist/action-lock.html: the phone page with the lock bundled inside,
// so it runs on a phone with no server. Output has no <html>/<head>/<body>
// wrapper; the host that serves it (claude.ai Artifacts) adds that.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const page = readFileSync(new URL('public/index.html', root), 'utf8');

const bundle = await build({
  entryPoints: [new URL('src/browser.ts', root).pathname],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
});
const js = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');

const pick = (re) => {
  const m = page.match(re);
  if (!m) throw new Error(`build-phone: ${re} not found in public/index.html`);
  return m[0];
};
const title = pick(/<title>[\s\S]*?<\/title>/);
const style = pick(/<style>[\s\S]*?<\/style>/);
const body = pick(/<body>([\s\S]*?)<\/body>/).replace(/^<body>|<\/body>$/g, '');
const [markup, ui] = body.split('<script>');
if (ui === undefined) throw new Error('build-phone: page script not found');

const out = `${title}\n${style}\n${markup.trim()}\n<script>${js}</script>\n<script>${ui}`;
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/action-lock.html', root), out);
console.log(`dist/action-lock.html ${(out.length / 1024).toFixed(1)} KB`);
