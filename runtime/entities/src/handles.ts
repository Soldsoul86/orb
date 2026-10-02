/**
 * Handles: the phone numbers, sites, UPI ids, email addresses, amounts and dates a text names.
 *
 * `docs/ENTITIES_PHONE.md` §2. **Rules, not a model, and not stored**: text goes in, a short list comes out,
 * and nothing is kept. The phone's Kotlin (`runtime/brain`) is held to this by shared vectors whose expected
 * answers are written by hand in `tests/handle-cases.ts`.
 *
 * **Strict on purpose.** An unknown format is *not found*, never guessed. A run of digits that passes the card
 * check is **excluded and never returned** — a card number is not a handle to be listed. Every kind is
 * India-first (day-first dates, rupees, +91 mobiles, UPI) and the limits are stated in the design, not hidden.
 *
 * **One text, one pass order.** Cards (excluded), web addresses, emails, UPI ids, amounts, dates, phone
 * numbers; a span taken by an earlier pass is not read again, so a number inside a link is not also a phone
 * number and a phone number before `@ybl` is a UPI id, not a phone. Results are in the order they appear and
 * each (kind, value) once.
 */

export type HandleKind = "phone" | "site" | "email" | "upi" | "amount" | "date";

export interface Handle {
  readonly kind: HandleKind;
  /** Normalised: the same subject written two ways is one value. */
  readonly value: string;
}

/** Only this much of a text is read. A kept screen is far smaller; a bound keeps the cost bounded. */
export const MAX_CHARS = 1_000_000;
/** At most this many distinct handles are returned from one text. */
export const MAX_HANDLES = 200;

interface Found {
  readonly start: number;
  readonly handle: Handle;
}

