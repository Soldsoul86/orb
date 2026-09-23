import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseCallLog, parseContacts, phoneKey, summariseCalls, summariseUsage, USAGE_MARKER } from '../src/import/people.ts';
import { detectSource, formatReport, formatSummary, runImport } from '../src/import/run.ts';
import { judge } from '../src/judge.ts';

const CONTACTS = [
  'Row: 0 data1=+91 98450 12345, display_name=Ravikumar Murthy',
  'Row: 1 data1=080-2345 6789, display_name=Amma',
  'Row: 2 data1=09900011122, display_name=Kumar, Anil (Office)',
].join('\n');

const t0 = Date.UTC(2026, 8, 1, 5);
const CALLS = [
  `Row: 0 number=+919845012345, date=${t0}, duration=120, type=1`,
  `Row: 1 number=9845012345, date=${t0 + 1e6}, duration=60, type=2`,
  `Row: 2 number=+918888800001, date=${t0 + 2e6}, duration=0, type=3`,
  `Row: 3 number=+918888800001, date=${t0 + 3e6}, duration=0, type=5`,
  `Row: 4 number=08888800001, date=${t0 + 4e6}, duration=15, type=1`,
  `Row: 5 number=9900011122, date=${t0 + 5e6}, duration=30, type=1`,
].join('\n');

describe('contacts and calls', () => {
  it('recognises the dumps', () => {
    assert.equal(detectSource(CONTACTS), 'android_contacts');
    assert.equal(detectSource(CALLS), 'android_calls');
    assert.equal(detectSource('Row: 0 address=AX-HDFCBK, date=1, body=hi'), 'adb_sms');
  });

  it('compares numbers by their last 10 digits', () => {
    assert.equal(phoneKey('+91 98450-12345'), '9845012345');
    assert.equal(phoneKey('09845012345'), '9845012345');
  });

  it('reads contacts, names with commas included', () => {
    const c = parseContacts(CONTACTS);
    assert.equal(c.length, 3);
    assert.deepEqual(c[2], { name: 'Kumar, Anil (Office)', number: '9900011122' });
  });

  it('counts calls from contacts and unknown numbers that keep calling, masked', () => {
    const s = summariseCalls(parseCallLog(CALLS), parseContacts(CONTACTS));
    assert.equal(s.calls, 6);
    assert.equal(s.unknownIncoming, 3);
    assert.equal(s.incomingFromContacts, 2 / 5);
    assert.deepEqual(s.persistentUnknown.map((u) => [u.number, u.calls]), [['••••••0001', 3]]);
    assert.equal(s.topPeople[0]!.name, 'Ravikumar Murthy');
  });

  it('a payee named like a contact is pointed out but still treated as new', () => {
    const r = runImport([{ name: 'contacts.txt', text: CONTACTS }, { name: 'calls.txt', text: CALLS }], t0);
    assert.ok(r.profile.people?.includes('Ravikumar Murthy'));
    const j = judge(r.profile, { kind: 'payment', to: 'ravi.m@okaxis', name: 'RAVIKUMAR MURTHY', amount: 500, localHour: 12 });
    assert.equal(j.contact, 'Ravikumar Murthy');
    assert.equal(j.newRecipient, true);
    assert.equal(judge(r.profile, { kind: 'payment', to: 'x@ybl', name: 'Amma', amount: 500, localHour: 12 }).contact, undefined); // too short to trust
    assert.match(formatReport(r), /PEOPLE AND CALLS[\s\S]*••••••0001  3 calls/);
    assert.doesNotMatch(formatReport(r), /8888800001/);
    assert.match(formatSummary(r), /Calls: 6 · 40% of calls to you from contacts · 1 unknown numbers keep calling/);
  });
});

/** A usagestats dump with activity 08:00–23:59 on each day and nothing at night. */
function usageDump(days: readonly string[]): string {
  const lines = [USAGE_MARKER, 'user=0', '  Last 24 hour events (timeRange="…")'];
  for (const d of days) {
    for (let h = 8; h < 24; h++) {
      lines.push(`    time="${d} ${String(h).padStart(2, '0')}:15:00" type=ACTIVITY_RESUMED package=com.whatsapp class=x instanceId=1`);
    }
    lines.push(`    time="${d} 03:10:00" type=ACTIVITY_PAUSED package=com.whatsapp`); // not activity
  }
  lines.push('  In-memory daily stats', '        package=com.whatsapp totalTimeUsed="01:10:00" lastTimeUsed="…"');
  lines.push('  In-memory monthly stats', '        package=com.whatsapp totalTimeUsed="2d 03:00:00" lastTimeUsed="…"');
  lines.push('        package=com.google.android.youtube totalTimeUsed="10:30:00" lastTimeUsed="…"');
  return lines.join('\n');
}

describe('screen time', () => {
  const days = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];

  it('finds the hours you are off your phone and the most used apps', () => {
    const s = summariseUsage([usageDump(days)]);
    assert.equal(s.days, 6);
    assert.deepEqual(s.offHours, { from: 0, to: 8 });
    assert.deepEqual(s.topApps[0], { app: 'com.whatsapp', hours: 51 });
  });

  it('needs 3 full days, and repeated dumps are counted once', () => {
    assert.equal(summariseUsage([usageDump(days.slice(0, 4))]).offHours, null); // 2 full days
    const twice = summariseUsage([usageDump(days.slice(0, 4)), usageDump(days.slice(2))]);
    assert.equal(twice.days, 6);
    assert.deepEqual(twice.offHours, { from: 0, to: 8 });
  });

  it('adds off-phone hours to the lock, even with little payment history', () => {
    const r = runImport([{ name: 'usage/2026-09-23.txt', text: usageDump(days) }], Date.UTC(2026, 8, 23));
    assert.equal(detectSource(usageDump(days)), 'android_usage');
    assert.deepEqual(r.profile.screenOff, { from: 0, to: 8 });
    const j = judge(r.profile, { kind: 'payment', to: 'new@ybl', amount: 800, localHour: 4 });
    assert.ok(j.analysis.feedback.some((f) => /usually off your phone between 00:00 and 08:00/.test(f)), j.analysis.feedback.join(' | '));
    assert.match(formatSummary(r), /Screen: usually off 00:00–08:00 \(6 days\)/);
  });
});
