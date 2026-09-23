import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { detectSource, formatReport, runImport } from '../src/import/run.ts';

const at = 1_756_697_400_000;
const adb = [
  `Row: 0 address=VM-HDFCBK, date=${at}, body=Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo RAVI KUMAR\nRef 526512345678`,
  `Row: 1 address=VM-HDFCBK, date=${at + 1000}, body=482913 is your OTP for txn of INR 1,250.00. Do not share.`,
  `Row: 2 address=+919800000000, date=${at + 2000}, body=card 4111 1111 1111 1111 cvv later`,
].join('\n');

describe('import run', () => {
  it('detects export formats', () => {
    assert.equal(detectSource(adb), 'adb_sms');
    assert.equal(detectSource('<?xml version="1.0"?><smses count="0"></smses>'), 'sms_backup_xml');
    assert.equal(detectSource('[{"header":"Google Pay","title":"Paid ₹1 to A","time":"2025-01-01T00:00:00Z"}]'), 'google_pay_takeout');
    assert.equal(detectSource('date,amount\n1,2'), 'unknown');
  });

  it('reports confidential data without ever printing it', () => {
    const r = runImport([{ name: 'sms.txt', text: adb }, { name: 'notes.csv', text: 'a,b' }], at);
    assert.equal(r.txns.length, 1);
    assert.equal(r.sensitive.total, 2);
    assert.equal(r.alarms.length, 1, 'card number is serious; OTP is not an alarm');
    const report = formatReport(r);
    assert.match(report, /CONFIDENTIAL DATA FOUND: 2 items/);
    assert.match(report, /notes\.csv: format not recognised/);
    assert.ok(!report.includes('482913'), 'OTP not printed');
    assert.ok(!report.includes('4111 1111 1111 1111') && !report.includes('4111111111111111'), 'card not printed');
    assert.ok(!JSON.stringify(r.profile).includes('4111'), 'nothing confidential in the profile');
  });
});
