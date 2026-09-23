// Reads Google Pay activity from a Google Takeout export. Pure.
//
// In Takeout, choose "My Activity" → format JSON, and include Google Pay.
// The file is Takeout/My Activity/Google Pay/MyActivity.json: a list of
// entries whose titles read like "Paid ₹500.00 to Ravi Kumar". Wordings seen
// in other versions are listed in TITLE; anything else is counted as unread.

import { counterpartyKey, type Txn } from './types.ts';

interface ActivityEntry {
  readonly header?: string;
  readonly title?: string;
  readonly time?: string;
  readonly products?: readonly string[];
  readonly subtitles?: readonly { readonly name?: string }[];
  readonly details?: readonly { readonly name?: string }[];
}

const TITLE =
  /^(Paid|Sent|Received|Transferred)\s+(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)(?:\s+(to|from)\s+(.+?))?(?:\s+using\s+.+)?\s*$/i;

export interface TakeoutResult {
  readonly txns: Txn[];
  /** Google Pay entries whose wording was not recognised. */
  readonly unread: number;
}

export function parseGooglePayActivity(json: string): TakeoutResult {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) throw new Error('Expected a Takeout My Activity JSON list.');
  const txns: Txn[] = [];
  let unread = 0;
  for (const e of data as ActivityEntry[]) {
    const isPay = e.header === 'Google Pay' || e.products?.includes('Google Pay') === true;
    if (!isPay || e.title === undefined || e.time === undefined) continue;
    const m = e.title.match(TITLE);
    const at = Date.parse(e.time);
    if (m === null || Number.isNaN(at)) {
      unread++;
      continue;
    }
    const amount = Number(m[2]!.replace(/,/g, ''));
    const name = (m[4] ?? e.subtitles?.[0]?.name ?? 'Unknown').trim();
    const vpa = name.match(/^[\w.-]+@[a-z][a-z0-9]+$/i) ? name.toLowerCase() : undefined;
    txns.push({
      at,
      direction: /received/i.test(m[1]!) || m[3]?.toLowerCase() === 'from' ? 'credit' : 'debit',
      amount,
      counterparty: name,
      key: counterpartyKey(name, vpa),
      ...(vpa !== undefined ? { vpa } : {}),
      source: 'google_pay',
    });
  }
  return { txns, unread };
}
