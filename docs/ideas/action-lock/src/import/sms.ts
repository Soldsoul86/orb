// Reads SMS exports and turns bank/UPI alerts into transactions. Pure.
//
// Supported exports:
//   · ADB:  adb shell content query --uri content://sms/inbox --projection address:date:body
//           (without --projection also works; body is found by the next known column)
//   · "SMS Backup & Restore" XML (<sms address="…" date="…" body="…"/>)
//
// Bank wordings differ; the parser is tolerant and returns null when unsure.
// Unrecognised formats are counted by the caller so they can be added.

import type { MandateEvent } from '../subscriptions.ts';
import { counterpartyKey, type Sms, type Txn } from './types.ts';

// ── Export readers ─────────────────────────────────────────────────────────

const ADB_COLUMNS =
  'service_center|locked|sub_id|error_code|creator|seen|priority|reply_path_present|subject|status|protocol|read|type|date_sent|person|thread_id|_id|address|date';

/** Parses `adb shell content query --uri content://sms…` output. */
export function parseAdbSms(dump: string): Sms[] {
  const out: Sms[] = [];
  for (const record of dump.split(/(?:^|\n)Row: \d+ /).filter((r) => r.trim() !== '')) {
    const address = record.match(/(?:^|, )address=([^,]*)/)?.[1]?.trim() ?? '';
    const date = Number(record.match(/(?:^|, )date=(\d+)/)?.[1] ?? NaN);
    const type = Number(record.match(/(?:^|, )type=(\d)/)?.[1] ?? NaN);
    const bodyAt = record.search(/(?:^|, )body=/);
    if (bodyAt < 0 || Number.isNaN(date)) continue;
    const afterBody = record.slice(record.indexOf('body=', bodyAt) + 'body='.length);
    const end = afterBody.search(new RegExp(`, (?:${ADB_COLUMNS})=`));
    const body = (end < 0 ? afterBody : afterBody.slice(0, end)).replace(/\s+$/, '');
    out.push({ address, date, body, ...(Number.isNaN(type) ? {} : { type }) });
  }
  return out;
}

