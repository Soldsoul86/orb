// Gmail (Google Takeout mbox): receipts, subscriptions, trips, and
// confidential data sitting in mail. Pure, one message at a time; the
// streaming reader is scripts/mail.ts, so a many-gigabyte mailbox never has
// to fit in memory. Nothing but the summary is saved: no mail bodies.

import { scanSensitive, redact, type SensitiveHit } from './sensitive.ts';

export interface Mail {
  readonly from: string;
  readonly fromName: string;
  /** Sender's domain, lower-case. */
  readonly domain: string;
  readonly subject: string;
  readonly at: number;
  /** Gmail labels from X-Gmail-Labels ("Inbox", "Category Promotions", "Spam"…). */
  readonly labels: readonly string[];
  /** Readable text: the plain-text part, or the HTML part without tags. */
  readonly text: string;
}

// ── MIME ───────────────────────────────────────────────────────────────────

function headersOf(block: string): Map<string, string> {
  const h = new Map<string, string>();
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) {
      const k = line.slice(0, i).trim().toLowerCase();
      if (!h.has(k)) h.set(k, line.slice(i + 1).trim());
    }
  }
  return h;
}

function bytesToText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(/utf-?8|us-ascii/i.test(charset) || charset === '' ? 'utf-8' : charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

function decodeBody(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  if (enc === 'base64') return bytesToText(Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset);
  if (enc === 'quoted-printable') {
    const soft = body.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < soft.length; i++) {
      const c = soft[i]!;
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
        bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
        i += 2;
      } else for (const b of Buffer.from(c, 'utf8')) bytes.push(b);
    }
    return bytesToText(Uint8Array.from(bytes), charset);
  }
  return body;
}

/** "=?UTF-8?B?…?=" and "=?UTF-8?Q?…?=" in headers. */
export function decodeHeader(v: string): string {
  return v
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([\w-]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs: string, enc: string, data: string) =>
      enc.toUpperCase() === 'B' ? decodeBody(data, 'base64', cs) : decodeBody(data.replace(/_/g, ' '), 'quoted-printable', cs),
    );
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** The best readable text in a MIME entity: text/plain preferred, else HTML; attachments ignored. */
function textOf(headers: Map<string, string>, body: string, depth = 0): { plain: string; html: string } {
  const type = headers.get('content-type') ?? 'text/plain';
  const charset = type.match(/charset="?([\w-]+)/i)?.[1] ?? 'utf-8';
  const encoding = headers.get('content-transfer-encoding') ?? '7bit';
  if (/attachment/i.test(headers.get('content-disposition') ?? '')) return { plain: '', html: '' };
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/^multipart\//i.test(type) && boundary !== undefined && depth < 4) {
    const out = { plain: '', html: '' };
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break;
      const split = part.search(/\r?\n\r?\n/);
      if (split < 0) continue;
      const t = textOf(headersOf(part.slice(0, split)), part.slice(split).replace(/^\r?\n\r?\n/, ''), depth + 1);
      if (out.plain === '') out.plain = t.plain;
      if (out.html === '') out.html = t.html;
    }
    return out;
  }
  if (/^text\/plain/i.test(type)) return { plain: decodeBody(body, encoding, charset), html: '' };
  if (/^text\/html/i.test(type)) return { plain: '', html: decodeBody(body, encoding, charset) };
  return { plain: '', html: '' };
}

/** Parses one raw message (headers + body, without the mbox "From " line). */
export function parseMail(raw: string): Mail | null {
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) return null;
  const h = headersOf(raw.slice(0, split));
  const at = Date.parse(h.get('date') ?? '');
  if (Number.isNaN(at)) return null;
  const from = decodeHeader(h.get('from') ?? '');
  const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const t = textOf(h, raw.slice(split).replace(/^\r?\n\r?\n/, ''));
  const text = (t.plain.trim() !== '' ? t.plain : htmlToText(t.html)).trim().slice(0, 50_000);
  return {
    from: email,
    fromName: from.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || email,
    domain: email.split('@')[1] ?? '',
    subject: decodeHeader(h.get('subject') ?? '').replace(/\s+/g, ' ').trim(),
    at,
    labels: (h.get('x-gmail-labels') ?? '').split(',').map((l) => l.trim()).filter(Boolean),
    text,
  };
}

/** Lines that start a message in an mbox file ("From 1712…@xxx Mon Jan 01 …"). */
export const MBOX_FROM = /^From \S+ +(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) /;

/** Splits a whole mbox held in memory (tests, small files). scripts/mail.ts streams instead. */
export function splitMbox(mbox: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const line of mbox.split('\n')) {
    if (MBOX_FROM.test(line)) {
      if (cur !== null) out.push(cur.join('\n'));
      cur = [];
    } else if (cur !== null) cur.push(line.replace(/^>(>*From )/, '$1'));
  }
  if (cur !== null) out.push(cur.join('\n'));
  return out;
}

