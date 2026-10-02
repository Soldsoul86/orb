/**
 * Relative days: *"I'll send it Friday"*, *"call tomorrow"*, *"in two weeks"* — read as **a guess from a day you pass in**.
 *
 * `docs/RELATIVE_DAYS_PHONE.md`. Rules, not a model, and **no clock of its own**: the anchor (the day the words were kept)
 * is an argument, so the answer is deterministic and replayable. The phone's Kotlin is held to the same hand-written cases.
 *
 * **Conservative on purpose — not reading is better than reading wrong.** Read: *tomorrow*, *day after tomorrow*, *in N days /
 * weeks* (N a number or one…ten), and a weekday **spelled out** (the first such day after the anchor; the same weekday as the
 * anchor means the following week's). **Not read:** *next / last / previous / every / each / other / any / since / following*
 * before a weekday, plurals (*Fridays*), abbreviations (*Fri, Sat, Sun, Wed*), *today*, anything in the past, and any
 * language but English.
 */

export interface RelativeDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** What was found, normalised: `friday`, `tomorrow`, `day after tomorrow`, `in 2 weeks`. */
  readonly phrase: string;
}

/** Only this much of a text is read. */
export const RELATIVE_MAX_CHARS = 1_000_000;
/** At most this many days are returned from one text. */
export const RELATIVE_MAX_DAYS = 20;

const DAY_AFTER = /(?<![A-Za-z])day after tomorrow(?![A-Za-z])/gi;
const TOMORROW = /(?<![A-Za-z])tomorrow(?![A-Za-z])/gi;
const IN_N = /(?<![A-Za-z])in[ \t]+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)[ \t]+(days?|weeks?)(?![A-Za-z])/gi;
const WEEKDAY = /(?<![A-Za-z])(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?![A-Za-z])/gi;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
/** A weekday after one of these is not a plain "the coming one": the past, a recurrence, or a reading people disagree on. */
const NOT_A_PLAIN_WEEKDAY = new Set(["next", "last", "previous", "past", "every", "each", "other", "any", "since", "following"]);

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** The day number of a `YYYY-MM-DD` anchor, or null if it is not a real date in 1900–2100. */
function anchorDay(anchor: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  if (m === null) return null;
  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  if (year < 1900 || year > 2100) return null;
  const days = daysFromCivil(year, month, day);
  const back = civilFromDays(days);
  return back.year === year && back.month === month && back.day === day ? days : null;
}

function text2(n: number): string {
  return String(n).padStart(2, "0");
}

function format(days: number): string | null {
  const { year, month, day } = civilFromDays(days);
  return year > 2100 ? null : `${String(year).padStart(4, "0")}-${text2(month)}-${text2(day)}`;
}

/** 0 = Sunday. */
function weekdayOf(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

/** The relative days a text names, as dates, in the order they appear, each date once. Never throws. */
export function relativeDays(input: string, anchor: string): RelativeDay[] {
  const base = anchorDay(anchor);
  if (base === null) return [];
  const text = input.length > RELATIVE_MAX_CHARS ? input.slice(0, RELATIVE_MAX_CHARS) : input;
  const taken = new Uint8Array(text.length);
  const found: Array<{ start: number; day: RelativeDay }> = [];

  const free = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (taken[i] === 1) return false;
    return true;
  };
  const add = (start: number, end: number, daysAhead: number, phrase: string): void => {
    const date = format(base + daysAhead);
    if (date === null || !free(start, end)) return;
    taken.fill(1, start, end);
    found.push({ start, day: { date, phrase } });
  };

  for (const m of text.matchAll(DAY_AFTER)) add(m.index ?? 0, (m.index ?? 0) + m[0].length, 2, "day after tomorrow");
  for (const m of text.matchAll(TOMORROW)) add(m.index ?? 0, (m.index ?? 0) + m[0].length, 1, "tomorrow");
  for (const m of text.matchAll(IN_N)) {
    const raw = (m[1] ?? "").toLowerCase();
    const n = NUMBER_WORDS[raw] ?? Number.parseInt(raw, 10);
    const weeks = (m[2] ?? "").toLowerCase().startsWith("week");
    if (!(n >= 1) || (weeks ? n > 52 : n > 365)) continue;
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, weeks ? n * 7 : n, `in ${n} ${weeks ? "week" : "day"}${n === 1 ? "" : "s"}`);
  }
  for (const m of text.matchAll(WEEKDAY)) {
    const start = m.index ?? 0;
    const before = /(?:^|[^A-Za-z])([A-Za-z]+)[ \t\r\n]+$/.exec(text.slice(Math.max(0, start - 16), start));
    if (before !== null && NOT_A_PLAIN_WEEKDAY.has((before[1] ?? "").toLowerCase())) continue;
    const word = (m[1] ?? "").toLowerCase();
    const target = WEEKDAYS.indexOf(word as (typeof WEEKDAYS)[number]);
    const delta = (((target - weekdayOf(base)) % 7) + 7) % 7;
    add(start, start + m[0].length, delta === 0 ? 7 : delta, word);
  }

  found.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: RelativeDay[] = [];
  for (const { day } of found) {
    if (seen.has(day.date)) continue;
    seen.add(day.date);
    out.push(day);
    if (out.length === RELATIVE_MAX_DAYS) break;
  }
  return out;
}
