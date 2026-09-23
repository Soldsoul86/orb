// Demo shell: HTTP API + mobile page. Not production code.
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { inMemoryJournal } from './journal.ts';
import { createActionLock } from './lock.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { ruleBasedAnalyzer } from './severity.ts';
import { waitingFor } from './state.ts';
import type { Action, Context, Policy } from './types.ts';

const clock = (): number => Date.now();
const journal = inMemoryJournal(clock);
const lock = createActionLock({
  clock,
  journal,
  analyzer: ruleBasedAnalyzer,
  initialPolicy: { ...DEFAULT_POLICY, loosenDelaySeconds: 60 }, // 60 s so the demo can show it
  executor: {
    // Records the call instead of contacting a real service.
    execute: async (a) => {
      await new Promise((r) => setTimeout(r, 300));
      return { ref: `sent-${a.id}` };
    },
  },
});

interface Preset {
  readonly label: string;
  readonly action: Omit<Action, 'id'>;
  readonly context: Partial<Context>;
}

const PRESETS: Readonly<Record<string, Preset>> = {
  swiggy: {
    label: 'Food order ₹200 (paid before)',
    action: { agentId: 'Food agent', kind: 'payment', recipient: 'swiggy@upi', amount: 200 },
    context: {},
  },
  newMessage: {
    label: 'Message to a new contact',
    action: { agentId: 'Assistant', kind: 'message', recipient: 'Ravi (new)', text: 'Hi Ravi, following up on the flat.' },
    context: { newRecipient: true },
  },
  newPayee: {
    label: '₹5,000 to a new UPI ID',
    action: { agentId: 'Travel agent', kind: 'payment', recipient: 'goa-trips@okxyz', amount: 5_000 },
    context: { newRecipient: true },
  },
  bigNewPayee: {
    label: '₹25,000 to a new UPI ID',
    action: { agentId: 'Shopping agent', kind: 'payment', recipient: 'deals4u@okxyz', amount: 25_000 },
    context: { newRecipient: true },
  },
  otp: {
    label: 'Agent sends an OTP by email',
    action: { agentId: 'Email agent', kind: 'email', recipient: 'support@bank-help.co', text: 'Your OTP is 482913' },
    context: { newRecipient: true },
  },
  onCall: {
    label: '₹50,000 during a call from unknown number',
    action: { agentId: 'You', kind: 'payment', recipient: 'rbi.verify@okxyz', amount: 50_000 },
    context: { newRecipient: true, onCallWithUnknown: true },
  },
};

const LOOSER: Policy = {
  ...DEFAULT_POLICY,
  defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'pass', holdSeconds: 0 } },
};
const TIGHTER: Policy = {
  ...DEFAULT_POLICY,
  defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'countdown', holdSeconds: 30 } },
};

let counter = 0;

function view() {
  const now = clock();
  const s = lock.state();
  return {
    now,
    presets: Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label })),
    policy: {
      pending: s.policy.pending === undefined ? null : { effectiveAt: s.policy.pending.effectiveAt },
      level2: s.policy.active.defaults[2],
    },
    actions: [...s.order].reverse().map((id) => {
      const h = s.actions.get(id);
      if (h === undefined) return null;
      return {
        ...h.action,
        status: h.status,
        level: h.analysis?.level ?? 0,
        feedback: h.analysis?.feedback ?? [],
        gate: h.gate,
        releaseAt: h.releaseAt,
        requestedAt: h.requestedAt,
        waiting: waitingFor(h, now),
        confirmedBy: h.confirmedBy ?? null,
        unlocked: h.unlocked,
      };
    }),
    events: journal.all().length,
  };
}

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

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, view());

      if (req.method === 'POST' && url.pathname === '/api/actions') {
        const { preset } = await body(req);
        const p = typeof preset === 'string' ? PRESETS[preset] : undefined;
        if (p === undefined) return send(res, 400, { error: 'unknown preset' });
        const context: Context = {
          localHour: new Date().getHours(),
          newRecipient: false,
          onCallWithUnknown: false,
          ...p.context,
        };
        lock.submit({ ...p.action, id: `a${++counter}` } as Action, context);
        await lock.tick();
        return send(res, 200, view());
      }

      if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'actions' && parts.length === 4) {
        const id = parts[2] ?? '';
        const verb = parts[3];
        const r =
          verb === 'stop'
            ? lock.stop(id)
            : verb === 'unlock'
              ? lock.unlock(id, 'biometric')
              : verb === 'confirm'
                ? lock.confirm(id, 'Priya')
                : { ok: false as const, reason: 'unknown verb' };
        await lock.tick();
        return send(res, r.ok ? 200 : 409, { ...view(), result: r });
      }

      if (req.method === 'POST' && url.pathname === '/api/policy') {
        const { change } = await body(req);
        lock.proposePolicy(change === 'loosen' ? LOOSER : TIGHTER);
        return send(res, 200, view());
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  })();
});

setInterval(() => void lock.tick(), 200);

const port = Number(process.env['PORT'] ?? 8787);
server.listen(port, () => console.log(`Action Lock demo on http://localhost:${port}`));