// ── What a message is ──────────────────────────────────────────────────────

export interface Receipt {
  readonly at: number;
  readonly merchant: string;
  readonly amount: number;
  readonly currency: string;
  /** Wording says it is a subscription, membership or renewal. */
  readonly recurring: boolean;
}

export type BookingKind = 'flight' | 'train' | 'bus' | 'hotel' | 'cab' | 'travel';

export interface Booking {
  readonly at: number;
  readonly kind: BookingKind;
  readonly provider: string;
  /** PNR or booking ID, masked: used to count each booking once. */
  readonly ref?: string;
  readonly route?: string;
  /** When the journey or stay starts, if the mail says. */
  readonly travelAt?: number;
  readonly cancelled: boolean;
}

const SKIP_LABELS = /^(?:Spam|Trash|Category Promotions|Category Social|Category Forums|Chats)$/i;

const RECEIPT_SUBJECT =
  /\b(?:receipt|invoice|payment (?:received|successful|confirmation|of)|order (?:confirmed|confirmation|placed)|your (?:\w+ ){0,3}(?:subscription|membership|plan)|renew(?:ed|al)|billed|charged|tax invoice|bill (?:for|generated|payment)|thank you for your (?:order|purchase|payment))\b/i;
const RECURRING = /\b(?:subscription|membership|renew(?:s|ed|al)?|recurring|auto-?renew|billing (?:period|cycle)|monthly plan|annual plan|yearly plan|premium plan)\b/i;
const CURRENCY: readonly [RegExp, string][] = [
  [/^(?:₹|rs\.?|inr)$/i, 'INR'],
  [/^(?:\$|usd|us\$)$/i, 'USD'],
  [/^(?:€|eur)$/i, 'EUR'],
  [/^(?:£|gbp)$/i, 'GBP'],
  [/^(?:aed)$/i, 'AED'],
  [/^(?:sgd|s\$)$/i, 'SGD'],
];
const MONEY = /(₹|Rs\.?|INR|US\$|\$|USD|€|EUR|£|GBP|AED|SGD|S\$)\s?(\d[\d,]*(?:\.\d{1,2})?)/i;
const TOTAL_MONEY = new RegExp(
  `(?:grand total|total amount|amount paid|total paid|order total|total|amount charged|you paid|charged|amount)\\b[^\\n₹$€£]{0,40}?${MONEY.source}`,
  'i',
);

function currencyOf(sym: string): string {
  return CURRENCY.find(([re]) => re.test(sym.trim()))?.[1] ?? sym.toUpperCase();
}

/** "Netflix" from '"Netflix" <info@account.netflix.com>' or, failing that, from the domain. */
export function merchantOf(m: Mail): string {
  const name = m.fromName
    .replace(/\b(?:no-?reply|noreply|do-?not-?reply|team|support|payments?|billing|receipts?|orders?|notifications?|alerts?|info|via .*)$/gi, '')
    .replace(/[|,:-]+$/g, '')
    .trim();
  if (name !== '' && !name.includes('@')) return name;
  const parts = m.domain.split('.');
  const root = parts.length >= 3 && /^(?:co|com|net|org)$/.test(parts[parts.length - 2]!) ? parts[parts.length - 3]! : (parts[parts.length - 2] ?? m.domain);
  return root.charAt(0).toUpperCase() + root.slice(1);
}

export function readReceipt(m: Mail): Receipt | null {
  if (m.labels.some((l) => SKIP_LABELS.test(l))) return null;
  if (!RECEIPT_SUBJECT.test(m.subject)) return null;
  if (/\b(?:refund|failed|declined|unsuccessful|reminder|due|overdue|offer|sale|% off|cashback)\b/i.test(m.subject)) return null;
  const body = `${m.subject}\n${m.text.slice(0, 20_000)}`;
  const hit = body.match(TOTAL_MONEY) ?? body.match(MONEY);
  if (!hit) return null;
  const amount = Number(hit[2]!.replace(/,/g, ''));
  if (!(amount > 0) || amount > 10_000_000) return null;
  return { at: m.at, merchant: merchantOf(m), amount, currency: currencyOf(hit[1]!), recurring: RECURRING.test(body.slice(0, 5_000)) };
}

