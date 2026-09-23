import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decodeHeader, mailCollector, parseMail, readBooking, readReceipt, splitMbox } from '../src/import/mail.ts';
import { detectSource, formatReport, formatSummary, runImport, withMailSubscriptions } from '../src/import/run.ts';

const from_ = (d: string) => `From 1712345678901234567@xxx ${d}`;

function mail(o: { from: string; subject: string; date: string; labels?: string; body: string; headers?: string }): string {
  return [
    from_('Mon Jan 01 00:00:00 +0000 2024'),
    `X-GM-THRID: 1`,
    `X-Gmail-Labels: ${o.labels ?? 'Inbox,Category Updates'}`,
    `From: ${o.from}`,
    `Subject: ${o.subject}`,
    `Date: ${o.date}`,
    o.headers ?? 'Content-Type: text/plain; charset="UTF-8"',
    '',
    o.body,
    '',
  ].join('\n');
}

const netflix = (d: string) =>
  mail({
    from: 'Netflix <info@account.netflix.com>',
    subject: 'Your Netflix membership receipt',
    date: d,
    headers: 'Content-Type: text/html; charset="UTF-8"\nContent-Transfer-Encoding: quoted-printable',
    body: '<html><body><p>Thanks for your membership.</p><table><tr><td>Total</td><td>=E2=82=B9 649.00</td></tr></table><p>Standard plan, billed m=\nonthly.</p></body></html>',
  });

