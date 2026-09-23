// Formats seen in the first real import (AU Bank, Canara, promotional senders,
// PhonePe autopays). Names, amounts and numbers are invented.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { detectSource, formatReport, runImport } from '../src/import/run.ts';
import { isPromotional, looksLikeUnreadAlert, parseBankAlert, parseMandateAlert } from '../src/import/sms.ts';
import type { Sms } from '../src/import/types.ts';
import { displayMerchant, summariseAutopays } from '../src/subscriptions.ts';

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
});