const CARD = /(?<!\d)(?:\d{13,19}|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}|\d{4}[ -]\d{6}[ -]\d{5})(?!\d)/g;
// Whitespace is spelled out, not `\s`: JavaScript's and the JVM's `\s` differ, and the two implementations must agree.
const URL_RE = /(?:https?:\/\/|www\.)[^ \t\r\n\f\u000b\u00a0\u2028\u2029<>"')\]]+/gi;
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9-])/g;
const UPI = /(?<![A-Za-z0-9._%+@-])[A-Za-z0-9][A-Za-z0-9._-]{1,63}@[A-Za-z][A-Za-z0-9]{1,31}(?![A-Za-z0-9@-]|\.[A-Za-z0-9])/g;
const AMOUNT = /(?<![A-Za-z0-9])(?:₹|rs\.?|inr)[ \t]*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/gi;

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
const DATE_SLASH = /(?<![\d/.-])(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/g;
const DATE_DOT = /(?<![\d/.-])(\d{2})\.(\d{2})\.(\d{4})(?!\d)/g;
const DATE_ISO = /(?<![\d/.-])(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const DATE_DAY_MONTH = new RegExp(`(?<![A-Za-z0-9])(\\d{1,2})(?:st|nd|rd|th)?[ \\t]+(${MONTHS})(?![A-Za-z])\\.?,?[ \\t]+(\\d{4})(?!\\d)`, "gi");
const DATE_MONTH_DAY = new RegExp(`(?<![A-Za-z0-9])(${MONTHS})(?![A-Za-z])\\.?[ \\t]+(\\d{1,2})(?:st|nd|rd|th)?,?[ \\t]+(\\d{4})(?!\\d)`, "gi");

const PHONE_IN_PLUS_91 = /(?<![A-Za-z0-9+#/.-])\+91[ -]?([6-9]\d{4})[ -]?(\d{5})(?!\d)/g;
const PHONE_IN = /(?<![A-Za-z0-9+#/.-])(?:91[ -]?|0)?([6-9]\d{4})[ -]?(\d{5})(?!\d)/g;
const PHONE_INTL = /(?<![A-Za-z0-9+#/.-])\+(?!91)[1-9](?:[ -]?\d){7,14}(?!\d)/g;

const MONTH_NUMBER: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** The handles a text names, in the order they appear, each (kind, value) once. Never throws. */
export function extractHandles(input: string): Handle[] {
  const text = input.length > MAX_CHARS ? input.slice(0, MAX_CHARS) : input;
  const taken = new Uint8Array(text.length);
  const found: Found[] = [];

  const free = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (taken[i] === 1) return false;
    return true;
  };
  const take = (start: number, end: number): void => {
    taken.fill(1, start, end);
  };
  const add = (start: number, kind: HandleKind, value: string): void => {
    found.push({ start, handle: { kind, value } });
  };

  // 0. Card-like runs that pass the Luhn check: excluded, never listed.
  for (const m of text.matchAll(CARD)) {
    const start = m.index ?? 0;
    if (luhn(m[0].replace(/\D/g, ""))) take(start, start + m[0].length);
  }

  // 1. Web addresses → the site.
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    const host = hostOf(raw);
    if (host === null || !free(start, start + raw.length)) continue;
    take(start, start + raw.length);
    add(start, "site", host);
  }

  // 2. Email addresses.
  for (const m of text.matchAll(EMAIL)) {
    const start = m.index ?? 0;
    const domain = m[0].slice(m[0].indexOf("@") + 1);
    if (!/^[A-Za-z]{2,}$/.test(domain.slice(domain.lastIndexOf(".") + 1))) continue;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "email", m[0].toLowerCase());
  }

  // 3. UPI ids.
  for (const m of text.matchAll(UPI)) {
    const start = m.index ?? 0;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "upi", m[0].toLowerCase());
  }

  // 4. Amounts, in rupees.
  for (const m of text.matchAll(AMOUNT)) {
    const start = m.index ?? 0;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "amount", amountValue(m[1] ?? "", m[2]));
  }

  // 5. Dates that name themselves, day first.
  const dates: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
    [DATE_SLASH, (m) => date(num(m[3]), num(m[2]), num(m[1]))],
    [DATE_DOT, (m) => date(num(m[3]), num(m[2]), num(m[1]))],
    [DATE_ISO, (m) => date(num(m[1]), num(m[2]), num(m[3]))],
    [DATE_DAY_MONTH, (m) => date(num(m[3]), monthNumber(m[2]), num(m[1]))],
    [DATE_MONTH_DAY, (m) => date(num(m[3]), monthNumber(m[1]), num(m[2]))],
  ];
  for (const [pattern, read] of dates) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0;
      const value = read(m);
      if (value === null || !free(start, start + m[0].length)) continue;
      take(start, start + m[0].length);
      add(start, "date", value);
    }
  }

  // 6. Phone numbers.
  for (const m of text.matchAll(PHONE_IN_PLUS_91)) {
    const start = m.index ?? 0;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "phone", `+91${m[1]}${m[2]}`);
  }
  for (const m of text.matchAll(PHONE_IN)) {
    const start = m.index ?? 0;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "phone", `+91${m[1]}${m[2]}`);
  }
  for (const m of text.matchAll(PHONE_INTL)) {
    const start = m.index ?? 0;
    if (!free(start, start + m[0].length)) continue;
    take(start, start + m[0].length);
    add(start, "phone", `+${m[0].replace(/\D/g, "")}`);
  }

  found.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: Handle[] = [];
  for (const { handle } of found) {
    const key = `${handle.kind}\u0000${handle.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(handle);
    if (out.length === MAX_HANDLES) break;
  }
  return out;
}

function num(s: string | undefined): number {
  return Number.parseInt(s ?? "", 10);
}

function monthNumber(name: string | undefined): number {
  return MONTH_NUMBER[(name ?? "").slice(0, 3).toLowerCase()] ?? 0;
}

/** The Luhn check for a run of digits. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** The site of a web address: lower case, without `www.`, port or path; null if it is not a real host. */
function hostOf(url: string): string | null {
  let rest = url;
  const scheme = /^https?:\/\//i.exec(rest);
  if (scheme !== null) rest = rest.slice(scheme[0].length);
  let end = rest.length;
  for (const stop of ["/", "?", "#", ":"]) {
    const at = rest.indexOf(stop);
    if (at >= 0 && at < end) end = at;
  }
  let host = rest.slice(0, end).toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (!/^[a-z]{2,}$/.test(host.slice(host.lastIndexOf(".") + 1))) return null;
  return host;
}

/** `INR 1200`, or `INR 1200.50` — commas and a zero fraction dropped, a one-digit fraction padded. */
function amountValue(whole: string, fraction: string | undefined): string {
  const digits = whole.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  const cents = fraction === undefined ? "" : fraction.padEnd(2, "0");
  return cents === "" || cents === "00" ? `INR ${digits}` : `INR ${digits}.${cents}`;
}

/** `YYYY-MM-DD` for a real calendar date in 1900–2100, otherwise null. */
function date(year: number, month: number, day: number): string | null {
  if (!(year >= 1900 && year <= 2100) || !(month >= 1 && month <= 12) || !(day >= 1)) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (day > days) return null;
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${year}-${two(month)}-${two(day)}`;
}
