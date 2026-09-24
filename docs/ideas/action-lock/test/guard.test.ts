import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runImport } from '../src/import/run.ts';
import { buildGuardTable, decideGuard, findGuardPayee } from '../src/orb/guard.ts';
import { answer, buildTwin } from '../src/orb/twin.ts';
import { TABLE, vectors } from './guard-cases.ts';

describe('pay guard', () => {
  it('the shared cases file matches what the guard decides (run npm run guard-vectors after changing it)', () => {
    const onDisk = JSON.parse(readFileSync(new URL('./guard-vectors.json', import.meta.url), 'utf8'));
    assert.deepEqual(onDisk, JSON.parse(JSON.stringify(vectors())));
  });

  it('known payees at their usual amount pass; new payees wait; large new payments need the fingerprint', () => {
    assert.equal(decideGuard(TABLE, { name: 'TARUN SHARMA', amount: 3_000, hour: 13 }).mode, 'pass');
    const fresh = decideGuard(TABLE, { name: 'NEW PERSON', amount: 500, hour: 13 });
    assert.deepEqual([fresh.mode, fresh.seconds], ['wait', 10]);
    const big = decideGuard(TABLE, { name: 'NEW PERSON', amount: 25_000, hour: 13 });
    assert.deepEqual([big.mode, big.seconds], ['confirm', 30]);
    assert.match(big.reasons.join(' '), /₹25,000 is a large amount; your usual payment is ₹180/);
  });

  it('matches names loosely but never on short fragments', () => {
    assert.equal(findGuardPayee(TABLE, 'Tarun Sharma')?.name, 'TARUN SHARMA');
    assert.equal(findGuardPayee(TABLE, 'SWIGGY LIMITED BANGALORE')?.name, 'SWIGGY LIMITED');
    assert.equal(findGuardPayee(TABLE, 'SWIG'), undefined);
  });

  it('builds the table from your history; confirmed family may receive more without a wait, guesses never loosen it', () => {
    const now = Date.UTC(2026, 8, 24, 6);
    const rows = [0, 1, 2, 3, 4].map((i) => `Row: ${i} address=JM-HDFCBK-S, date=${now - (i + 1) * 86_400_000}, body=Sent Rs.1000.00\nFrom HDFC Bank A/C *6111\nTo ASHA MENON\nOn 21/08/26\nRef 30489344922${i}\nNot You?`);
    const r = runImport([{ name: 'sms.txt', text: rows.join('\n') }], now);
    const guessed = buildGuardTable(r.profile, buildTwin(r, [], now), now);
    const confirmed = buildGuardTable(r.profile, buildTwin(r, [answer('relation:ASHA MENON', 'family', now, 0)], now), now);
    const g = guessed.payees.find((p) => p.name === 'ASHA MENON')!;
    const c = confirmed.payees.find((p) => p.name === 'ASHA MENON')!;
    assert.equal(g.passUpTo, 2_000);
    assert.equal(c.relation, 'family');
    assert.ok(c.passUpTo > g.passUpTo);
    assert.equal(decideGuard(guessed, { name: 'ASHA MENON', amount: 15_000, hour: 13 }).mode, 'confirm');
    assert.equal(decideGuard(confirmed, { name: 'ASHA MENON', amount: 15_000, hour: 13 }).mode, 'pass');
  });

  it("says so when it couldn't read the payee", () => {
    assert.deepEqual(decideGuard(TABLE, { amount: 700, hour: 13 }).reasons, ["Orb couldn't read who this payment is to."]);
  });
});
