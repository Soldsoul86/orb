import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { Txn } from '../src/import/types.ts';
import { buildProfile, knowsPayee, mergeDuplicates, MIN_HISTORY, personalThresholds } from '../src/profile.ts';
import { createAnalyzer, DEFAULT_THRESHOLDS } from '../src/severity.ts';

const IST = 330;
// 09:00 IST on 1 Sep 2025, in UTC ms.
const day0 = Date.UTC(2025, 8, 1, 3, 30);
const H = 3_600_000;

const pay = (at: number, amount: number, key: string, extra: Partial<Txn> = {}): Txn => ({
  at, direction: 'debit', amount, counterparty: key, key, source: 'sms', ...extra,
});

/** 60 days of a steady life: groceries, food, rent; payments only 09:00–22:00 IST. */
function history(): Txn[] {
  const t: Txn[] = [];
  for (let d = 0; d < 60; d++) {
    const base = day0 + d * 24 * H;
    t.push(pay(base + 2 * H, 300 + (d % 5) * 50, 'bigbasket@ybl'));
    if (d % 2 === 0) t.push(pay(base + 11 * H, 450, 'swiggy@icici'));
    if (d % 30 === 0) t.push(pay(base + 1 * H, 25_000, 'landlord@okaxis'));
  }
  return t;
}

describe('profile', () => {
  it('summarises your payees, amounts and hours', () => {
    const p = buildProfile(history(), 0, IST);
    assert.equal(p.debits.count, 60 + 30 + 2);
    assert.equal(p.payees[0]?.key, 'bigbasket@ybl');
    assert.equal(p.payees.find((x) => x.key === 'landlord@okaxis')?.max, 25_000);
    assert.equal(p.hourly.reduce((s, n) => s + n, 0), p.debits.count);
    assert.equal(p.hourly[11], 60); // BigBasket at 11:00 IST every day
    assert.ok(p.debits.p90 <= 500);
  });

  it('finds your quiet hours', () => {
    const p = buildProfile(history(), 0, IST);
    // Payments happen 10:00, 11:00 and 20:00 IST only; the longest quiet stretch is 21:00–10:00.
    assert.deepEqual(p.quietHours, { from: 21, to: 10 });
  });

  it('merges the same payment seen in SMS and in Google Pay', () => {
    const sms = pay(day0, 500, 'ravi.k@okaxis', { vpa: 'ravi.k@okaxis', ref: '526512345678' });
    const gpay = pay(day0 + 60_000, 500, 'RAVI KUMAR', { source: 'google_pay' });
    const other = pay(day0 + 2 * H, 500, 'RAVI KUMAR', { source: 'google_pay' });
    const merged = mergeDuplicates([gpay, sms, other]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.vpa, 'ravi.k@okaxis', 'keeps the copy with the UPI ID');
  });

  it('does not merge two real payments from the same source', () => {
    assert.equal(mergeDuplicates([pay(day0, 500, 'a'), pay(day0 + 60_000, 500, 'a')]).length, 2);
  });

  it('knows payees by UPI ID or name', () => {
    const p = buildProfile(history(), 0, IST);
    assert.ok(knowsPayee(p, 'Swiggy@ICICI'));
    assert.ok(!knowsPayee(p, 'goa-stays@ybl'));
  });
});

describe('personalised severity', () => {
  const p = buildProfile(history(), 0, IST);
  const analyzer = createAnalyzer(personalThresholds(p, DEFAULT_THRESHOLDS));
  const act = (amount: number, recipient: string) => ({ id: 'x', agentId: 'you', kind: 'payment' as const, recipient, amount });

  it('calls an amount large relative to your usual, not a fixed ₹10,000', () => {
    const r = analyzer.analyze(act(5_000, 'goa-stays@ybl'), { localHour: 14, newRecipient: true, onCallWithUnknown: false });
    assert.equal(r.level, 3, 'new payee + unusually large for you');
    assert.ok(r.feedback.some((f) => /× your usual payment/.test(f)));
    // Generic rules would have seen ₹5,000 as ordinary.
    assert.equal(createAnalyzer(DEFAULT_THRESHOLDS).analyze(act(5_000, 'goa-stays@ybl'), { localHour: 14, newRecipient: true, onCallWithUnknown: false }).level, 2);
  });

  it('uses your quiet hours instead of midnight to 6 am', () => {
    const at23 = analyzer.analyze(act(400, 'swiggy@icici'), { localHour: 23, newRecipient: false, onCallWithUnknown: false });
    assert.ok(at23.findings.some((f) => f.code === 'late_night'));
    const at14 = analyzer.analyze(act(400, 'swiggy@icici'), { localHour: 14, newRecipient: false, onCallWithUnknown: false });
    assert.ok(!at14.findings.some((f) => f.code === 'late_night'));
  });

  it('falls back to the generic rules until there is enough history', () => {
    const thin = buildProfile(history().slice(0, MIN_HISTORY - 1), 0, IST);
    assert.equal(personalThresholds(thin, DEFAULT_THRESHOLDS), DEFAULT_THRESHOLDS);
  });
});
