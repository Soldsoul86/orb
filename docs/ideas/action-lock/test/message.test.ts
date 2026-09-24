import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { checkMessage, findings, luhn } from '../src/orb/message.ts';
import { messageVectors } from './message-cases.ts';

describe('message guard', () => {
  it('the shared cases file matches (run npm run guard-vectors after changing it)', () => {
    const onDisk = JSON.parse(readFileSync(new URL('./message-vectors.json', import.meta.url), 'utf8'));
    assert.deepEqual(onDisk, JSON.parse(JSON.stringify(messageVectors())));
  });

  it('finds what should not be sent, and leaves ordinary messages alone', () => {
    assert.deepEqual(findings('5pm today at Dolphins koramangala'), []);
    assert.deepEqual(findings('1500'), []);
    assert.deepEqual(findings('482913'), ['code']);
    assert.deepEqual(findings('my upi pin is 2468'), ['pin']);
    assert.deepEqual(findings('card 4111 1111 1111 1111'), ['card']);
    assert.deepEqual(findings('order id 1234567890123456'), []);
    assert.deepEqual(findings('I forgot my password again'), []);
    assert.deepEqual(findings('wifi password: Tiger@2026'), ['password']);
    assert.ok(luhn('4111111111111111'));
  });

  it('is stricter with strangers and during calls', () => {
    assert.deepEqual([checkMessage('482913', { unknownSender: false, onCall: false }).mode, checkMessage('482913', { unknownSender: false, onCall: false }).seconds], ['wait', 10]);
    const s = checkMessage('the otp is 4829', { unknownSender: true, onCall: false });
    assert.deepEqual([s.mode, s.seconds], ['confirm', 20]);
    assert.match(s.reasons.join(' '), /isn't in your contacts/);
    assert.equal(checkMessage('hello', { unknownSender: true, onCall: true }).mode, 'pass');
  });
});
