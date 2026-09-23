// Contacts, call log and screen time, from what `npm run sync` reads. Pure.
//
//   contacts: adb shell content query --uri content://com.android.contacts/data/phones --projection data1:display_name
//   calls:    adb shell content query --uri content://call_log/calls --projection number:date:duration:type
//   usage:    adb shell dumpsys usagestats   (saved with a "##orb usage" first line)

export interface Contact {
  readonly name: string;
  /** Last 10 digits. */
  readonly number: string;
}

export interface Call {
  readonly number: string;
  readonly at: number;
  readonly seconds: number;
  readonly kind: 'in' | 'out' | 'missed' | 'rejected' | 'blocked' | 'other';
}

/** Phone numbers compared by their last 10 digits (drops +91, 0, spaces). */
export function phoneKey(n: string): string {
  const d = n.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

const rows = (dump: string) => dump.split(/(?:^|\n)Row: \d+ /).filter((r) => r.trim() !== '');
const field = (row: string, key: string) => row.match(new RegExp(`(?:^|, )${key}=([^,\\n]*)`))?.[1]?.trim();

export function isContactsDump(text: string): boolean {
  return /^Row: \d+ .*\bdata1=/m.test(text.slice(0, 2000)) && /display_name=/.test(text.slice(0, 2000));
}

export function isCallLogDump(text: string): boolean {
  return /^Row: \d+ .*\bnumber=/m.test(text.slice(0, 2000)) && /duration=/.test(text.slice(0, 2000));
}

export function parseContacts(dump: string): Contact[] {
  const out: Contact[] = [];
  for (const r of rows(dump)) {
    const number = phoneKey(field(r, 'data1') ?? '');
    // display_name is the last column, so it may contain commas.
    const name = r.slice(r.indexOf('display_name=') + 'display_name='.length).trim();
    if (number.length >= 6 && r.includes('display_name=') && name !== '' && name !== 'NULL') out.push({ name, number });
  }
  return out;
}

const KIND: Readonly<Record<string, Call['kind']>> = { '1': 'in', '2': 'out', '3': 'missed', '5': 'rejected', '6': 'blocked' };

export function parseCallLog(dump: string): Call[] {
  const out: Call[] = [];
  for (const r of rows(dump)) {
    const at = Number(field(r, 'date'));
    if (Number.isNaN(at)) continue;
    out.push({ number: phoneKey(field(r, 'number') ?? ''), at, seconds: Number(field(r, 'duration') ?? 0) || 0, kind: KIND[field(r, 'type') ?? ''] ?? 'other' });
  }
  return out;
}

export interface CallSummary {
  readonly calls: number;
  readonly range: { readonly from: number; readonly to: number } | null;
  readonly contacts: number;
  /** Share of incoming calls (answered or not) from numbers in your contacts. */
  readonly incomingFromContacts: number;
  readonly unknownIncoming: number;
  /** Unknown numbers that called you three times or more, masked. */
  readonly persistentUnknown: readonly { readonly number: string; readonly calls: number; readonly last: number }[];
  /** People you talk to most, by number of calls. */
  readonly topPeople: readonly { readonly name: string; readonly calls: number }[];
}

export const maskNumber = (n: string) => (n.length <= 4 ? n : `••••••${n.slice(-4)}`);

export function summariseCalls(calls: readonly Call[], contacts: readonly Contact[]): CallSummary {
  const byNumber = new Map(contacts.map((c) => [c.number, c.name]));
  const incoming = calls.filter((c) => c.kind !== 'out' && c.number !== '');
  const unknown = incoming.filter((c) => !byNumber.has(c.number));
  const unknownBy = new Map<string, Call[]>();
  for (const c of unknown) unknownBy.set(c.number, [...(unknownBy.get(c.number) ?? []), c]);
  const people = new Map<string, number>();
  for (const c of calls) {
    const name = byNumber.get(c.number);
    if (name !== undefined) people.set(name, (people.get(name) ?? 0) + 1);
  }
  const at = calls.map((c) => c.at);
  return {
    calls: calls.length,
    range: calls.length === 0 ? null : { from: Math.min(...at), to: Math.max(...at) },
    contacts: new Set(contacts.map((c) => c.number)).size,
    incomingFromContacts: incoming.length === 0 ? 0 : (incoming.length - unknown.length) / incoming.length,
    unknownIncoming: unknown.length,
    persistentUnknown: [...unknownBy.entries()]
      .filter(([, cs]) => cs.length >= 3)
      .map(([n, cs]) => ({ number: maskNumber(n), calls: cs.length, last: Math.max(...cs.map((c) => c.at)) }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 10),
    topPeople: [...people.entries()].map(([name, n]) => ({ name, calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 10),
  };
}

/** Contact names as the profile keeps them, for matching payee names. */
export function contactNames(contacts: readonly Contact[]): string[] {
  return [...new Set(contacts.map((c) => c.name.replace(/\s+/g, ' ').trim()))].sort().slice(0, 10_000);
}

// ── Screen time ────────────────────────────────────────────────────────────

export const USAGE_MARKER = '##orb usage';

export function isUsageDump(text: string): boolean {
  return text.trimStart().startsWith(USAGE_MARKER);
}

export interface UsageEvent {
  /** Device-local "YYYY-MM-DD HH:MM:SS". */
  readonly time: string;
  readonly type: string;
  readonly app: string;
}

const ACTIVE = /^(?:ACTIVITY_RESUMED|MOVE_TO_FOREGROUND|SCREEN_INTERACTIVE|KEYGUARD_HIDDEN|USER_INTERACTION)$/;

/** Reads `dumpsys usagestats`: foreground events, and total time per app. Tolerant of layout changes. */
export function parseUsage(dump: string): { events: UsageEvent[]; appTime: Map<string, number> } {
  const events: UsageEvent[] = [];
  const appTime = new Map<string, number>();
  for (const line of dump.split('\n')) {
    const e = line.match(/time="(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" type=(\w+)(?: package=([\w.]+))?/);
    if (e) {
      if (ACTIVE.test(e[2]!)) events.push({ time: e[1]!, type: e[2]!, app: e[3] ?? '' });
      continue;
    }
    const t = line.match(/package=([\w.]+) totalTime(?:Used|Visible)?="(?:(\d+)d )?(\d+):(\d{2}):(\d{2})"/);
    if (t) {
      const secs = Number(t[2] ?? 0) * 86_400 + Number(t[3]) * 3600 + Number(t[4]) * 60 + Number(t[5]);
      // Daily, weekly, monthly and yearly stats repeat each app: keep the longest period.
      appTime.set(t[1]!, Math.max(appTime.get(t[1]!) ?? 0, secs));
    }
  }
  return { events, appTime };
}

export interface ScreenSummary {
  /** Days with any recorded use. */
  readonly days: number;
  /** Foreground events read (0 means the dump's format was not recognised). */
  readonly events: number;
  /** Share of days you were on the phone, per local hour 0–23. */
  readonly byHour: readonly number[];
  /** The longest stretch of hours you are almost never on the phone; null until 3 days are known. */
  readonly offHours: { readonly from: number; readonly to: number } | null;
  readonly topApps: readonly { readonly app: string; readonly hours: number }[];
}

/** Summarises one or more usagestats dumps (sync keeps one per day, so history grows). */
export function summariseUsage(dumps: readonly string[]): ScreenSummary {
  const seen = new Set<string>();
  const dayHours = new Map<string, Set<number>>();
  const appTime = new Map<string, number>();
  for (const d of dumps) {
    const u = parseUsage(d);
    for (const e of u.events) {
      const key = `${e.time}|${e.type}|${e.app}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = e.time.slice(0, 10);
      dayHours.set(day, (dayHours.get(day) ?? new Set()).add(Number(e.time.slice(11, 13))));
    }
    for (const [app, s] of u.appTime) appTime.set(app, Math.max(appTime.get(app) ?? 0, s));
  }
  // The first and last day are usually partial; count only full days when there are enough.
  const days = [...dayHours.keys()].sort();
  const full = days.length > 2 ? days.slice(1, -1) : [];
  // Off-phone hours need full days; the by-hour picture uses every day until there are some.
  const shown = full.length > 0 ? full : days;
  const byHour = Array.from({ length: 24 }, (_, h) => (shown.length === 0 ? 0 : shown.filter((d) => dayHours.get(d)!.has(h)).length / shown.length));
  return {
    days: days.length,
    events: seen.size,
    byHour,
    offHours: full.length >= 3 ? longestOff(byHour) : null,
    topApps: [...appTime.entries()]
      .map(([app, s]) => ({ app, hours: Math.round((s / 3600) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10),
  };
}

function longestOff(byHour: readonly number[]): { from: number; to: number } | null {
  const off = byHour.map((x) => x <= 0.15);
  if (off.every(Boolean) || !off.some(Boolean)) return null;
  let best: { from: number; len: number } | null = null;
  for (let start = 0; start < 24; start++) {
    if (!off[start] || off[(start + 23) % 24]) continue;
    let len = 0;
    while (len < 24 && off[(start + len) % 24]) len++;
    if (best === null || len > best.len) best = { from: start, len };
  }
  return best === null || best.len < 3 || best.len > 14 ? null : { from: best.from, to: (best.from + best.len) % 24 };
}