function xmlDecode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Parses an "SMS Backup & Restore" XML export. */
export function parseSmsBackupXml(xml: string): Sms[] {
  const out: Sms[] = [];
  for (const m of xml.matchAll(/<sms\s([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/(\w+)="([^"]*)"/g)) attrs[a[1]!] = xmlDecode(a[2]!);
    const date = Number(attrs['date']);
    if (attrs['body'] === undefined || Number.isNaN(date)) continue;
    const type = Number(attrs['type']);
    out.push({ address: attrs['address'] ?? '', date, body: attrs['body'], ...(Number.isNaN(type) ? {} : { type }) });
  }
  return out;
}

// ── Alert parsing ──────────────────────────────────────────────────────────

const BANKS: readonly [RegExp, string][] = [
  [/HDFC/i, 'HDFC Bank'],
  [/SBI/i, 'SBI'],
  [/ICICI/i, 'ICICI Bank'],
  [/AXIS/i, 'Axis Bank'],
  [/KOTAK/i, 'Kotak Bank'],
  [/PNB/i, 'PNB'],
  [/BOB|BARODA/i, 'Bank of Baroda'],
  [/CANBNK|CANARA/i, 'Canara Bank'],
  [/IDFC/i, 'IDFC FIRST Bank'],
  [/YES/i, 'Yes Bank'],
  [/INDUS/i, 'IndusInd Bank'],
  [/FEDBNK|FEDERAL/i, 'Federal Bank'],
  [/UNION|UBOI/i, 'Union Bank'],
  [/PAYTM|PYTM/i, 'Paytm Payments Bank'],
  [/AIRTEL|ARTL/i, 'Airtel Payments Bank'],
];

function bankOf(sender: string, body: string): string | undefined {
  const tail = sender.replace(/^[A-Z]{2}-/, '');
  return BANKS.find(([re]) => re.test(tail))?.[1] ?? BANKS.find(([re]) => re.test(body))?.[1];
}

const MONEY = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT = /\b(debited|sent|paid|spent|withdrawn|transferred|dr\.?)\b/i;
const CREDIT = /\b(credited|received|deposited|cr\.?)\b/i;
const VPA = /\b([a-z0-9][\w.-]{1,255}@[a-z][a-z0-9]{1,63})\b(?![.\w])/i;

/** Pick the earliest match of either keyword: "debited …; X credited" is a debit. */
function direction(body: string): 'debit' | 'credit' | undefined {
  const d = body.search(DEBIT);
  const c = body.search(CREDIT);
  if (d < 0 && c < 0) return undefined;
  if (c < 0) return 'debit';
  if (d < 0) return 'credit';
  return d < c ? 'debit' : 'credit';
}

function amountOf(body: string): number | undefined {
  const m = body.match(MONEY) ?? body.match(/\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)/i);
  if (m === null) return undefined;
  const n = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Indian sender IDs end in a DLT category: -P promotional, -S service,
 * -T transactional, -G government. Promotional messages are never alerts.
 */
export function isPromotional(sender: string): boolean {
  return /-P$/i.test(sender.trim());
}

const NAME = "[A-Za-z][A-Za-z0-9 .&'()-]{0,48}?";
const COUNTERPARTY: readonly RegExp[] = [
  new RegExp(`UPI\\/(?:P2[AMP]|CR|DR)\\/\\d+\\/(${NAME})(?:\\/|\\.(?:\\s|$)|\\n|$)`, 'i'), // Axis, AU and others
  new RegExp(`\\bRef\\s+(?:IMPS|NEFT|RTGS)[-/ ]?\\d*\\s*-\\s*(${NAME})\\s*(?:-|\\.|$)`, 'i'), // AU: "Ref IMPS-6245… -NAME -IC"
  new RegExp(`\\btrf to\\s+(${NAME})\\s+Ref`, 'i'), // SBI
  new RegExp(`;\\s*(${NAME})\\s+credited`, 'i'), // ICICI
  new RegExp(`(?:^|\\n)To\\s+(${NAME})\\s*(?:\\n|$)`, 'i'), // HDFC "To NAME" on its own line
  new RegExp(`(?:^|\\n)From\\s+(${NAME})\\s*(?:\\n|$)`, 'i'),
  new RegExp(`\\b(?:to|towards)\\s+(${NAME})\\s+(?:on|via|ref|upi)\\b`, 'i'),
  new RegExp(`\\b(?:from|by)\\s+(${NAME})\\s+(?:on|via|ref|upi)\\b`, 'i'),
  new RegExp(`\\bat\\s+(${NAME})\\s+(?:on|via|ref)\\b`, 'i'), // card spends: "spent … at SWIGGY on …"
  /\bRef\s+([A-Z][A-Z ]{3,40}?)\.\s/, // AU: "Ref MONTHLY INTEREST PAYOUT. Bal …" (upper case only)
  /(?:^|\n)[A-Z]{2,6}[-/][\w/-]+\s+-\s*([A-Z][A-Za-z .&'-]{1,40}?)\s*(?:\n|$)/, // AU: "NDA-4795-18226161 -NAME" on its own line
  /\bfor\s+([A-Za-z][A-Za-z0-9_ -]{2,40}?)\.(?:\s|$)/, // bank charges: "Debited … for SMS_Alert_Charge_JAN26."
];

/** Brands behind common service sender IDs, for alerts that name no counterparty (refunds). */
const SENDER_BRANDS: readonly [RegExp, string][] = [
  [/MMTRIP|MAKEMY/i, 'MakeMyTrip'],
  [/AIRINF|AIRTEL/i, 'Airtel'],
  [/JIOINF|JIOPAY|MYJIO/i, 'Jio'],
  [/SWIGGY/i, 'Swiggy'],
  [/ZOMATO/i, 'Zomato'],
  [/AMAZON|AMZN/i, 'Amazon'],
  [/FLPKRT|FLIPKT|FKRT/i, 'Flipkart'],
  [/IRCTC/i, 'IRCTC'],
  [/UBER/i, 'Uber'],
  [/OLA/i, 'Ola'],
];

/** "AD-MMTRIP-S" → "MakeMyTrip"; unknown headers → their middle part. */
export function senderBrand(sender: string): string | undefined {
  const core = sender.trim().replace(/^[A-Z]{2}-/, '').replace(/-[PSTG]$/i, '');
  if (!/^[A-Za-z0-9]{3,9}$/.test(core) || /^\d+$/.test(core)) return undefined;
  return SENDER_BRANDS.find(([re]) => re.test(core))?.[1] ?? core;
}

/** Marketing that mentions money ("Rs.1000 credited in your wallet … 50% OFF"). */
const MARKETING = /\b(?:T&C|T & C|\d+%\s*off|flat\s+\d+%|use code|coupon|sale\b|shop now|offer ends|limited period)/i;
/** A payment that did not go through. */
const FAILED = /\b(?:has|have|had)\s+failed\b|\bpayment failed\b|\btransaction (?:has )?failed\b|\bwill be refunded\b/i;

function counterpartyOf(body: string): { name: string; vpa?: string } | undefined {
  const vpa = body.match(VPA)?.[1]?.toLowerCase();
  for (const re of COUNTERPARTY) {
    const name = body.match(re)?.[1]?.trim().replace(/[.,;:-]+$/, '').replace(/_+/g, ' ').trim();
    if (name !== undefined && !/^(?:a\/?c|acct|account|your|ac)\b/i.test(name) && !/bank a\/?c/i.test(name)) {
      return vpa !== undefined ? { name, vpa } : { name };
    }
  }
  return vpa !== undefined ? { name: vpa, vpa } : undefined;
}

const ACCOUNT = /\b(?:a\/c|acct|ac|account|card)(?:\s*no\.?)?[^\dXx*\n]{0,6}[Xx*]*\s?(\d{3,4})\b/i;
const REF = /\b(?:ref(?:\s*no)?|refno|rrn|upi(?:\s*ref)?)[:\s.#-]*(\d{10,16})\b/i;

/** Bank or UPI alert → transaction; null for anything else (OTPs, offers, reminders). */
export function parseBankAlert(sms: Sms): Txn | null {
  const body = sms.body;
  if (isPromotional(sms.address)) return null;
  if (/\b(otp|one[- ]time password|verification code)\b/i.test(body) && /\b\d{4,8}\b\s+is\b|\b(otp)\s*(?:is|:)/i.test(body)) return null;
  if (/\b(offer|cashback up to|eligible for|pre-approved|apply now|win)\b/i.test(body) && !/\bdebited|credited\b/i.test(body)) return null;
  if (MARKETING.test(body) || FAILED.test(body)) return null;
  if (!/\b(a\/c|acct|ac|account|card|upi|vpa)\b/i.test(body)) return null;
  // Pre-debit notices ("will be debited on 25-09-2025") are not payments yet.
  if (FUTURE.test(body)) return null;
  const dir = direction(body);
  const amount = amountOf(body);
  if (dir === undefined || amount === undefined) return null;
  // Refunds from a merchant often name no one: the sender is the counterparty.
  const brand = /\brefund/i.test(body) ? senderBrand(sms.address) : undefined;
  const who = counterpartyOf(body) ?? (brand !== undefined ? { name: brand } : undefined);
  if (who === undefined) return null;
  const account = body.match(ACCOUNT)?.[1];
  const ref = body.match(REF)?.[1] ?? body.match(/\b(\d{12})\b/)?.[1];
  const bank = bankOf(sms.address, body);
  return {
    at: sms.date,
    direction: dir,
    amount,
    counterparty: who.name,
    key: counterpartyKey(who.name, who.vpa),
    ...(who.vpa !== undefined ? { vpa: who.vpa } : {}),
    ...(ref !== undefined ? { ref } : {}),
    ...(account !== undefined ? { account: `XX${account.slice(-4)}` } : {}),
    ...(bank !== undefined ? { bank } : {}),
    source: 'sms',
  };
}

/** Looks like a bank/UPI alert we could not read: worth reporting so the parser can learn it. */
export function looksLikeUnreadAlert(sms: Sms): boolean {
  return (
    !isPromotional(sms.address) &&
    !FUTURE.test(sms.body) &&
    !MARKETING.test(sms.body) &&
    !FAILED.test(sms.body) &&
    /\b(debited|credited)\b/i.test(sms.body) &&
    MONEY.test(sms.body) &&
    parseBankAlert(sms) === null
  );
}

// ── Autopay / e-mandate alerts ─────────────────────────────────────────────

const FUTURE = /\b(?:will|shall) be (?:debited|charged|deducted|auto-?debited)\b|\bis due on\b|\bscheduled (?:for|on)\b|\bupcoming\b/i;
const MANDATE = /\b(auto\s?-?pay|e-?mandate|mandate|standing instruction|si\b|recurring payment|subscription)\b/i;
const MONTHS: Readonly<Record<string, number>> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Dates as banks write them: 25-09-2025, 25/09/25, 25-Sep-25, 25Sep2025. Returns noon IST that day. */
export function parseBankDate(s: string): number | undefined {
  const num = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  const mon = s.match(/\b(\d{1,2})[- ]?([A-Za-z]{3})[a-z]*[- ,]?(\d{2}|\d{4})\b/);
  let d: number, m: number, y: number;
  if (num) [d, m, y] = [Number(num[1]), Number(num[2]) - 1, Number(num[3])];
  else if (mon && MONTHS[mon[2]!.toLowerCase()] !== undefined) [d, m, y] = [Number(mon[1]), MONTHS[mon[2]!.toLowerCase()]!, Number(mon[3])];
  else return undefined;
  if (y < 100) y += 2000;
  if (m < 0 || m > 11 || d < 1 || d > 31) return undefined;
  return Date.UTC(y, m, d, 6, 30); // 12:00 IST
}

const MERCHANT: readonly RegExp[] = [
  new RegExp(`\\b(?:for|towards|to)\\s+(${NAME})\\s+(?:of|for|with|will|is|has|on|max|amount|rs|inr|₹)`, 'i'),
  new RegExp(`\\b(?:for|towards)\\s+(${NAME})\\s*(?:[.,]|$)`, 'i'),
  new RegExp(`\\bby\\s+(${NAME})\\s+(?:has been|is|was)\\s+(?:revoked|cancelled|paused)`, 'i'),
];

/** Autopay / e-mandate alert → event; null for anything else. */
export function parseMandateAlert(sms: Sms): MandateEvent | null {
  const body = sms.body;
  if (isPromotional(sms.address) || !MANDATE.test(body)) return null;
  const event: MandateEvent['event'] | undefined = /\b(revoked|cancell?ed|paused|deactivated|stopped)\b/i.test(body)
    ? 'revoked'
    : FUTURE.test(body)
      ? 'upcoming'
      : /\b(created|registered|set ?up|activated|approved|successfully (?:added|linked))\b/i.test(body)
        ? 'created'
        : /\b(executed|debited|paid|successful)\b/i.test(body)
          ? 'executed'
          : undefined;
  if (event === undefined) return null;
  let merchant: string | undefined;
  for (const re of MERCHANT) {
    const m = body
      .match(re)?.[1]
      ?.trim()
      .replace(/[.,;:-]+$/, '')
      .replace(/\s+(?:upi\s+)?(?:auto\s?-?pay|e-?mandate|mandate|standing instruction|si|subscription)$/i, '');
    // Promo phrases ("continue enjoying 3 months", "view details") are not merchants.
    const junk = /^(?:a\/?c|acct|account|your|ac|upi|the|view|continue|click|tap|up to|details|enjoying|more|autopay)\b/i;
    if (m !== undefined && (m.match(/[a-z]/gi)?.length ?? 0) >= 3 && !junk.test(m)) {
      merchant = m;
      break;
    }
  }
  merchant ??= body.match(VPA)?.[1]?.toLowerCase();
  if (merchant === undefined) return null;
  const amount = amountOf(body);
  const frequency = body.match(/\b(daily|weekly|fortnightly|monthly|bi-?monthly|quarterly|half-?yearly|yearly|annually|as presented|one ?time)\b/i)?.[1]?.toLowerCase();
  const dueAt = event === 'upcoming' ? parseBankDate(body.slice(body.search(FUTURE))) : undefined;
  return {
    at: sms.date,
    event,
    merchant,
    ...(amount !== undefined ? { amount } : {}),
    ...(frequency !== undefined ? { frequency } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
  };
}
