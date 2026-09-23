import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { inMemoryJournal } from '../src/journal.ts';
import { createActionLock, type Executor } from '../src/lock.ts';
import { DEFAULT_POLICY } from '../src/policy.ts';
import { ruleBasedAnalyzer } from '../src/severity.ts';
import { fold } from '../src/state.ts';
import type { Action, Context, Policy } from '../src/types.ts';

function setup(policy: Policy = DEFAULT_POLICY, executor?: Executor) {
  let now = 0;
  const executed: string[] = [];
  const journal = inMemoryJournal(() => now);
  const lock = createActionLock({
    clock: () => now,
    journal,
    analyzer: ruleBasedAnalyzer,
    initialPolicy: policy,
    executor: executor ?? {
      async execute(a) {
        executed.push(a.id);
        return { ref: `ref-${a.id}` };
      },
    },
  });
  return { lock, journal, executed, advance: (s: number) => void (now += s * 1000) };
}

const ctx = (over: Partial<Context> = {}): Context => ({
  localHour: 14,
  newRecipient: false,
  onCallWithUnknown: false,
  ...over,
});
const pay = (id: string, amount: number): Action => ({ id, agentId: 'agent', kind: 'payment', recipient: 'p@upi', amount });

describe('ActionLock', () => {
  it('pass: executes on the first tick', async () => {
    const t = setup();
    t.lock.submit(pay('a', 200), ctx());
    await t.lock.tick();
    assert.deepEqual(t.executed, ['a']);
    assert.equal(t.lock.state().actions.get('a')?.status, 'executed');
  });

  it('countdown: waits for the hold, then executes', async () => {
    const t = setup();
    const h = t.lock.submit(pay('a', 5_000), ctx({ newRecipient: true }));
    assert.deepEqual(h.gate, { mode: 'countdown', holdSeconds: 10 });
    t.advance(9);
    await t.lock.tick();
    assert.deepEqual(t.executed, []);
    t.advance(1);
    await t.lock.tick();
    assert.deepEqual(t.executed, ['a']);
  });

  it('stop during the buffer: never executes', async () => {
    const t = setup();
    t.lock.submit(pay('a', 5_000), ctx({ newRecipient: true }));
    t.advance(5);
    assert.deepEqual(t.lock.stop('a'), { ok: true });
    t.advance(60);
    await t.lock.tick();
    assert.deepEqual(t.executed, []);
    assert.equal(t.lock.state().actions.get('a')?.status, 'stopped');
  });

  it('stop after release is too late', async () => {
    const t = setup();
    t.lock.submit(pay('a', 200), ctx());
    await t.lock.tick();
    const r = t.lock.stop('a');
    assert.equal(r.ok, false);
  });

  it('unlock mode needs a fingerprint and the hold', async () => {
    const policy: Policy = { ...DEFAULT_POLICY, defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'unlock', holdSeconds: 3 } } };
    const t = setup(policy);
    t.lock.submit(pay('a', 5_000), ctx({ newRecipient: true }));
    t.advance(10);
    await t.lock.tick();
    assert.deepEqual(t.executed, [], 'no unlock yet');
    assert.deepEqual(t.lock.unlock('a'), { ok: true });
    await t.lock.tick();
    assert.deepEqual(t.executed, ['a']);
  });

  it('unlock before the hold ends still waits for the hold', async () => {
    const policy: Policy = { ...DEFAULT_POLICY, defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'unlock', holdSeconds: 30 } } };
    const t = setup(policy);
    t.lock.submit(pay('a', 5_000), ctx({ newRecipient: true }));
    t.lock.unlock('a');
    await t.lock.tick();
    assert.deepEqual(t.executed, []);
    t.advance(30);
    await t.lock.tick();
    assert.deepEqual(t.executed, ['a']);
  });

  it('second person: the user cannot confirm their own action', async () => {
    const t = setup();
    t.lock.submit(pay('a', 50_000), ctx({ onCallWithUnknown: true }));
    assert.equal(t.lock.state().actions.get('a')?.gate?.mode, 'second_person');
    assert.equal(t.lock.confirm('a', 'user').ok, false);
    assert.equal(t.lock.confirm('a', 'wife').ok, true);
    t.advance(300);
    await t.lock.tick();
    assert.deepEqual(t.executed, ['a']);
  });

  it('block: never releases', async () => {
    const policy: Policy = { ...DEFAULT_POLICY, defaults: { ...DEFAULT_POLICY.defaults, 4: { mode: 'block', holdSeconds: 0 } } };
    const t = setup(policy);
    t.lock.submit({ id: 'a', agentId: 'agent', kind: 'message', recipient: 'x', text: 'your OTP is 123456' }, ctx());
    t.advance(1_000_000);
    await t.lock.tick();
    assert.deepEqual(t.executed, []);
    assert.equal(t.lock.stop('a').ok, true);
  });

  it('a proposal cannot shorten its own waiting time', async () => {
    const t = setup();
    const loose: Policy = { ...DEFAULT_POLICY, defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'pass', holdSeconds: 0 } }, loosenDelaySeconds: 0 };
    const e = t.lock.proposePolicy(loose);
    assert.equal(e.type === 'PolicyChangeProposed' && e.effectiveAt, 24 * 60 * 60 * 1000);
    assert.equal(t.lock.submit(pay('a', 5_000), ctx({ newRecipient: true })).gate?.mode, 'countdown');
    t.advance(24 * 60 * 60);
    assert.equal(t.lock.submit(pay('b', 5_000), ctx({ newRecipient: true })).gate?.mode, 'pass');
  });

  it('failures are recorded, not thrown', async () => {
    const t = setup(DEFAULT_POLICY, {
      async execute() {
        throw new Error('service down');
      },
    });
    t.lock.submit(pay('a', 200), ctx());
    await t.lock.tick();
    const h = t.lock.state().actions.get('a');
    assert.equal(h?.status, 'failed');
    assert.equal(h?.error, 'service down');
  });

  it('replaying the journal gives the same state', async () => {
    const t = setup();
    t.lock.submit(pay('a', 200), ctx());
    t.lock.submit(pay('b', 5_000), ctx({ newRecipient: true }));
    t.lock.stop('b');
    t.lock.proposePolicy(DEFAULT_POLICY);
    await t.lock.tick();
    const replayed = fold(DEFAULT_POLICY, t.journal.all());
    assert.deepEqual(replayed, t.lock.state());
  });

  it('events are immutable', () => {
    const t = setup();
    t.lock.submit(pay('a', 200), ctx());
    const first = t.journal.all()[0];
    assert.throws(() => {
      (first as { seq: number }).seq = 99;
    });
  });

  it('duplicate action ids are rejected', () => {
    const t = setup();
    t.lock.submit(pay('a', 200), ctx());
    assert.throws(() => t.lock.submit(pay('a', 200), ctx()));
  });
});
