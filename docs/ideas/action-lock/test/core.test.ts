import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { stricter } from '../src/gate.ts';
import { DEFAULT_POLICY, decide, decideAt, settle } from '../src/policy.ts';
import { ruleBasedAnalyzer } from '../src/severity.ts';
import type { Action, Context, Policy } from '../src/types.ts';

const ctx = (over: Partial<Context> = {}): Context => ({
  localHour: 14,
  newRecipient: false,
  onCallWithUnknown: false,
  ...over,
});
const act = (over: Partial<Action> = {}): Action => ({
  id: 'a1',
  agentId: 'agent',
  kind: 'payment',
  recipient: 'swiggy@upi',
  amount: 200,
  ...over,
});
const msg = (kind: 'message' | 'email', text: string): Action => ({ id: 'm1', agentId: 'agent', kind, recipient: 'x', text });
const analyze = (a: Action, c: Context) => ruleBasedAnalyzer.analyze(a, c);

describe('severity', () => {
  it('small payment to a known payee is level 0 with no feedback', () => {
    const r = analyze(act(), ctx());
    assert.equal(r.level, 0);
    assert.deepEqual(r.feedback, []);
  });

  it('payment to a new payee is level 2 and says so', () => {
    const r = analyze(act({ amount: 5_000 }), ctx({ newRecipient: true }));
    assert.equal(r.level, 2);
    assert.deepEqual(r.feedback, ["You've never paid this person before."]);
  });

  it('large payment to a new payee late at night reaches 4', () => {
    const r = analyze(act({ amount: 50_000 }), ctx({ newRecipient: true, localHour: 2 }));
    assert.equal(r.level, 4);
    assert.equal(r.feedback.length, 3);
  });

  it('a message containing an OTP is level 4', () => {
    const r = analyze(msg('message', 'OTP is 482913'), ctx());
    assert.equal(r.level, 4);
    assert.match(r.feedback[0] ?? '', /one-time code/);
  });

  it('an API key in an email is level 4', () => {
    const r = analyze(msg('email', 'key: sk-live_abcdefghijklmnop1234'), ctx());
    assert.equal(r.level, 4);
  });

  it('payment while on a call with an unknown number is level 4', () => {
    assert.equal(analyze(act(), ctx({ onCallWithUnknown: true })).level, 4);
  });

  it('a message to someone new is level 1 with no feedback', () => {
    const r = analyze(msg('message', 'hi'), ctx({ newRecipient: true }));
    assert.equal(r.level, 1);
    assert.deepEqual(r.feedback, []);
  });

  it('is deterministic', () => {
    const a = act({ amount: 20_000 });
    const c = ctx({ newRecipient: true });
    assert.deepEqual(analyze(a, c), analyze(a, c));
  });
});

describe('gate', () => {
  it('stricter takes the higher mode and the longer hold', () => {
    assert.deepEqual(stricter({ mode: 'unlock', holdSeconds: 5 }, { mode: 'countdown', holdSeconds: 60 }), {
      mode: 'unlock',
      holdSeconds: 60,
    });
  });
});

describe('policy', () => {
  const withRules: Policy = {
    ...DEFAULT_POLICY,
    rules: [
      { name: 'Swiggy', match: { recipients: ['swiggy@upi'], maxAmount: 1_000 }, gate: { mode: 'pass', holdSeconds: 0 } },
      { name: 'Night', match: { hours: { from: 23, to: 7 } }, gate: { mode: 'countdown', holdSeconds: 28_800 } },
    ],
  };

  it('defaults follow the severity level', () => {
    const a = act({ amount: 5_000 });
    const c = ctx({ newRecipient: true });
    assert.deepEqual(decide(DEFAULT_POLICY, a, c, analyze(a, c)), { mode: 'countdown', holdSeconds: 10 });
  });

  it('first matching user rule wins', () => {
    const a = act({ amount: 5_000, recipient: 'x@upi' });
    const c = ctx({ newRecipient: true, localHour: 23 });
    assert.deepEqual(decide(withRules, a, c, analyze(a, c)).holdSeconds, 28_800);
  });

  it('hours wrap past midnight', () => {
    const a = act({ recipient: 'x@upi' });
    const c = ctx({ localHour: 3 });
    assert.equal(decide(withRules, a, c, analyze(a, c)).holdSeconds, 28_800);
    const d = ctx({ localHour: 12 });
    assert.equal(decide(withRules, a, d, analyze(a, d)).mode, 'pass');
  });

  it('the critical floor applies even when a rule says pass', () => {
    const a = act(); // matches the Swiggy pass rule
    const c = ctx({ onCallWithUnknown: true });
    assert.equal(decide(withRules, a, c, analyze(a, c)).mode, 'unlock');
  });

  const loosened: Policy = {
    ...DEFAULT_POLICY,
    defaults: { ...DEFAULT_POLICY.defaults, 2: { mode: 'pass', holdSeconds: 0 } },
    loosenDelaySeconds: 0,
  };
  const newPayee = act({ amount: 5_000 });
  const c2 = ctx({ newRecipient: true });
  const a2 = analyze(newPayee, c2);

  it('loosening waits until effectiveAt', () => {
    const state = { active: DEFAULT_POLICY, pending: { policy: loosened, effectiveAt: 1_000 } };
    assert.equal(decideAt(state, 999, newPayee, c2, a2).mode, 'countdown');
    assert.equal(decideAt(state, 1_000, newPayee, c2, a2).mode, 'pass');
    assert.equal(settle(state, 1_000).pending, undefined);
  });

  it('tightening applies immediately', () => {
    const tightened: Policy = {
      ...DEFAULT_POLICY,
      defaults: { ...DEFAULT_POLICY.defaults, 0: { mode: 'countdown', holdSeconds: 5 } },
    };
    const state = { active: DEFAULT_POLICY, pending: { policy: tightened, effectiveAt: 1_000_000 } };
    const a = act();
    const c = ctx();
    assert.deepEqual(decideAt(state, 0, a, c, analyze(a, c)), { mode: 'countdown', holdSeconds: 5 });
  });
});