const TRAVEL_DOMAINS: readonly [RegExp, BookingKind][] = [
  [/goindigo|airindia|vistara|akasaair|spicejet|airasia|emirates|qatarairways|singaporeair|lufthansa|britishairways|etihad|flydubai/, 'flight'],
  [/irctc/, 'train'],
  [/redbus|abhibus|zingbus/, 'bus'],
  [/booking\.com|agoda|airbnb|oyo|marriott|hilton|hyatt|tajhotels|ihg|treebo|fabhotels|zostel|accor/, 'hotel'],
  [/uber|olacabs|rapido|blusmart/, 'cab'],
  [/makemytrip|goibibo|cleartrip|yatra|ixigo|easemytrip|expedia|skyscanner|trip\.com|kayak/, 'travel'],
];
const BOOKING_SUBJECT =
  /\b(?:PNR|booking (?:id|ref|reference|confirmed|confirmation|is confirmed)|e-?ticket|boarding pass|itinerary|reservation (?:confirmed|confirmation)|your (?:trip|stay|flight|journey|booking)|ticket (?:booked|confirmed|confirmation)|web check-?in|check-?in (?:now|open|reminder))\b/i;
const IATA = new Set(
  'BLR DEL BOM MAA HYD CCU COK GOI PNQ AMD JAI LKO IXC TRV CJB IXE MYQ VNS PAT GAU BBI IDR NAG SXR ATQ IXB IXZ VGA VTZ RPR IXR TIR IXM DED UDR JDH GOX DXB AUH DOH SIN KUL BKK HKT DPS CMB MLE KTM LHR CDG FRA AMS JFK SFO EWR LAX ORD SEA YYZ SYD MEL NRT HND ICN HKG IST ZRH MUC BCN FCO'.split(' '),
);

function travelKind(m: Mail, body: string): BookingKind | null {
  const byDomain = TRAVEL_DOMAINS.find(([re]) => re.test(m.domain))?.[1];
  const byWords: BookingKind | null = /\b(?:flight|boarding pass|airline|departure terminal)\b/i.test(body)
    ? 'flight'
    : /\b(?:train|coach|berth|IRCTC)\b/i.test(body)
      ? 'train'
      : /\b(?:hotel|check-?in date|your stay|room type|nights?)\b/i.test(body)
        ? 'hotel'
        : /\b(?:bus|boarding point)\b/i.test(body)
          ? 'bus'
          : null;
  if (byDomain === 'travel') return byWords ?? 'travel';
  return byDomain ?? byWords;
}

function travelDate(body: string): number | undefined {
  const m = body.match(
    /\b(?:depart(?:ure|s|ing)?(?: date)?|date of journey|journey date|travel date|check-?in(?: date)?|pick-?up(?: date)?|on)\b[:\s-]*(?:\w{3},?\s+)?(\d{1,2}(?:st|nd|rd|th)?[\s-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s-,]+\d{2,4})/i,
  );
  if (!m) return undefined;
  const t = Date.parse(m[1]!.replace(/(\d)(?:st|nd|rd|th)/, '$1').replace(/-/g, ' ').replace(/ (\d{2})$/, ' 20$1'));
  return Number.isNaN(t) ? undefined : t;
}

