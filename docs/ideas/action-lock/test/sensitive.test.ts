import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { redact, scanSensitive, sensitiveReport } from '../src/import/sensitive.ts';

const kinds = (text: string) => scanSensitive(text).map((h) => h.kind);

describe('sensitive data', () => {
  it('finds OTPs in the usual wordings', () => {
    assert.deepEqual(kinds('482913 is your OTP for txn of INR 1,250 at SWIGGY'), ['otp']);
    assert.deepEqual(kinds('Your OTP for login is 771204. Do not share.'), ['otp']);
    assert.deepEqual(kinds('OTP: 5521'), ['otp']);
    assert.deepEqual(kinds('Use OTP 90817 to verify'), ['otp']);
  });

  it('does not treat amounts in bank alerts as OTPs', () => {
    assert.deepEqual(kinds('Sent Rs.5000.00 from A/C *1234. Never share your OTP with anyone.'), []);
    assert.deepEqual(kinds('OTP for txn of INR 1250 will be sent'), []);
  });

  it('finds card numbers only when the checksum passes', () => {
    assert.deepEqual(kinds('card 4111 1111 1111 1111 exp 12/29'), ['card_number']);
    assert.deepEqual(kinds('card 4111 1111 1111 1112'), []);
  });

  it('finds PAN, and Aadhaar only in context or printed form', () => {
    assert.deepEqual(kinds('PAN ABCPE1234F linked'), ['pan']);
    assert.deepEqual(kinds('Aadhaar: 234567890124'), ['aadhaar']);
    assert.deepEqual(kinds('2345 6789 0124'), ['aadhaar']);
  });

  it('does not mistake a UPI reference number for Aadhaar', () => {
    // 526512345603 passes the Aadhaar checksum but is a UPI reference.
    assert.deepEqual(kinds('Sent Rs.500 to RAVI Ref 526512345603'), []);
  });

  it('finds full account numbers but not masked ones', () => {
    assert.deepEqual(kinds('A/c no. 50100123456789 credited'), ['account_number']);
    assert.deepEqual(kinds('A/c XX1234 debited'), []);
  });

  it('finds recovery phrases and key material, not transaction hashes', () => {
    const phrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    assert.deepEqual(kinds(`backup\n${phrase}\n`), ['recovery_phrase']);
    assert.deepEqual(kinds(`private key: 0x${'ab12'.repeat(16)}`), ['private_key']);
    assert.deepEqual(kinds(`tx hash 0x${'ab12'.repeat(16)}`), []);
    assert.deepEqual(kinds('export OPENAI=sk-live_abcdefghijklmnop1234'), ['api_key']);
    assert.deepEqual(kinds('password: hunter22'), ['password']);
  });

  it('does not flag an ordinary sentence as a recovery phrase', () => {
    assert.deepEqual(kinds('please send the report by friday'), []);
  });

  it('redacts in place and reports counts with masked examples only', () => {
    const text = 'OTP: 482913. Card 4111 1111 1111 1111. PAN ABCPE1234F';
    const hits = scanSensitive(text);
    const out = redact(text, hits);
    assert.ok(!out.includes('482913') && !out.includes('4111 1111') && !out.includes('ABCPE1234F'));
    assert.match(out, /1111/); // last four of the card kept
    const report = sensitiveReport([hits, scanSensitive('OTP: 1234')]);
    assert.equal(report.total, 4);
    assert.equal(report.byKind.find((k) => k.kind === 'otp')?.count, 2);
    assert.ok(report.byKind.every((k) => k.examples.every((e) => !/\d{5,}/.test(e.replace(/•/g, '')))));
  });
});
