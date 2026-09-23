// Demo backend shared by the HTTP server and the in-browser (phone) build.
// Not production code: simulated executor, preset scenarios, in-memory state.
import { inMemoryJournal, type Clock } from './journal.ts';
import { createActionLock, type Outcome } from './lock.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { ruleBasedAnalyzer } from './severity.ts';
import { waitingFor } from './state.ts';
import type { Action, Context, Policy } from './types.ts';

interface Preset {
  readonly label: string;
  readonly action: Omit<Action, 'id'>;
  readonly context: Partial<Context>;
}

export const PRESETS: Readonly<Record<string, Preset>> = {
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
    label: '₹50,000 during a call from an unknown number',
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

export type Verb = 'stop' | 'unlock' | 'confirm';

/** A demo lock with presets and a view model for the phone page. */
export function createDemo(clock: Clock = () => Date.now()) {
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
      actions: [...s.order].reverse().flatMap((id) => {
        const h = s.actions.get(id);
        if (h === undefined) return [];
        return [
          {
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
          },
        ];
      }),
      events: journal.all().length,
    };
  }

  return {
    lock,
    view,
    async submit(preset: string): Promise<Outcome> {
      const p = PRESETS[preset];
      if (p === undefined) return { ok: false, reason: 'unknown scenario' };
      const context: Context = {
        localHour: new Date(clock()).getHours(),
        newRecipient: false,
        onCallWithUnknown: false,
        ...p.context,
      };
      lock.submit({ ...p.action, id: `a${++counter}` } as Action, context);
      await lock.tick();
      return { ok: true };
    },
    async act(id: string, verb: Verb): Promise<Outcome> {
      const r = verb === 'stop' ? lock.stop(id) : verb === 'unlock' ? lock.unlock(id, 'biometric') : lock.confirm(id, 'Priya');
      await lock.tick();
      return r;
    },
    changePolicy(change: 'loosen' | 'tighten'): Outcome {
      lock.proposePolicy(change === 'loosen' ? LOOSER : TIGHTER);
      return { ok: true };
    },
    tick: () => lock.tick(),
  };
}