const MBOX = [
  netflix('Tue, 02 Jun 2026 10:00:00 +0530'),
  netflix('Thu, 02 Jul 2026 10:00:00 +0530'),
  netflix('Sun, 02 Aug 2026 10:00:00 +0530'),
  netflix('Wed, 02 Sep 2026 10:00:00 +0530'),
  mail({
    from: '"IndiGo" <reservations@customer.goindigo.in>',
    subject: 'Your IndiGo Itinerary - PNR ABC12D',
    date: 'Fri, 10 Jul 2026 18:00:00 +0530',
    body: 'Booking confirmed. PNR: ABC12D\nBLR - DEL\nDeparture: 14 Aug 2026 06:10\nTotal fare ₹ 6,480',
  }),
  mail({
    from: '"IndiGo" <reservations@customer.goindigo.in>',
    subject: 'Web check-in now open for PNR ABC12D',
    date: 'Wed, 12 Aug 2026 06:10:00 +0530',
    body: 'Web check-in is open. PNR: ABC12D BLR - DEL',
  }),
  mail({
    from: 'Booking.com <noreply@booking.com>',
    subject: 'Your booking is confirmed at Sea View Inn',
    date: 'Sat, 11 Jul 2026 09:00:00 +0530',
    body: 'Booking number: 4455667788\nCheck-in: Fri 14 Aug 2026\n2 nights, Goa',
  }),
  mail({
    from: 'Big Sale <deals@shop.example>',
    subject: 'Your order confirmed? 50% off everything ₹999',
    labels: 'Category Promotions',
    date: 'Sat, 11 Jul 2026 09:00:00 +0530',
    body: 'Total ₹999',
  }),
  mail({
    from: 'ACT Fibernet <care@actcorp.in>',
    subject: 'Your new Wi-Fi details',
    date: 'Sun, 12 Jul 2026 09:00:00 +0530',
    body: 'Your Wi-Fi password: Tiger@2026 . Please keep it safe.',
  }),
  mail({
    from: 'Apple <no_reply@email.apple.com>',
    subject: 'Your receipt from Apple',
    date: 'Mon, 13 Jul 2026 09:00:00 +0000',
    headers: 'Content-Type: multipart/alternative; boundary="b1"',
    body: ['--b1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from('iCloud+ 50GB subscription, renews monthly. Total $0.99').toString('base64'), '--b1', 'Content-Type: text/html', '', '<p>html copy</p>', '--b1--'].join('\n'),
  }),
  mail({
    from: 'Duolingo <no-reply@duolingo.com>',
    subject: 'Your free trial ends tomorrow',
    date: 'Tue, 01 Sep 2026 09:00:00 +0000',
    body: 'Super Duolingo will renew at ₹3,499/year.',
  }),
  mail({
    from: 'Friend <f@example.com>',
    subject: '=?UTF-8?B?4oK5IFRyaXAgcGxhbnM=?=',
    date: 'Tue, 01 Sep 2026 09:00:00 +0000',
    body: '>From the looks of it we should go.',
  }),
].join('\n');

describe('mail: reading messages', () => {
  it('splits an mbox and decodes headers, quoted-printable, base64 and HTML', () => {
    const raw = splitMbox(MBOX);
    assert.equal(raw.length, 12);
    const n = parseMail(raw[0]!)!;
    assert.equal(n.domain, 'account.netflix.com');
    assert.match(n.text, /Total ₹ 649\.00/);
    assert.match(n.text, /billed monthly/);
    assert.match(parseMail(raw[9]!)!.text, /Total \$0\.99/);
    assert.equal(decodeHeader('=?UTF-8?B?4oK5IFRyaXAgcGxhbnM=?='), '₹ Trip plans');
    assert.equal(parseMail(raw[11]!)!.text, 'From the looks of it we should go.');
  });

  it('reads receipts, skipping promotions', () => {
    const ms = splitMbox(MBOX).map((r) => parseMail(r)!);
    assert.deepEqual(readReceipt(ms[0]!), { at: Date.parse('Tue, 02 Jun 2026 10:00:00 +0530'), merchant: 'Netflix', amount: 649, currency: 'INR', recurring: true });
    assert.equal(readReceipt(ms[7]!), null);
    const apple = readReceipt(ms[9]!)!;
    assert.deepEqual([apple.merchant, apple.amount, apple.currency, apple.recurring], ['Apple', 0.99, 'USD', true]);
  });

  it('reads travel bookings: kind, route, travel date, masked reference', () => {
    const ms = splitMbox(MBOX).map((r) => parseMail(r)!);
    const f = readBooking(ms[4]!)!;
    assert.deepEqual([f.kind, f.provider, f.route, f.ref, f.cancelled], ['flight', 'IndiGo', 'BLR → DEL', 'AB•••2D', false]);
    assert.equal(new Date(f.travelAt!).getDate(), 14);
    const h = readBooking(ms[6]!)!;
    assert.equal(h.kind, 'hotel');
    assert.equal(h.provider, 'Booking.com');
  });
});

describe('mail: the mailbox summary', () => {
  const c = mailCollector(Date.UTC(2026, 8, 23));
  for (const raw of splitMbox(MBOX)) c.add(raw);
  const s = c.result();

  it('counts each booking once and keeps no mail text', () => {
    assert.equal(s.messages, 12);
    assert.equal(s.bookings.length, 2); // itinerary + check-in reminder are one booking
    assert.equal(s.receipts.length, 5); // 4 Netflix, Apple (the itinerary is a booking, not a receipt)
    const json = JSON.stringify(s);
    assert.doesNotMatch(json, /Tiger@2026|Thanks for your membership|should go/);
  });

  it('reports passwords found in mail, masked', () => {
    assert.ok(s.sensitive.some((k) => k.kind === 'password'));
    assert.match(s.alarms.join('\n'), /care@actcorp\.in on 2026-07-12 .*password/);
    assert.doesNotMatch(s.alarms.join('\n'), /Tiger@2026/);
  });

  it('adds rupee subscriptions from mail to the profile, and reports trips', () => {
    const text = JSON.stringify(s);
    assert.equal(detectSource(text), 'gmail_summary');
    const r = runImport([{ name: 'mail.json', text }], Date.UTC(2026, 8, 23));
    const nf = r.profile.subscriptions.find((x) => x.name === 'Netflix')!;
    assert.deepEqual([nf.cycle, nf.usualAmount, nf.from, nf.status], ['monthly', 649, 'mail', 'active']);
    assert.ok(!r.profile.subscriptions.some((x) => x.name === 'Apple')); // dollars are not compared with rupees
    const report = formatReport(r);
    assert.match(report, /Netflix  ₹649 monthly · next about 2026-10-02 \(from mail receipts\)/);
    assert.match(report, /Foreign-currency subscriptions: Apple \(USD\)/);
    assert.match(report, /Travel bookings: 2[\s\S]*by kind: flight 1 · hotel 1[\s\S]*BLR → DEL \(1\)/);
    assert.match(report, /Free trials ending recently .*Duolingo/);
    assert.doesNotMatch(report, /Tiger@2026/);
    assert.match(formatSummary(r), /Mail: 12 mails · 5 receipts · 1 more subscriptions · 2 travel bookings/);
    assert.match(formatSummary(r), /passwords or keys sitting in mail/);
  });

  it('a subscription already found in bank SMS is not added twice', () => {
    const fromSms = runImport([{ name: 'mail.json', text: JSON.stringify(s) }], 0).profile.subscriptions.map(({ from: _, ...x }) => ({ ...x, name: 'NETFLIX ENTERTAINMENT' }));
    const merged = withMailSubscriptions(fromSms, s);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.from, undefined);
  });
});
