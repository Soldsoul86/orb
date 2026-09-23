// Reads SMS exports and turns bank/UPI alerts into transactions. Pure.
//
// Supported exports:
//   · ADB:  adb shell content query --uri content://sms/inbox --projection address:date:body
//           (without --projection also works; body is found by the next known column)
//   · "SMS Backup & Restore" XML (<sms address="…" date="…" body="…"/>)
//
// Bank wordings differ; the parser is tolerant and returns null when unsure.
// Unrecognised formats are counted by the caller so they can be added.

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

const NAME = "[A-Za-z][A-Za-z0-9 .&'()-]{0,48}?";
const COUNTERPARTY: readonly RegExp[] = [
  new RegExp(`UPI\\/(?:P2[AMP]|CR|DR)\\/\\d+\\/(${NAME})(?:\\/|\\n|$)`, 'i'), // Axis, some others
  new RegExp(`\\btrf to\\s+(${NAME})\\s+Ref`, 'i'), // SBI
  new RegExp(`;\\s*(${NAME})\\s+credited`, 'i'), // ICICI
  new RegExp(`(?:^|\\n)To\\s+(${NAME})\\s*(?:\\n|$)`, 'i'), // HDFC "To NAME" on its own line
  new RegExp(`(?:^|\\n)From\\s+(${NAME})\\s*(?:\\n|$)`, 'i'),
  new RegExp(`\\b(?:to|towards)\\s+(${NAME})\\s+(?:on|via|ref|upi)\\b`, 'i'),
  new RegExp(`\\b(?:from|by)\\s+(${NAME})\\s+(?:on|via|ref|upi)\\b`, 'i'),
  new RegExp(`\\bat\\s+(${NAME})\\s+(?:on|via|ref)\\b`, 'i'), // card spends: "spent … at SWIGGY on …"
];

function counterpartyOf(body: string): { name: string; vpa?: string } | undefined {
  const vpa = body.match(VPA)?.[1]?.toLowerCase();
  for (const re of COUNTERPARTY) {
    const name = body.match(re)?.[1]?.trim().replace(/[.,;:-]+$/, '');
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
  if (/\b(otp|one[- ]time password|verification code)\b/i.test(body) && /\b\d{4,8}\b\s+is\b|\b(otp)\s*(?:is|:)/i.test(body)) return null;
  if (/\b(offer|cashback up to|eligible for|pre-approved|apply now|win)\b/i.test(body) && !/\bdebited|credited\b/i.test(body)) return null;
  if (!/\b(a\/c|acct|ac|account|card|upi|vpa)\b/i.test(body)) return null;
  const dir = direction(body);
  const amount = amountOf(body);
  if (dir === undefined || amount === undefined) return null;
  const who = counterpartyOf(body);
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
  return /\b(debited|credited)\b/i.test(sms.body) && MONEY.test(sms.body) && parseBankAlert(sms) === null;
}
