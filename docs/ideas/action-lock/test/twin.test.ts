import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { runImport } from '../src/import/run.ts';
import { answer, buildTwin } from '../src/orb/twin.ts';

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 24, 6);
let row = 0;
const sms = (at: number, body: string, address = 'JM-HDFCBK-S') => `Row: ${row++} address=${address}, date=${at}, body=${body}`;

// Salary on the 1st for 5 months; transfers with one person; a big one-off; everyday spends.
const lines: string[] = [];
for (let m = 0; m < 5; m++) {
  const at = Date.UTC(2026, 3 + m, 1, 5);
  lines.push(sms(at, `Update! INR 3,10,338.00 deposited in HDFC Bank A/c XX6111 on 01-SEP-26 for NEFT Cr-YESB0000001-ACME TECHNOLOGIES-Your Name-YESIG6244027013${m}.Avl bal INR 3,10,848.10.`));
}
for (let i = 0; i < 8; i++) {
  lines.push(sms(Date.UTC(2026, 4, 3 + i * 12, 9), `Received!\nINR 1,000.00 in HDFC Bank A/c xx6111\nOn 18-09-26\nFor IMPS -ASHA MENON- F6261104013${i}\nAvl bal INR 1,024.52`));
}
lines.push(sms(Date.UTC(2026, 7, 2, 9), 'IMPS INR 57,000.00\nsent from HDFC Bank A/c XX6111 on 02-08-26\nTo A/c xxxxxxxxxx2041\nRef-621454202605\nNot you?Call 18002586161'));
for (let i = 0; i < 10; i++) {
  lines.push(sms(now - (i + 1) * DAY, `Sent Rs.${200 + i}.00\nFrom HDFC Bank A/C *6111\nTo SWIGGY LIMITED\nOn 21/08/26\nRef 30489344922${i}\nNot You?`));
}
const SMS = lines.join('\n');
const CONTACTS = 'Row: 0 data1=+91 98450 12345, display_name=Asha Menon';

