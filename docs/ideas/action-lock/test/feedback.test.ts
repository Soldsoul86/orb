import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { mailCollector } from '../src/import/mail.ts';
import { USAGE_MARKER } from '../src/import/people.ts';
import { formatFeedback, runImport, type ImportInput } from '../src/import/run.ts';

const at = Date.UTC(2026, 8, 20, 6);

function mail(from: string, subject: string, body: string): string {
  return `X-Gmail-Labels: Inbox\nFrom: ${from}\nSubject: ${subject}\nDate: Sat, 19 Sep 2026 10:00:00 +0530\n\n${body}`;
}

describe('feedback file', () => {
  const c = mailCollector(at);
  c.add(mail('Swiggy <noreply@swiggy.in>', 'Your receipt for order 123456', 'Thanks! Paid with UPI.'));
  c.add(mail('Swiggy <noreply@swiggy.in>', 'Your receipt for order 654321', 'Thanks! Paid with UPI.'));
  c.add(mail('Air India <noreply@airindia.com>', 'Flight status update for AI 503', 'See you soon'));
  const inputs: ImportInput[] = [
    {
      name: 'sms.txt',
      text: [
        `Row: 0 address=JD-NEWBNK-S, date=${at}, body=A/c 1234 debited INR 500 on 20Sep via UPI. Pwd: Tiger@2026`,
        `Row: 1 address=JD-NEWBNK-S, date=${at + 1}, body=A/c 1234 debited INR 700 on 21Sep via UPI. Pwd: Lion@1999`,
      ].join('\n'),
    },
    { name: 'contacts.txt', text: 'Row: 0 data1=+91 98450 12345, display_name=Ravikumar Murthy' },
    { name: 'calls.txt', text: `Row: 0 number=+919845012345, date=${at}, duration=10, type=1` },
    { name: 'usage/2026-09-20.txt', text: `${USAGE_MARKER}\nuser=0\n  events:\n    2026-09-20T10:00:00 RESUMED com.whatsapp\n` },
    { name: 'mail.json', text: JSON.stringify(c.result()) },
  ];
  const r = runImport(inputs, at);
  const f = formatFeedback(r, inputs);

  it('lists what could not be read, one line per format', () => {
    assert.match(f, /2 with no payee name/);
    assert.equal((f.match(/JD-NEWBNK-S/g) ?? []).length, 1); // the two alerts share a format, so one line
    assert.match(f, /PHONE CHECK: the phone did not share/);
    assert.match(f, /Contacts: 1 read of 1 rows/);
    assert.match(f, /SCREEN TIME: 0 events[\s\S]*Format not fully read[\s\S]*RESUMED com\.whatsapp/);
    assert.match(f, /Looked like receipts, no amount found:\n  \? swiggy\.in: Your receipt for order 123456/);
    assert.doesNotMatch(f, /654321/); // same format as the first: listed once
    assert.match(f, /not read as bookings:\n  \? airindia\.com: Flight status update for AI 503/);
  });

  it('is safe to paste: no passwords, contact names or full phone numbers', () => {
    assert.doesNotMatch(f, /Tiger@2026|Lion@1999/);
    assert.doesNotMatch(f, /Ravikumar/);
    assert.doesNotMatch(f, /98450/);
  });
});
