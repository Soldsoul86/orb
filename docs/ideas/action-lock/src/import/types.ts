/** One money movement from your history, normalised and masked. */
export interface Txn {
  /** Milliseconds since epoch. */
  readonly at: number;
  readonly direction: 'debit' | 'credit';
  /** Rupees. */
  readonly amount: number;
  /** Who the money went to or came from, as the source names them. */
  readonly counterparty: string;
  /** Stable key for "have I paid them before": the UPI ID if known, else the upper-cased name. */
  readonly key: string;
  readonly vpa?: string;
  /** UPI or bank reference. */
  readonly ref?: string;
  /** Masked account, e.g. "XX1234". */
  readonly account?: string;
  readonly bank?: string;
  readonly source: 'sms' | 'google_pay';
  /** The alert named no payee: kept for amounts and hours, left out of payee lists. */
  readonly unnamed?: boolean;
}

export const UNNAMED_KEY = '(not named in the alert)';

/** A text message as read from an export. */
export interface Sms {
  readonly address: string;
  /** Milliseconds since epoch. */
  readonly date: number;
  readonly body: string;
  /** 1 = received, 2 = sent. */
  readonly type?: number;
}

export function counterpartyKey(name: string, vpa?: string): string {
  return vpa !== undefined ? vpa.toLowerCase() : name.toUpperCase().replace(/\s+/g, ' ').trim();
}