export function readBooking(m: Mail): Booking | null {
  if (m.labels.some((l) => SKIP_LABELS.test(l))) return null;
  const body = `${m.subject}\n${m.text.slice(0, 20_000)}`;
  if (!BOOKING_SUBJECT.test(m.subject)) return null;
  const kind = travelKind(m, body);
  if (kind === null) return null;
  const ref = body.match(/\b(?:PNR|booking (?:id|ref(?:erence)?|no\.?|number)|confirmation (?:number|code|no\.?)|itinerary (?:id|no\.?))\s*(?:is|no\.?|number)?\s*[:#-]?\s*([A-Z0-9]{5,14})\b/i)?.[1];
  const iata = [...body.matchAll(/\b([A-Z]{3})\s*(?:-|–|→|to|>|✈)\s*([A-Z]{3})\b/g)].find((x) => IATA.has(x[1]!) && IATA.has(x[2]!));
  const cities = body.match(/\bfrom ([A-Z][a-z]+(?: [A-Z][a-z]+)?) to ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/);
  const route = iata ? `${iata[1]} → ${iata[2]}` : cities ? `${cities[1]} → ${cities[2]}` : undefined;
  const travelAt = travelDate(body);
  return {
    at: m.at,
    kind,
    provider: merchantOf(m),
    cancelled: /\bcancel(?:led|lation)\b/i.test(m.subject),
    ...(ref !== undefined ? { ref: `${ref.slice(0, 2)}•••${ref.slice(-2)}` } : {}),
    ...(route !== undefined ? { route } : {}),
    ...(travelAt !== undefined ? { travelAt } : {}),
  };
}

/** "Your free trial ends on …": a charge is coming. */
export function readTrialEnding(m: Mail): { at: number; merchant: string } | null {
  if (m.labels.some((l) => SKIP_LABELS.test(l))) return null;
  return /\b(?:free )?trial (?:ends|is ending|will end|expires)\b/i.test(m.subject) ? { at: m.at, merchant: merchantOf(m) } : null;
}

// ── The whole mailbox ──────────────────────────────────────────────────────

export interface MailSummary {
  readonly orbMail: 1;
  readonly builtAt: number;
  readonly messages: number;
  readonly skipped: number;
  readonly range: { readonly from: number; readonly to: number } | null;
  readonly receipts: readonly Receipt[];
  readonly bookings: readonly Booking[];
  readonly trialsEnding: readonly { readonly at: number; readonly merchant: string }[];
  /** Confidential data found in mail, masked, by kind. */
  readonly sensitive: readonly { readonly kind: string; readonly count: number }[];
  /** The most serious, with sender and date. */
  readonly alarms: readonly string[];
  /** Mails that looked like receipts or bookings but could not be read (sender domain and masked subject), for improving the reader. */
  readonly missed?: { readonly receipts: readonly string[]; readonly bookings: readonly string[] };
}

const SERIOUS = new Set(['recovery_phrase', 'private_key', 'password', 'api_key', 'card_number', 'aadhaar']);

/** Collects messages one at a time; call `add` for each raw message, then `result`. */
export function mailCollector(builtAt: number) {
  let messages = 0;
  let skipped = 0;
  let from = Infinity;
  let to = -Infinity;
  const receipts: Receipt[] = [];
  const bookings: Booking[] = [];
  const trials: { at: number; merchant: string }[] = [];
  const kinds = new Map<string, number>();
  const alarms: string[] = [];
  const missed = { receipts: new Map<string, string>(), bookings: new Map<string, string>() };
  const miss = (into: Map<string, string>, mail: Mail) => {
    const line = `${mail.domain}: ${redact(mail.subject).slice(0, 100)}`;
    const shape = `${mail.domain}|${mail.subject.replace(/\d+/g, '9').replace(/[A-Z0-9]{5,}/g, 'X').slice(0, 50)}`;
    if (into.size < 40 && !into.has(shape)) into.set(shape, line);
  };
  return {
    add(raw: string): void {
      const m = parseMail(raw);
      if (m === null) {
        skipped++;
        return;
      }
      messages++;
      from = Math.min(from, m.at);
      to = Math.max(to, m.at);
      const r = readReceipt(m);
      if (r !== null) receipts.push(r);
      const b = readBooking(m);
      if (b !== null) bookings.push(b);
      const t = readTrialEnding(m);
      if (t !== null) trials.push(t);
      if (m.labels.some((l) => SKIP_LABELS.test(l)) || m.labels.includes('Sent')) return;
      if (r === null && RECEIPT_SUBJECT.test(m.subject)) miss(missed.receipts, m);
      if (b === null && TRAVEL_DOMAINS.some(([re, kind]) => kind !== 'cab' && re.test(m.domain)) && !/\b(?:offer|sale|deal|% off|newsletter)\b/i.test(m.subject)) miss(missed.bookings, m);
      const hits: SensitiveHit[] = scanSensitive(`${m.subject}\n${m.text.slice(0, 5_000)}`);
      for (const h of hits) {
        kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1);
        if (SERIOUS.has(h.kind) && alarms.length < 20) alarms.push(`Mail from ${m.from} on ${new Date(m.at).toISOString().slice(0, 10)} ("${redact(m.subject).slice(0, 60)}"): ${h.kind.replace('_', ' ')} ${h.masked}`);
      }
    },
    result(): MailSummary {
      return {
        orbMail: 1,
        builtAt,
        messages,
        skipped,
        range: messages === 0 ? null : { from, to },
        receipts: receipts.sort((a, b) => a.at - b.at),
        bookings: dedupeBookings(bookings),
        trialsEnding: trials.sort((a, b) => a.at - b.at),
        sensitive: [...kinds.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
        alarms,
        missed: { receipts: [...missed.receipts.values()], bookings: [...missed.bookings.values()] },
      };
    },
  };
}

/** Confirmations, reminders and web check-in mails for one booking count once; a cancellation cancels it. */
function dedupeBookings(bs: readonly Booking[]): Booking[] {
  const out = new Map<string, Booking>();
  for (const b of [...bs].sort((x, y) => x.at - y.at)) {
    const key = b.ref !== undefined ? `${b.provider}|${b.ref}` : `${b.provider}|${b.kind}|${b.route ?? ''}|${new Date(b.travelAt ?? b.at).toISOString().slice(0, 10)}`;
    const prev = out.get(key);
    out.set(key, prev === undefined ? b : { ...prev, ...b, at: prev.at, cancelled: prev.cancelled || b.cancelled });
  }
  return [...out.values()];
}

export function isMailSummary(text: string): boolean {
  return /^\{\s*"orbMail"\s*:\s*1/.test(text.trimStart());
}
