import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { looksLikeUnreadAlert, parseAdbSms, parseBankAlert, parseSmsBackupXml } from '../src/import/sms.ts';
import { parseGooglePayActivity } from '../src/import/takeout.ts';
import type { Sms } from '../src/import/types.ts';

// Wordings modelled on real Indian bank alerts; all names, numbers and IDs invented.
const at = 1_758_555_845_000;
const sms = (address: string, body: string): Sms => ({ address, date: at, body, type: 1 });

const HDFC = sms('VM-HDFCBK', 'Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo RAVI KUMAR\nOn 22/09/25\nRef 526512345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808');
const SBI = sms('AX-SBIUPI', 'Dear UPI user A/C X1234 debited by 500.0 on date 22Sep25 trf to RAVI KUMAR Refno 526512345678. If not u? call 1800111109. -SBI');
const ICICI = sms('JD-ICICIT', 'ICICI Bank Acct XX234 debited for Rs 500.00 on 22-Sep-25; RAVI KUMAR credited. UPI:526512345678. Call 18002662 for dispute. SMS BLOCK 234 to 9215676766.');
const AXIS = sms('VK-AXISBK', 'INR 500.00 debited\nA/c no. XX1234\n22-09-25, 21:14:05\nUPI/P2A/526512345678/RAVI KUMAR\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank');
const KOTAK = sms('BZ-KOTAKB', 'Sent Rs.500.00 from Kotak Bank AC X1234 to ravi.k@okaxis on 22-09-25.UPI Ref 526512345678. Not you, https://kotak.com/KBANKT/Fraud');
const CREDIT = sms('VM-HDFCBK', 'Money Received - INR 2,000.00 in HDFC Bank A/c xx1234 on 22-09-25 by VPA priya.s@oksbi (UPI Ref No 526512349999)');

describe('bank alerts', () => {
  for (const [name, s] of [['HDFC', HDFC], ['SBI', SBI], ['ICICI', ICICI], ['Axis', AXIS]] as const) {
    it(`reads a ${name} UPI debit`, () => {
      const t = parseBankAlert(s);
      assert.ok(t, `${name} not parsed`);
      assert.equal(t.direction, 'debit');
      assert.equal(t.amount, 500);
      assert.equal(t.counterparty, 'RAVI KUMAR');
      assert.equal(t.key, 'RAVI KUMAR');
      assert.equal(t.ref, '526512345678');
      assert.match(t.account ?? '', /^XX\d{3,4}$/);
      assert.equal(t.at, at);
    });
  }

  it('uses the UPI ID as the key when the alert has one', () => {
    const t = parseBankAlert(KOTAK);
    assert.ok(t);
    assert.equal(t.vpa, 'ravi.k@okaxis');
    assert.equal(t.key, 'ravi.k@okaxis');
    assert.equal(t.bank, 'Kotak Bank');
  });

  it('reads a credit', () => {
    const t = parseBankAlert(CREDIT);
    assert.ok(t);
    assert.equal(t.direction, 'credit');
    assert.equal(t.amount, 2000);
    assert.equal(t.vpa, 'priya.s@oksbi');
  });

  it('reads a card spend and trims trailing punctuation from names', () => {
    const card = parseBankAlert(sms('VM-HDFCBK', 'Rs.1,250.00 spent on HDFC Bank Card x4417 at SWIGGY on 2025-09-22:21:14:05. Not You? Call 18002586161'));
    assert.equal(card?.counterparty, 'SWIGGY');
    assert.equal(card?.account, 'XX4417');
    const salary = parseBankAlert(sms('VM-ICICIB', 'Dear Customer, Acct XX234 is credited with Rs 45,000.00 on 01-Sep-25 from ACME TECH PVT LTD. UPI:524411112222-ICICI Bank.'));
    assert.equal(salary?.counterparty, 'ACME TECH PVT LTD');
    assert.equal(salary?.direction, 'credit');
  });

  it('ignores OTPs and offers', () => {
    assert.equal(parseBankAlert(sms('VM-HDFCBK', '482913 is your OTP for txn of INR 1,250.00 at SWIGGY on HDFC Bank card xx4417. Do not share.')), null);
    assert.equal(parseBankAlert(sms('VM-HDFCBK', 'You are eligible for a pre-approved loan of Rs 5,00,000. Apply now.')), null);
  });

  it('flags alerts it could not read, so the format can be added', () => {
    const odd = sms('VM-HDFCBK', 'Your a/c XX12 is debited INR 99 for GoogleCloud autopay');
    assert.equal(parseBankAlert(odd), null);
    assert.equal(looksLikeUnreadAlert(odd), true);
    assert.equal(looksLikeUnreadAlert(HDFC), false);
  });
});

