// Entry for the Pixel app. The lock core runs here, inside the app's WebView;
// the Kotlin shell supplies storage, the UPI app launch, the fingerprint
// prompt and the QR scanner through the `AndroidLock` bridge.
import { analyzerFor } from './judge.ts';
import { persistentJournal } from './journal.ts';
import { createActionLock, type Outcome } from './lock.ts';
import { PHONE_POLICY, settle } from './policy.ts';
import { knowsPayee, type Profile } from './profile.ts';
import { destinationKey, knownDestinations, waitingFor } from './state.ts';
import type { Gate, LockEvent, Policy, Severity } from './types.ts';
import { buildUpiLink, parseUpiLink, parseUpiResponse } from './upi.ts';

/** Methods the Kotlin shell exposes (strings only across the bridge). */
interface NativeBridge {
  loadJournal(): string;
  saveJournal(json: string): void;
  /** Open a UPI app for `link`; the result arrives via ActionLockApp.onUpiResult. */
  launchUpi(actionId: string, link: string): void;
  /** Show the fingerprint prompt; the result arrives via ActionLockApp.onBiometric. */
  authenticate(actionId: string, title: string): void;
  /** Open the QR scanner; the result arrives via ActionLockApp.onScan. */
  scanQr(): void;
  /** The upi:// link that opened the app, once; empty if none. */
  takeIncomingLink(): string;
  /** Your profile (from `npm run import`), stored on the device only; empty if none. */
  loadProfile(): string;
  saveProfile(json: string): void;
}

/** Stand-in used when the page runs outside the app (browser preview). */
function browserBridge(): NativeBridge {
  const key = 'action-lock-journal';
  const app = () => (globalThis as unknown as { ActionLockApp: ActionLockApp }).ActionLockApp;
  return {
    loadJournal: () => {
      try {
        return localStorage.getItem(key) ?? '[]';
      } catch {
        return '[]';
      }
    },
    saveJournal: (json) => {
      try {
        localStorage.setItem(key, json);
      } catch {
        /* preview only */
      }
    },
    launchUpi: (id) => setTimeout(() => app().onUpiResult(id, `txnId=PREVIEW${Date.now()}&responseCode=00&Status=SUCCESS`), 800),
    authenticate: (id) => setTimeout(() => app().onBiometric(id, true, ''), 300),
    scanQr: () => setTimeout(() => app().onScan('upi://pay?pa=cafe.coffee@okicici&pn=Corner%20Cafe&am=180', ''), 300),
    takeIncomingLink: () => '',
    loadProfile: () => {
      try {
        return localStorage.getItem('action-lock-profile') ?? '';
      } catch {
        return '';
      }
    },
    saveProfile: (json) => {
      try {
        if (json === '') localStorage.removeItem('action-lock-profile');
        else localStorage.setItem('action-lock-profile', json);
      } catch {
        /* preview only */
      }
    },
  };
}

const native: NativeBridge =
  (globalThis as unknown as { AndroidLock?: NativeBridge }).AndroidLock ?? browserBridge();


/** A profile file from `npm run import`, checked before use. */
function readProfile(json: string): Profile | null {
  if (json.trim() === '') return null;
  const p = JSON.parse(json) as Partial<Profile>;
  if (p.version !== 1 || !Array.isArray(p.payees) || !Array.isArray(p.hourly) || p.debits === undefined) {
    throw new Error('This is not a profile.json from npm run import.');
  }
  return { subscriptions: [], autopays: [], ...p } as Profile;
}

let profile: Profile | null = null;
try {
  profile = readProfile(native.loadProfile());
} catch {
  profile = null;
}

const clock = (): number => Date.now();
const stored = JSON.parse(native.loadJournal() || '[]') as LockEvent[];
const journal = persistentJournal(clock, stored, (events) => native.saveJournal(JSON.stringify(events)));

// One UPI app at a time: launches are queued, results matched by action id.
const waiting = new Map<string, { resolve: (r: { ref: string }) => void; reject: (e: Error) => void }>();
let queue: Promise<unknown> = Promise.resolve();

const lock = createActionLock({
  clock,
  journal,
  // Always the current profile: loading one changes how the next payment is judged.
  analyzer: { analyze: (action, context) => analyzerFor(profile).analyze(action, context) },
  initialPolicy: PHONE_POLICY,
  executor: {
    execute: (action) => {
      const run = () =>
        new Promise<{ ref: string }>((resolve, reject) => {
          if (action.payload === undefined) return reject(new Error('No UPI link to send.'));
          waiting.set(action.id, { resolve, reject });
          native.launchUpi(action.id, action.payload);
        });
      const result = queue.then(run, run);
      queue = result.catch(() => undefined);
      return result;
    },
  },
});

// A payment still held when the app was closed is stopped, not sent on the
// next launch: nobody was watching its buffer.
for (const id of lock.state().order) {
  if (lock.state().actions.get(id)?.status === 'held') lock.stop(id, 'app closed during the buffer');
}

let counter = lock.state().order.length;
const newId = (): string => `p${Date.now().toString(36)}${(++counter).toString(36)}`;

export interface Draft {
  readonly link: string;
  readonly payee: string;
  readonly name: string;
  readonly amount: string;
  readonly note: string;
}

/** Hold a payment. `amount` fills in links that don't carry one. */
function pay(link: string, amount?: string): Outcome {
  const parsed = parseUpiLink(link);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const p = parsed.payment;
  const am = amount ?? p.am;
  if (am === undefined || !/^\d+(\.\d{1,2})?$/.test(am) || Number(am) <= 0) return { ok: false, reason: 'Enter an amount.' };
  const newRecipient = !(
    knownDestinations(lock.state()).has(destinationKey('payment', p.pa)) ||
    (profile !== null && knowsPayee(profile, p.pa, p.pn))
  );
  lock.submit(
    {
      id: newId(),
      agentId: 'You',
      kind: 'payment',
      recipient: p.pa,
      amount: Number(am),
      ...(p.tn !== undefined ? { text: p.tn } : {}),
      payload: buildUpiLink(p, am),
    },
    { localHour: new Date().getHours(), newRecipient, onCallWithUnknown: false },
  );
  void lock.tick();
  return { ok: true };
}