describe('Orb twin', () => {
  const r = runImport([{ name: 'sms.txt', text: SMS }, { name: 'contacts.txt', text: CONTACTS }], now);

  it('resolves people, organisations and accounts from observations', () => {
    const t = buildTwin(r, [], now);
    const byName = (n: string) => t.entities.find((e) => e.name === n);
    assert.equal(byName('ACME TECHNOLOGIES')?.kind, 'organisation');
    assert.equal(byName('ASHA MENON')?.kind, 'person');
    assert.equal(byName('ASHA MENON')?.contact, 'Asha Menon');
    assert.equal(byName('Account XX2041')?.kind, 'account');
    assert.equal(byName('SWIGGY LIMITED')?.kind, 'organisation');
    assert.equal(byName('ACME TECHNOLOGIES')?.timeline.length, 5);
  });

  it('holds beliefs with a confidence and a reason, and asks the most valuable question first', () => {
    const t = buildTwin(r, [], now);
    const income = t.beliefs.find((b) => b.id.startsWith('income:'))!;
    assert.match(income.text, /ACME TECHNOLOGIES pays you about ₹3,10,338 a month, usually around day 1/);
    assert.ok(income.confidence > 0.5 && income.confidence < 1);
    assert.equal(income.because, '5 credits in 5 months');
    assert.equal(t.questions[0]!.text, 'Is the ~₹3,10,338 a month from ACME TECHNOLOGIES your salary?');
    assert.ok(t.questions.some((q) => q.text === 'Who is ASHA MENON to you?'));
    assert.ok(t.questions.some((q) => q.text === '₹57,000 to Account XX2041 on 2 Aug: what was it?'));
    assert.ok(t.beliefs.every((b) => b.confidence > 0 && b.confidence < 1));
  });

  it('an answer is an event: the belief is held from you, the question goes, the entity gets a relation', () => {
    const answers = [
      answer('income:ACME TECHNOLOGIES', 'salary', now, 0),
      answer('relation:ASHA MENON', 'family', now, 1),
    ];
    const t = buildTwin(r, answers, now);
    const income = t.beliefs.find((b) => b.id === 'income:ACME TECHNOLOGIES')!;
    assert.equal(income.source, 'you');
    assert.equal(income.confidence, 0.99);
    assert.match(income.text, /is your employer/);
    assert.match(income.because, /^you said so on/);
    assert.ok(!t.questions.some((q) => q.id === 'income:ACME TECHNOLOGIES'));
    assert.equal(t.entities.find((e) => e.name === 'ASHA MENON')?.relation, 'family');
    assert.equal(t.answered, 2);
  });

  it('answering again replaces the earlier answer without erasing it; unknown answers are ignored', () => {
    const answers = [answer('relation:ASHA MENON', 'friend', now, 0), answer('relation:ASHA MENON', 'family', now + 1, 1), answer('relation:ASHA MENON', 'nonsense', now - 1, 2)];
    const t = buildTwin(r, answers, now);
    assert.equal(t.entities.find((e) => e.name === 'ASHA MENON')?.relation, 'family');
  });

  it('is deterministic: the same observations and answers give the same twin', () => {
    const answers = [answer('relation:ASHA MENON', 'family', now, 0)];
    assert.deepEqual(buildTwin(r, answers, now), buildTwin(r, answers, now));
  });

  it('spending by relation and a morning brief', () => {
    const t = buildTwin(r, [answer('income:ACME TECHNOLOGIES', 'salary', now, 0)], now);
    assert.ok(t.spendByRelation.some((s) => s.relation === 'not labelled yet' && s.amount > 2_000));
    const brief = t.brief.map((b) => b.text).join('\n');
    assert.match(brief, /ACME TECHNOLOGIES: the usual ~₹3,10,338 was expected around 31 Aug and hasn't arrived\./);
    assert.match(brief, /Spent ₹[\d,]+ in the last 7 days \(7 payments\)/);
    assert.match(brief, /questions? waiting/);
  });

  it('answers in your own words, and "me" for your own accounts', () => {
    const t = buildTwin(r, [answer('relation:ASHA MENON', 'note:my cousin, shares the rent', now, 0), answer('oneoff:ACCOUNT XX2041', 'own_account', now, 1)], now);
    const asha = t.beliefs.find((b) => b.id === 'relation:ASHA MENON')!;
    assert.equal(asha.text, 'ASHA MENON: my cousin, shares the rent');
    assert.equal(t.entities.find((e) => e.name === 'ASHA MENON')?.relation, 'my cousin, shares the rent');
    assert.equal(t.answeredQuestions.find((q) => q.id === 'relation:ASHA MENON')?.answer, 'note:my cousin, shares the rent');
    assert.equal(t.entities.find((e) => e.name === 'Account XX2041')?.relation, 'own account');
    const q = buildTwin(r, [], now).questions.find((x) => x.id === 'relation:ASHA MENON')!;
    assert.equal(q.options[0]!.label, 'Me (my own account)');
  });

  it('knows transfers to your own name are to yourself (name from your salary credits)', () => {
    const self = sms(now - 2 * DAY, 'Sent Rs.30000.00\nFrom HDFC Bank A/C *6111\nTo Hariharan Viswanathan\nOn 21/09/26\nRef 504893449901\nNot You?');
    const salary = sms(now - 5 * DAY, 'Update! INR 3,10,338.00 deposited in HDFC Bank A/c XX6111 on 01-SEP-26 for NEFT Cr-YESB0000001-ACME TECHNOLOGIES-Hariharan V-YESIG62440270199.Avl bal INR 3,10,848.10.');
    const r2 = runImport([{ name: 'sms.txt', text: [SMS, salary, self].join('\n') }], now);
    assert.ok(r2.selfNames.includes('Hariharan V'));
    const t2 = buildTwin(r2, [], now);
    assert.equal(t2.entities.find((e) => e.name === 'Hariharan Viswanathan')?.relation, 'you');
    assert.ok(!t2.questions.some((q) => /Hariharan/.test(q.text)));
  });
});