describe('SMS exports', () => {
  it('reads ADB output with the body last (--projection address:date:body)', () => {
    const dump = `Row: 0 address=VM-HDFCBK, date=${at}, body=${HDFC.body}\nRow: 1 address=AX-SBIUPI, date=${at + 1000}, body=${SBI.body}`;
    const rows = parseAdbSms(dump);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.body, HDFC.body);
    assert.equal(rows[1]?.address, 'AX-SBIUPI');
  });

  it('reads ADB output with every column, body in the middle', () => {
    const dump = `Row: 0 _id=12, thread_id=3, address=VM-HDFCBK, person=NULL, date=${at}, date_sent=0, protocol=0, read=1, status=-1, type=1, reply_path_present=0, subject=NULL, body=Sent Rs.500.00, done, service_center=+919810000000, locked=0, sub_id=1, error_code=0, creator=com.google.android.apps.messaging, seen=1`;
    const [row] = parseAdbSms(dump);
    assert.equal(row?.body, 'Sent Rs.500.00, done');
    assert.equal(row?.date, at);
    assert.equal(row?.type, 1);
  });

  it('reads SMS Backup & Restore XML, decoding entities and newlines', () => {
    const xml = `<?xml version='1.0'?><smses count="1"><sms protocol="0" address="VM-HDFCBK" date="${at}" type="1" body="Sent Rs.500.00&#10;From HDFC Bank A/C *1234&#10;To RAVI &amp; SONS&#10;Ref 526512345678" read="1" /></smses>`;
    const [row] = parseSmsBackupXml(xml);
    assert.equal(row?.body, 'Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo RAVI & SONS\nRef 526512345678');
    assert.equal(parseBankAlert(row!)?.counterparty, 'RAVI & SONS');
  });
});

describe('Google Pay (Takeout)', () => {
  it('reads payments and receipts, and counts unknown wordings', () => {
    const json = JSON.stringify([
      { header: 'Google Pay', title: 'Paid ₹500.00 to Ravi Kumar', time: '2025-09-22T15:44:05.000Z', products: ['Google Pay'] },
      { header: 'Google Pay', title: 'Received ₹2,000.00 from priya.s@oksbi', time: '2025-09-21T10:00:00.000Z', products: ['Google Pay'] },
      { header: 'Google Pay', title: 'Paid ₹180 to Corner Cafe using Bank Account XXXXXX1234', time: '2025-09-20T08:30:00.000Z' },
      { header: 'Google Pay', title: 'Used Google Pay', time: '2025-09-19T08:30:00.000Z' },
      { header: 'YouTube', title: 'Watched something', time: '2025-09-19T08:30:00.000Z' },
    ]);
    const r = parseGooglePayActivity(json);
    assert.equal(r.txns.length, 3);
    assert.equal(r.unread, 1);
    assert.deepEqual(
      r.txns.map((t) => [t.direction, t.amount, t.key]),
      [['debit', 500, 'RAVI KUMAR'], ['credit', 2000, 'priya.s@oksbi'], ['debit', 180, 'CORNER CAFE']],
    );
  });
});
