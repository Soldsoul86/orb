import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseBankAlert, parseBankDate, parseMandateAlert } from '../src/import/sms.ts';
import type { Sms, Txn } from '../src/import/types.ts';
import { buildProfile, personalThresholds } from '../src/profile.ts';
import { createAnalyzer, DEFAULT_THRESHOLDS } from '../src/severity.ts';
import { detectSubscriptions, sameMerchant, summariseAutopays } from '../src/subscriptions.ts';

const DAY = 86_400_000;
const start = Date.UTC(2025, 0, 25, 6, 30); // 25 Jan 2025, noon IST
const now = Date.UTC(2025, 8, 23, 6, 30); // 23 Sep 2025
const debit = (at: number, amount: number, key: string): Txn => ({ at, direction: 'debit', amount, counterparty: key, key, source: 'sms' });

function history(): Txn[] {
  const t: Txn[] = [];
  const jitter = [0, 1, -1, 2, 0, -2, 1, 0];
  for (let m = 0; m < 8; m++) t.push(debit(start + (m * 30.44 + jitter[m]!) * DAY, 649, 'netflix.upi@icici'));
  for (let m = 0; m < 8; m++) t.push(debit(start + (m * 30.44 + 3) * DAY, m === 7 ? 139 : 119, 'spotify@axisbank'));
  for (let q = 0; q < 3; q++) t.push(debit(start + q * 91.3 * DAY, 4_500, 'cult.fit@ybl'));
  t.push(debit(start - 200 * DAY, 899, 'godaddy@razorpay'), debit(start + 165 * DAY, 899, 'godaddy@razorpay'));
  for (let m = 0; m < 4; m++) t.push(debit(start + m * 30.44 * DAY, 299, 'hotstar@paytm')); // stopped in April
  for (let m = 0; m < 4; m++) t.push(debit(start + m * 30.44 * DAY, 75, 'apple.icloud@hdfcbank'));
  t.push(debit(start + (3 * 30.44 + 150) * DAY, 75, 'apple.icloud@hdfcbank')); // back after 5 months
  for (let d = 0; d < 200; d++) t.push(debit(start + d * DAY, 300 + (d % 5) * 40, 'bigbasket@ybl'));
  t.push(debit(start, 1_200, 'ravi.k@okaxis'), debit(start + 10 * DAY, 1_200, 'ravi.k@okaxis'), debit(start + 55 * DAY, 1_200, 'ravi.k@okaxis'));
  return t;
}

describe('subscription detection', () => {
  const subs = detectSubscriptions(history(), now);
  const get = (key: string) => subs.find((s) => s.key === key);

  it('finds monthly, quarterly and yearly charges with their usual amount', () => {
    assert.equal(get('netflix.upi@icici')?.cycle, 'monthly');
    assert.equal(get('netflix.upi@icici')?.usualAmount, 649);
    assert.equal(get('cult.fit@ybl')?.cycle, 'quarterly');
    assert.equal(get('godaddy@razorpay')?.cycle, 'yearly');
  });

  it('predicts the next charge', () => {
    const n = get('netflix.upi@icici')!;
    const days = (n.nextDueAt - n.lastAt) / DAY;
    assert.ok(days > 29 && days < 32);
    assert.equal(n.status, 'active');
  });

  it('does not treat daily groceries or irregular payments as subscriptions', () => {
    assert.equal(get('bigbasket@ybl'), undefined);
    assert.equal(get('ravi.k@okaxis'), undefined);
  });

  it('flags a price change', () => {
    assert.deepEqual(get('spotify@axisbank')?.priceChange?.from, 119);
    assert.deepEqual(get('spotify@axisbank')?.priceChange?.to, 139);
    assert.equal(get('netflix.upi@icici')?.priceChange, undefined);
  });

  it('marks a stopped subscription as lapsed', () => {
    assert.equal(get('hotstar@paytm')?.status, 'lapsed');
  });

  it('flags a charge that restarted after a long gap', () => {
    const icloud = get('apple.icloud@hdfcbank');
    assert.ok(icloud);
    assert.ok((icloud.restartedAfterDays ?? 0) >= 140);
  });

  it('orders by monthly cost', () => {
    const monthly = subs.map((s) => s.monthly);
    assert.deepEqual(monthly, [...monthly].sort((a, b) => b - a));
    assert.ok(Math.abs(get('cult.fit@ybl')!.monthly - 1_500) < 20, 'quarterly ₹4,500 ≈ ₹1,500 a month');
  });
});

