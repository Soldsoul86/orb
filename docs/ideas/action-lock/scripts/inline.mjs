// Bundles a TypeScript entry with esbuild and inlines it into an HTML page,
// just before the page's own script. Used by build-phone and build-android.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

export const root = new URL('..', import.meta.url);

export async function inlineBundle(pagePath, entryPath) {
  const page = readFileSync(new URL(pagePath, root), 'utf8');
  const bundle = await build({
    entryPoints: [new URL(entryPath, root).pathname],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    write: false,
  });
  const js = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const at = page.lastIndexOf('<script>');
  if (at < 0) throw new Error(`${pagePath}: page script not found`);
  return page.slice(0, at) + `<script>${js}</script>\n` + page.slice(at);
}
