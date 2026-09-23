// Formats seen in the first real import (AU Bank, Canara, promotional senders,
// PhonePe autopays). Names, amounts and numbers are invented.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { detectSource, formatReport, runImport } from '../src/import/run.ts';
import { isPromotional, looksLikeUnreadAlert, parseBankAlert, parseMandateAlert, senderBrand } from '../src/import/sms.ts';
import type { Sms } from '../src/import/types.ts';
import { detectSubscriptions, displayMerchant, nameAutopays, summariseAutopays } from '../src/subscriptions.ts';
import type { Txn } from '../src/import/types.ts';

const at = Date.UTC(2026, 8, 2, 6, 30);
const sms = (address: string, body: string, date = at): Sms => ({ address, date, body });
const DAY = 86_400_000;

describe('formats from the first real import', () => {
  it('reads AU Bank IMPS, UPI and interest credits', () => {
    const imps = parseBankAlert(sms('JM-AUBANK-S', 'Credited INR 2,64,000.00 to A/c X6810 on 02-SEP-2026 Ref IMPS-624518404655 -ANAND KUMAR R -IC. Bal INR 2,94,098.33.\n-AU Bank'));
    assert.deepEqual([imps?.direction, imps?.amount, imps?.counterparty, imps?.account], ['credit', 264_000, 'ANAND KUMAR R', 'XX6810']);
    const upi = parseBankAlert(sms('JM-AUBANK-S', 'Credited INR 30,000.00 to A/c X6810 on 02-SEP-2026 Ref UPI/CR/029831119297/PRIYA SHARMA. Bal INR 30,098.33.\n-AU Bank'));
    assert.equal(upi?.counterparty, 'PRIYA SHARMA');
    const interest = parseBankAlert(sms('JM-AUBANK-S', 'Credited INR 50.00 to A/c X6810 on 31-AUG-2026 Ref MONTHLY INTEREST PAYOUT. Bal INR 98.33.\n-AU Bank'));
    assert.equal(interest?.counterparty, 'MONTHLY INTEREST PAYOUT');
  });

  it('treats "shall be debited on" as a notice, not a payment or an unread alert', () => {
    const canara = sms('AD-CANBNK-S', 'Dear Customer, Unit Inspection Charges of Rs. 236 shall be debited on 05-SEP-26 from your Account xxxx579. Kindly ensure sufficient balance.');
    assert.equal(parseBankAlert(canara), null);
    assert.equal(looksLikeUnreadAlert(canara), false);
  });

  it('ignores promotional senders (-P)', () => {
    const promo = sms('JD-170714-P', 'Personal Loan with Low EMIs! Amount ready to be credited. Get Rs.10,000 - Rs.10,00,000* in minutes!');
    assert.ok(isPromotional('JD-170714-P'));
    assert.ok(!isPromotional('JM-AUBANK-S'));
    assert.equal(parseBankAlert(promo), null);
    assert.equal(looksLikeUnreadAlert(promo), false);
    assert.equal(parseMandateAlert(sms('JD-HOTSTR-P', 'AutoPay set up for JioHotstar — continue enjoying 3 months')), null);
  });

  it('does not take promo phrases as autopay merchants', () => {
    assert.equal(parseMandateAlert(sms('VM-HDFCBK-S', 'UPI AutoPay successfully set up for view details.')), null);
    assert.equal(parseMandateAlert(sms('VM-HDFCBK-S', 'UPI AutoPay successfully set up for continue enjoying 3 months.')), null);
  });

  it('shows hashed autopay IDs as unnamed', () => {
    assert.equal(displayMerchant('8790eaa9e74148729c3b59c0c9f27911@ybl'), 'Unnamed autopay (…@ybl)');
    assert.equal(displayMerchant('Netflix'), 'Netflix');
  });

  it('treats autopays silent for 60+ days as dormant', () => {
    const old = { at: at - 400 * DAY, event: 'created' as const, merchant: 'CULVER', amount: 399 };
    const recent = { at: at - 5 * DAY, event: 'upcoming' as const, merchant: 'NETFLIX', amount: 499 };
    const s = summariseAutopays([old, recent], at);
    assert.equal(s.find((a) => a.merchant === 'CULVER')?.status, 'dormant');
    assert.equal(s.find((a) => a.merchant === 'NETFLIX')?.status, 'active');
  });

  it('says so when an export is empty', () => {
    assert.equal(detectSource(''), 'empty');
    assert.match(formatReport(runImport([{ name: 'sms.txt', text: '' }], at)), /sms\.txt: the file is empty/);
  });

  it('lists every unread alert, redacted', () => {
    const dump = Array.from({ length: 8 }, (_, i) => `Row: ${i} address=VM-XYZBNK-S, date=${at + i}, body=Your a/c XX12 is debited INR 99 for thing ${i}. OTP: 123456`).join('\n');
    const r = runImport([{ name: 'sms.txt', text: dump }], at);
    assert.equal(r.unreadSamples.length, 5);
    assert.equal(r.unreadAll.length, 8);
    assert.ok(r.unreadAll.every((l) => !l.includes('123456')), 'redacted');
  });

  // ── Second run ────────────────────────────────────────────────────────────

  it('reads a merchant refund with no counterparty, using the sender', () => {
    const r = parseBankAlert(sms('AD-MMTRIP-S', 'Hi,\nYour refund for Booking ID NR1111222233334444 has been successfully credited and completed.\nRRN: OMR0000000000000000000000V\nRefund Amount: INR 1910.0\nRefund Mode: HDFC Bank Card (************1234)\nTeam MakeMytrip'));
    assert.deepEqual([r?.direction, r?.amount, r?.counterparty], ['credit', 1910, 'MakeMyTrip']);
    assert.equal(senderBrand('AD-MMTRIP-S'), 'MakeMyTrip');
    assert.equal(senderBrand('JD-170714-P'), undefined);
  });

  it('reads a bank charge and a "CODE -NAME" line', () => {
    const fee = parseBankAlert(sms('AX-AUBANK-S', 'Alert! Your AU Bank A/c No. X6810 has been Debited with INR 1.06 on 04-APR-2026 for SMS_Alert_Charge_JAN26_MAR26. Avl Bal: INR 674.89.\n- AU Bank'));
    assert.deepEqual([fee?.direction, fee?.amount, fee?.counterparty], ['debit', 1.06, 'SMS Alert Charge JAN26 MAR26']);
    const nda = parseBankAlert(sms('VM-AUBANK-S', 'Debited INR 9,000.00 from A/c X6810 on 15-NOV-2025\nNDA-1234-11112222 -SOME TRAVELS\nBal INR 1,29,372.09\nNot you? Call 180012001200 & dial 0\n-AU Bank'));
    assert.deepEqual([nda?.amount, nda?.counterparty], [9_000, 'SOME TRAVELS']);
  });

  it('skips marketing and failed payments, even from service senders', () => {
    const promo = sms('CP-SPECMK-S', 'Specsmakers - Payday sale! Rs.1000 credited in your SM Wallet. Get Flat 50% OFF. Use ABC123 T&C specsmakers.in/-ah');
    const failed = sms('AT-AIRINF', 'Hi, payment of Rs. 1296.82 has failed for Airtel Wi-Fi ID 0000000000. Any amount, if debited will be refunded to your source account within a day.');
    for (const s of [promo, failed]) {
      assert.equal(parseBankAlert(s), null);
      assert.equal(looksLikeUnreadAlert(s), false);
    }
  });

  it('merges one merchant under two long names, but not different short names', () => {
    const t = (at: number, key: string): Txn => ({ at, direction: 'debit', amount: 499, counterparty: key, key, source: 'sms' });
    const netflix = [0, 1, 2].map((m) => t(at + m * 30.44 * DAY, 'NETFLIX ENTERTAINMENT SERVICES INDIALLP'))
      .concat([3, 4, 5].map((m) => t(at + m * 30.44 * DAY, 'NETFLIX ENTERTAINMENT')));
    const subs = detectSubscriptions(netflix, at + 6 * 30.44 * DAY);
    assert.equal(subs.length, 1);
    assert.equal(subs[0]?.count, 6);
    const people = [0, 1, 2].map((m) => t(at + m * 30.44 * DAY, 'RAVI')).concat([0, 1, 2].map((m) => t(at + m * 30.44 * DAY + DAY, 'RAVIKUMAR M')));
    assert.equal(detectSubscriptions(people, at + 90 * DAY).length, 2);
  });

  it('names a hidden-merchant autopay from the matching charge', () => {
    const hidden = { merchant: '5b14ffd6b5594d3e898c921088fcab0b@ybl', amount: 499, nextDebitAt: at, lastEventAt: at - DAY, status: 'active' as const };
    const charge: Txn = { at: at + DAY, direction: 'debit', amount: 499, counterparty: 'Netflix Entertainment', key: 'NETFLIX ENTERTAINMENT', source: 'sms' };
    const other: Txn = { ...charge, amount: 500, counterparty: 'Someone' };
    assert.equal(nameAutopays([hidden], [charge, other])[0]?.likelyMerchant, 'Netflix Entertainment');
    assert.equal(nameAutopays([hidden], [other])[0]?.likelyMerchant, undefined);
  });
});
