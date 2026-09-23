// Demo shell: HTTP API + phone page. Not production code.
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createDemo, type Verb } from './demo.ts';

const demo = createDemo();

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
}

function send(res: ServerResponse, status: number, payload: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(payload) : String(payload));
}

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const VERBS: readonly string[] = ['stop', 'unlock', 'confirm'];

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, demo.view());

      if (req.method === 'POST' && url.pathname === '/api/actions') {
        const { preset } = await body(req);
        const r = await demo.submit(String(preset));
        return send(res, r.ok ? 200 : 400, { ...demo.view(), result: r });
      }

      const verb = parts[3] ?? '';
      if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'actions' && parts.length === 4 && VERBS.includes(verb)) {
        const r = await demo.act(parts[2] ?? '', verb as Verb);
        return send(res, r.ok ? 200 : 409, { ...demo.view(), result: r });
      }

      if (req.method === 'POST' && url.pathname === '/api/policy') {
        const { change } = await body(req);
        const r = demo.changePolicy(change === 'loosen' ? 'loosen' : 'tighten');
        return send(res, 200, { ...demo.view(), result: r });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  })();
});

setInterval(() => void demo.tick(), 200);

const port = Number(process.env['PORT'] ?? 8787);
server.listen(port, () => console.log(`Action Lock demo on http://localhost:${port}`));