// Autopay wordings modelled on bank alerts; merchants and numbers invented.
const at = Date.UTC(2025, 8, 20, 6, 30);
const sms = (body: string, date = at): Sms => ({ address: 'VM-HDFCBK', date, body });
const CREATED = sms('UPI AutoPay mandate successfully created for NETFLIX of Rs 649.00, frequency Monthly. -HDFC Bank');
const UPCOMING = sms('Dear Customer, Rs.649.00 will be debited on 25-09-2025 from your A/c XX1234 towards NETFLIX UPI AutoPay. -HDFC Bank', at + DAY);
const REVOKED = sms('Your UPI AutoPay mandate for Spotify has been revoked successfully. -ICICI Bank', at + 2 * DAY);
const EMANDATE = sms('E-mandate registered successfully for SBI MUTUAL FUND, max amount Rs 10,000.00, frequency Monthly. -SBI', at + 3 * DAY);

describe('autopay alerts', () => {
  it('reads set-up, upcoming and cancelled autopays', () => {
    assert.deepEqual(
      [CREATED, UPCOMING, REVOKED, EMANDATE].map((s) => {
        const m = parseMandateAlert(s);
        return m && [m.event, m.merchant, m.amount ?? null, m.frequency ?? null];
      }),
      [
        ['created', 'NETFLIX', 649, 'monthly'],
        ['upcoming', 'NETFLIX', 649, null],
        ['revoked', 'Spotify', null, null],
        ['created', 'SBI MUTUAL FUND', 10_000, 'monthly'],
      ],
    );
  });

  it('reads the due date of an upcoming debit', () => {
    assert.equal(parseMandateAlert(UPCOMING)?.dueAt, Date.UTC(2025, 8, 25, 6, 30));
    assert.equal(parseBankDate('on 25-Sep-25'), Date.UTC(2025, 8, 25, 6, 30));
    assert.equal(parseBankDate('no date here'), undefined);
  });

  it('does not count a "will be debited" notice as a payment', () => {
    assert.equal(parseBankAlert(UPCOMING), null);
  });

  it('ignores messages that are not about autopays', () => {
    assert.equal(parseMandateAlert(sms('Sent Rs.500.00 From HDFC Bank A/C *1234 To RAVI KUMAR')), null);
  });

  it('summarises each autopay by its latest event', () => {
    const autopays = summariseAutopays([CREATED, UPCOMING, REVOKED, EMANDATE].map((s) => parseMandateAlert(s)!));
    const netflix = autopays.find((a) => sameMerchant(a.merchant, 'netflix'));
    assert.equal(netflix?.status, 'active');
    assert.equal(netflix?.nextDebitAt, Date.UTC(2025, 8, 25, 6, 30));
    assert.equal(autopays.find((a) => a.merchant === 'Spotify')?.status, 'revoked');
    assert.equal(autopays.length, 3);
  });

  it('matches merchant names loosely', () => {
    assert.ok(sameMerchant('NETFLIX', 'netflix.upi@icici'));
    assert.ok(sameMerchant('Netflix India', 'NETFLIX'));
    assert.ok(!sameMerchant('Net', 'netflix'));
    assert.ok(!sameMerchant('SPOTIFY', 'NETFLIX'));
  });
});

describe('lock checks from subscriptions', () => {
  const profile = buildProfile(history(), now, 330);
  const analyzer = createAnalyzer(personalThresholds(profile, DEFAULT_THRESHOLDS));
  const ctx = { localHour: 14, newRecipient: false, onCallWithUnknown: false };

  it('flags a subscription charging more than usual', () => {
    const r = analyzer.analyze({ id: 'a', agentId: 'you', kind: 'payment', recipient: 'netflix.upi@icici', amount: 799 }, ctx);
    assert.ok(r.findings.some((f) => f.code === 'subscription_change'));
    assert.ok(r.feedback.some((f) => /usually charges ₹649 monthly; this is ₹799/.test(f)));
  });

  it('lets the usual renewal through quietly', () => {
    const r = analyzer.analyze({ id: 'a', agentId: 'you', kind: 'payment', recipient: 'netflix.upi@icici', amount: 649 }, ctx);
    assert.equal(r.level, 0);
  });

  it('holds a new autopay for the fingerprint', () => {
    const r = analyzer.analyze({ id: 'a', agentId: 'you', kind: 'mandate', recipient: 'quickloan@ybl', amount: 5_000 }, { ...ctx, newRecipient: true });
    assert.equal(r.level, 3);
    assert.match(r.feedback.join(' '), /take money from you later without asking/);
  });
});
