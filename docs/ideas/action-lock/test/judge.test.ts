import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { looksLikeScam } from '../src/import/scam.ts';
import type { Txn } from '../src/import/types.ts';
import { judge } from '../src/judge.ts';
import { buildProfile, findPayee } from '../src/profile.ts';

const DAY = 86_400_000;
const start = Date.UTC(2025, 0, 1, 6, 30);
const debit = (at: number, amount: number, name: string, vpa?: string): Txn => ({
  at, direction: 'debit', amount, counterparty: name, key: vpa ?? name.toUpperCase(), ...(vpa ? { vpa } : {}), source: 'sms',
});
// 120 days: a chai shop by name, groceries by UPI ID; payments between 12:00 and 02:00 IST.
const history: Txn[] = [];
for (let d = 0; d < 120; d++) {
  history.push(debit(start + d * DAY + (d % 8) * 3_600_000, 150 + (d % 4) * 10, 'RAVIKUMAR M'));
  history.push(debit(start + d * DAY + (8 + (d % 7)) * 3_600_000, 300 + (d % 5) * 20, 'Zepto', 'zepto@ybl'));
}
const profile = buildProfile(history, start + 120 * DAY, 330);

describe('finding a payee in your history', () => {
  it('by UPI ID, exact name, or a long name that begins the other', () => {
    assert.equal(findPayee(profile, 'zepto@ybl')?.count, 120);
    assert.equal(findPayee(profile, 'ravi.k@okaxis', 'RAVIKUMAR M')?.count, 120);
    assert.equal(findPayee(profile, 'ravi.k@okaxis', 'Ravikumar Murthy')?.name, 'RAVIKUMAR M');
  });

  it('not on short or different names', () => {
    assert.equal(findPayee(profile, 'ravi@okaxis', 'Ravi'), undefined);
    assert.equal(findPayee(profile, 'someone@ybl', 'Priya Sharma'), undefined);
  });
});

describe('judging a payment with your profile', () => {
  it('lets a usual payment to a known payee through at once', () => {
    const j = judge(profile, { kind: 'payment', to: 'ravi.k@okaxis', name: 'RAVIKUMAR M', amount: 160, localHour: 15 });
    assert.equal(j.newRecipient, false);
    assert.equal(j.gate.mode, 'pass');
  });

  it('holds a large payment to a new payee for the fingerprint, with your numbers', () => {
    const j = judge(profile, { kind: 'payment', to: 'goa-trips@okxyz', amount: 5_000, localHour: 14 });
    assert.equal(j.analysis.level, 3);
    assert.equal(j.gate.mode, 'unlock');
    assert.ok(j.analysis.feedback.some((f) => /× your usual payment/.test(f)));
  });

  it('uses generic rules without a profile', () => {
    const j = judge(null, { kind: 'payment', to: 'goa-trips@okxyz', amount: 5_000, localHour: 14 });
    assert.equal(j.personal, false);
    assert.equal(j.analysis.level, 2);
  });

  it('holds a new autopay for the fingerprint', () => {
    assert.equal(judge(profile, { kind: 'mandate', to: 'quickloan@ybl', amount: 1_500, localHour: 14 }).gate.mode, 'unlock');
  });
});

describe('scam lures from registered senders', () => {
  it('flags "ready to be credited" behind a link from any sender', () => {
    assert.ok(looksLikeScam({ address: 'VK-FINSAB', date: 0, body: 'Dear Customer, Rs.4,50,000 is ready to credited in XXX1257 by Completing KYC. Submit details for disbursal http://2lm.in/u5Om0v AB FINANCE' }));
    assert.ok(looksLikeScam({ address: 'VA-INLGSP', date: 0, body: 'Dear Customer, Rs.5000 Bonus is ready to be Credited. Click - http://1kx.in/x8gohc' }));
  });

  it('does not flag a real bank credit', () => {
    assert.equal(looksLikeScam({ address: 'JM-AUBANK-S', date: 0, body: 'Credited INR 30,000.00 to A/c X6810 on 02-SEP-2026 Ref UPI/CR/0298/PRIYA. Bal INR 30,098.33. -AU Bank' }), null);
  });
});
