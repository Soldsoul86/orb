import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { runImport } from '../src/import/run.ts';
import { baselineFacts, baselinePrompt, inferenceRecord, readReply, routeModel, rulesBaseline, RULES } from '../src/orb/reason.ts';
import { buildTwin } from '../src/orb/twin.ts';

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 24, 6);
let row = 0;
const sms = (at: number, body: string) => `Row: ${row++} address=JM-HDFCBK-S, date=${at}, body=${body}`;
const lines: string[] = [];
for (let i = 0; i < 40; i++) lines.push(sms(now - (i * 2 + 1) * DAY, `Sent Rs.300.00\nFrom HDFC Bank A/C *6111\nTo SWIGGY LIMITED\nOn 21/08/26\nRef 3048934492${String(i).padStart(2, '0')}\nNot You?`));
lines.push(sms(now - 3 * DAY, 'Sent Rs.25000.00\nFrom HDFC Bank A/C *6111\nTo RAMESH IYER\nOn 21/09/26\nRef 504893440001\nNot You?'));
const r = runImport([{ name: 'sms.txt', text: lines.join('\n') }], now);
const twin = buildTwin(r, [], now);

describe('reasoning layer', () => {
  const f = baselineFacts(r, twin, now, { paused: 2, notPaid: 1, messagesPaused: 0 });

  it('builds facts with people masked and organisations named', () => {
    const all = f.facts.join('\n');
    assert.doesNotMatch(all, /RAMESH/);
    assert.match(all, /person A: ₹25,000 in 1 payment this month/);
    assert.match(all, /SWIGGY LIMITED/);
    assert.equal(f.labels['person A'], 'RAMESH IYER');
    assert.match(all, /paused 2 payments this week; 1 were not made/);
    assert.doesNotMatch(baselinePrompt(f), /RAMESH/);
  });

  it('checks a reply and maps labels back on the phone', () => {
    const reply = 'Sure! {"notes":[{"text":"person A received ₹25,000 for the first time this month.","about":"person A"},{"text":"person Q is new.","about":"person Q"}],"questions":[{"text":"Is person A your landlord?","about":"person A"}]}';
    const p = readReply(reply, f);
    assert.deepEqual(p, [
      { kind: 'note', text: 'RAMESH IYER received ₹25,000 for the first time this month.', about: 'RAMESH IYER' },
      { kind: 'question', text: 'Is RAMESH IYER your landlord?', about: 'RAMESH IYER' },
    ]); // "person Q" was never given: dropped
    assert.deepEqual(readReply('not json at all', f), []);
    assert.deepEqual(readReply('{"notes":"oops"}', f), []);
  });

  it('routes: on the phone if possible, the cloud only with a yes for this task, else rules', () => {
    const nano = { kind: 'on_device', provider: 'Google AICore', name: 'Gemini Nano' } as const;
    const cloud = { kind: 'cloud', provider: 'AI app you choose', name: 'shared' } as const;
    assert.equal(routeModel(nano, false, cloud), nano);
    assert.equal(routeModel(null, true, cloud), cloud);
    assert.equal(routeModel(null, false, cloud), RULES);
  });

  it('keeps each run as history, with the masked prompt and your approval time', () => {
    const rec = inferenceRecord('weekly_baseline', { kind: 'cloud', provider: 'x', name: 'y' }, f, '{"notes":[]}', now, now - 1000);
    assert.equal(rec.approvedAt, now - 1000);
    assert.doesNotMatch(JSON.stringify(rec), /RAMESH/);
  });

  it('works with no model at all', () => {
    const notes = rulesBaseline(r, now);
    assert.ok(notes.some((n) => /New this month: ₹25,000 to RAMESH IYER/.test(n.text)));
  });
});
