import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { inMemoryJournal, persistentJournal } from '../src/journal.ts';
import { createActionLock, OUTCOME_UNKNOWN } from '../src/lock.ts';
import { DEFAULT_POLICY } from '../src/policy.ts';
import { ruleBasedAnalyzer } from '../src/severity.ts';
import { destinationKey, knownDestinations } from '../src/state.ts';
import type { LockEvent } from '../src/types.ts';
import { buildUpiLink, parseUpiLink, parseUpiResponse } from '../src/upi.ts';

describe('UPI links', () => {
  it('parses a merchant QR link', () => {
    const r = parseUpiLink('upi://pay?pa=Swiggy@ICICI&pn=Swiggy&am=250.00&cu=INR&tn=Order%20123&mc=5812&tr=ORD123');
    assert.ok(r.ok);
    assert.equal(r.payment.pa, 'swiggy@icici');
    assert.equal(r.payment.am, '250.00');
    assert.equal(r.payment.tn, 'Order 123');
    assert.equal(r.payment.mc, '5812');
  });

  it('parses a personal link with no amount', () => {
    const r = parseUpiLink('upi://pay?pa=ravi.k@okaxis&pn=Ravi%20K');
    assert.ok(r.ok);
    assert.equal(r.payment.am, undefined);
  });

  it('rejects non-UPI links, bad payees and bad amounts', () => {
    assert.equal(parseUpiLink('https://pay.example.com').ok, false);
    assert.equal(parseUpiLink('upi://mandate?pa=a@b').ok, false);
    assert.equal(parseUpiLink('upi://pay?pn=NoPayee').ok, false);
    assert.equal(parseUpiLink('upi://pay?pa=not-a-vpa').ok, false);
    assert.equal(parseUpiLink('upi://pay?pa=a@okaxis&am=12.345').ok, false);
    assert.equal(parseUpiLink('upi://pay?pa=a@okaxis&am=-5').ok, false);
  });

  it('builds a link that keeps every original parameter', () => {
    const r = parseUpiLink('upi://pay?pa=shop@ybl&pn=My%20Shop&tr=T1&sign=abc');
    assert.ok(r.ok);
    const out = new URL(buildUpiLink(r.payment, '499'));
    assert.equal(out.searchParams.get('pa'), 'shop@ybl');
    assert.equal(out.searchParams.get('am'), '499');
    assert.equal(out.searchParams.get('sign'), 'abc');
    assert.equal(out.searchParams.get('cu'), 'INR');
    assert.ok(!buildUpiLink(r.payment).includes('+'), 'spaces encoded as %20');
  });

  it('reads UPI app responses', () => {
    assert.deepEqual(parseUpiResponse('txnId=AXI123&responseCode=00&Status=SUCCESS&txnRef=a1'), {
      status: 'SUCCESS',
      txnId: 'AXI123',
      responseCode: '00',
    });
    assert.equal(parseUpiResponse('Status=FAILURE&responseCode=ZM').status, 'FAILURE');
    assert.equal(parseUpiResponse('status=submitted').status, 'SUBMITTED');
    assert.equal(parseUpiResponse(null).status, 'UNKNOWN');
    assert.equal(parseUpiResponse('garbage').status, 'UNKNOWN');
  });
});

describe('known payees and restarts', () => {
  const ctx = { localHour: 14, newRecipient: true, onCallWithUnknown: false };
  const pay = (id: string, recipient: string) => ({ id, agentId: 'you', kind: 'payment' as const, recipient, amount: 200 });

  it('a payee becomes known only after a completed payment', async () => {
    const lock = createActionLock({
      clock: () => 0,
      journal: inMemoryJournal(() => 0),
      analyzer: ruleBasedAnalyzer,
      initialPolicy: { ...DEFAULT_POLICY, defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'pass', holdSeconds: 0 } } },
      executor: { execute: async () => ({ ref: 'ok' }) },
    });
    lock.submit(pay('a', 'Ravi@okaxis'), ctx);
    lock.submit(pay('b', 'stopped@okaxis'), { ...ctx, onCallWithUnknown: true });
    lock.stop('b');
    await lock.tick();
    const known = knownDestinations(lock.state());
    assert.ok(known.has(destinationKey('payment', 'ravi@okaxis')));
    assert.ok(!known.has(destinationKey('payment', 'stopped@okaxis')));
  });

  it('survives a restart through the stored journal', async () => {
    let saved: readonly LockEvent[] = [];
    const deps = (events: readonly LockEvent[]) => ({
      clock: () => 0,
      journal: persistentJournal(() => 0, events, (e) => void (saved = e)),
      analyzer: ruleBasedAnalyzer,
      initialPolicy: DEFAULT_POLICY,
      executor: { execute: async () => ({ ref: 'ok' }) },
    });
    const first = createActionLock(deps([]));
    first.submit(pay('a', 'x@okaxis'), ctx);
    const second = createActionLock(deps(JSON.parse(JSON.stringify(saved)) as LockEvent[]));
    assert.deepEqual(second.state(), first.state());
  });

  it('never re-runs a payment interrupted after release', async () => {
    let saved: readonly LockEvent[] = [];
    let calls = 0;
    const deps = (events: readonly LockEvent[], execute: () => Promise<{ ref: string }>) => ({
      clock: () => 0,
      journal: persistentJournal(() => 0, events, (e) => void (saved = e)),
      analyzer: ruleBasedAnalyzer,
      initialPolicy: DEFAULT_POLICY,
      executor: { execute },
    });
    // The app is killed while the UPI app is open: execute never returns.
    const first = createActionLock(deps([], () => new Promise(() => {})));
    first.submit(pay('a', 'x@okaxis'), { ...ctx, newRecipient: false });
    void first.tick();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(first.state().actions.get('a')?.status, 'released');

    const restarted = createActionLock(deps(saved, async () => ({ ref: `ran-${++calls}` })));
    await restarted.tick();
    assert.equal(calls, 0);
    assert.equal(restarted.state().actions.get('a')?.status, 'failed');
    assert.equal(restarted.state().actions.get('a')?.error, OUTCOME_UNKNOWN);
  });

  it('rejects a corrupt journal', () => {
    const bad = [{ seq: 2, at: 0, type: 'ActionStopped', id: 'x', by: 'user' }] as unknown as LockEvent[];
    assert.throws(() => persistentJournal(() => 0, bad, () => {}));
  });
});