/** Change the hold for one severity level. Loosening waits; tightening is immediate. */
function setLevel(level: Severity, gate: Gate): Outcome {
  const s = settle(lock.state().policy, clock());
  const base = s.pending?.policy ?? s.active;
  lock.proposePolicy({ ...base, defaults: { ...base.defaults, [level]: gate } });
  return { ok: true };
}

function view() {
  const now = clock();
  const s = lock.state();
  const settled = settle(s.policy, now);
  const known = [...knownDestinations(s)].filter((k) => k.startsWith('payment:')).map((k) => k.slice('payment:'.length));
  return {
    now,
    known,
    profile:
      profile === null
        ? null
        : {
            from: profile.range?.from ?? null,
            to: profile.range?.to ?? null,
            payments: profile.debits.count,
            usual: profile.debits.p50,
            payees: profile.payees.length,
            quiet: profile.quietHours,
            subscriptions: profile.subscriptions.filter((s) => s.status === 'active').length,
            autopays: profile.autopays.filter((a) => a.status === 'active').length,
          },
    policy: {
      active: settled.active.defaults,
      pending: settled.pending === undefined ? null : { defaults: settled.pending.policy.defaults, effectiveAt: settled.pending.effectiveAt },
    },
    actions: [...s.order].reverse().flatMap((id) => {
      const h = s.actions.get(id);
      if (h === undefined) return [];
      return [
        {
          id,
          recipient: h.action.recipient,
          amount: h.action.amount ?? 0,
          note: h.action.text ?? '',
          status: h.status,
          level: h.analysis?.level ?? 0,
          feedback: h.analysis?.feedback ?? [],
          gate: h.gate,
          requestedAt: h.requestedAt,
          releaseAt: h.releaseAt ?? h.requestedAt,
          waiting: waitingFor(h, now),
          ref: h.ref ?? null,
          error: h.error ?? null,
        },
      ];
    }),
  };
}

type Listener = (message?: string) => void;
let listener: Listener = () => {};

export interface ActionLockApp {
  view: typeof view;
  pay: typeof pay;
  setLevel: typeof setLevel;
  /** Load or replace your profile from the text of profile.json; '' removes it. */
  setProfile(json: string): Outcome;
  preview(link: string): { ok: true; draft: Draft; known: boolean } | { ok: false; reason: string };
  stop(id: string): Outcome;
  unlock(id: string): void;
  scan(): void;
  takeIncomingLink(): string;
  onChange(fn: Listener): void;
  // Called by the Kotlin shell:
  onUpiResult(id: string, response: string | null): void;
  onBiometric(id: string, ok: boolean, message: string): void;
  onScan(text: string, error: string): void;
  onIncoming(link: string): void;
}

const app: ActionLockApp = {
  view,
  pay,
  setLevel,
  setProfile(json) {
    try {
      const next = readProfile(json);
      native.saveProfile(next === null ? '' : JSON.stringify(next));
      profile = next;
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Could not read that file.' };
    }
  },
  preview(link) {
    const r = parseUpiLink(link);
    if (!r.ok) return r;
    const p = r.payment;
    return {
      ok: true,
      draft: { link, payee: p.pa, name: p.pn ?? '', amount: p.am ?? '', note: p.tn ?? '' },
      known:
        knownDestinations(lock.state()).has(destinationKey('payment', p.pa)) ||
        (profile !== null && knowsPayee(profile, p.pa, p.pn)),
    };
  },
  stop: (id) => lock.stop(id),
  unlock(id) {
    const h = lock.state().actions.get(id);
    native.authenticate(id, `Unlock payment of ₹${(h?.action.amount ?? 0).toLocaleString('en-IN')}`);
  },
  scan: () => native.scanQr(),
  takeIncomingLink: () => native.takeIncomingLink(),
  onChange(fn) {
    listener = fn;
  },
  onUpiResult(id, response) {
    const w = waiting.get(id);
    if (w === undefined) return;
    waiting.delete(id);
    const r = parseUpiResponse(response);
    if (r.status === 'SUCCESS') w.resolve({ ref: r.txnId ?? 'success' });
    else if (r.status === 'SUBMITTED') w.resolve({ ref: `submitted ${r.txnId ?? ''}`.trim() });
    else if (r.status === 'FAILURE') w.reject(new Error(`The UPI app reported a failure${r.responseCode ? ` (${r.responseCode})` : ''}.`));
    else w.reject(new Error('No result from the UPI app. If you paid, it will show in your UPI app history.'));
    setTimeout(() => listener(), 0);
  },
  onBiometric(id, ok, message) {
    if (ok) {
      const r = lock.unlock(id);
      listener(r.ok ? undefined : r.reason);
    } else listener(message || 'Fingerprint not confirmed.');
  },
  onScan(text, error) {
    if (text === '') return listener(error || 'Scan cancelled.');
    (globalThis as unknown as { onScanned?: (t: string) => void }).onScanned?.(text);
  },
  onIncoming(link) {
    (globalThis as unknown as { onIncomingLink?: (t: string) => void }).onIncomingLink?.(link);
  },
};

(globalThis as unknown as { ActionLockApp: ActionLockApp }).ActionLockApp = app;
setInterval(() => {
  void lock.tick().then((released) => {
    if (released.length > 0) listener();
  });
}, 250);
