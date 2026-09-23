// UPI deep links (NPCI UPI Linking Specification): upi://pay?pa=…&pn=…&am=…
// Pure parsing and building; no Android here.

export interface UpiPayment {
  /** Payee address (VPA), e.g. name@bank. */
  readonly pa: string;
  /** Payee name. */
  readonly pn?: string;
  /** Amount in rupees, as a decimal string. */
  readonly am?: string;
  readonly cu?: string;
  /** Transaction note. */
  readonly tn?: string;
  /** Transaction reference. */
  readonly tr?: string;
  /** Merchant code, present on merchant QRs. */
  readonly mc?: string;
  /** Every parameter from the original link, so forwarding loses nothing. */
  readonly params: Readonly<Record<string, string>>;
}

const VPA = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/;

export type ParseResult = { readonly ok: true; readonly payment: UpiPayment } | { readonly ok: false; readonly reason: string };

export function parseUpiLink(link: string): ParseResult {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return { ok: false, reason: 'not a link' };
  }
  if (url.protocol.toLowerCase() !== 'upi:') return { ok: false, reason: 'not a UPI link' };
  // "upi://pay?…" parses with host "pay"; accept "upi:pay?…" too.
  const target = (url.host || url.pathname.replace(/^\/+/, '')).toLowerCase();
  if (target !== 'pay') return { ok: false, reason: `unsupported UPI link: ${target || 'empty'}` };

  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams) params[k] = v;
  const pa = params['pa'];
  if (pa === undefined || !VPA.test(pa)) return { ok: false, reason: 'missing or invalid payee UPI ID' };
  const am = params['am'];
  if (am !== undefined && am !== '' && !/^\d+(\.\d{1,2})?$/.test(am)) return { ok: false, reason: 'invalid amount' };

  const pick = (k: string) => (params[k] === undefined || params[k] === '' ? {} : { [k]: params[k] });
  return {
    ok: true,
    payment: { pa: pa.toLowerCase(), ...pick('pn'), ...pick('am'), ...pick('cu'), ...pick('tn'), ...pick('tr'), ...pick('mc'), params },
  };
}

/** Build a link for the UPI app. Keeps every original parameter; `am` may be filled in by the user. */
export function buildUpiLink(payment: UpiPayment, amount?: string): string {
  const params = new URLSearchParams({ ...payment.params, pa: payment.pa, cu: payment.cu ?? 'INR' });
  const am = amount ?? payment.am;
  if (am !== undefined) params.set('am', am);
  // Spaces as %20: some UPI apps don't decode '+'.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export function amountOf(payment: UpiPayment): number {
  return payment.am === undefined ? 0 : Number(payment.am);
}

/** Response string a UPI app returns: "txnId=…&responseCode=…&Status=SUCCESS&txnRef=…". */
export interface UpiResponse {
  readonly status: 'SUCCESS' | 'FAILURE' | 'SUBMITTED' | 'UNKNOWN';
  readonly txnId?: string;
  readonly responseCode?: string;
  readonly approvalRef?: string;
}

export function parseUpiResponse(response: string | null | undefined): UpiResponse {
  if (response === null || response === undefined || response.trim() === '') return { status: 'UNKNOWN' };
  const fields: Record<string, string> = {};
  for (const part of response.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) fields[part.slice(0, i).trim().toLowerCase()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  const raw = (fields['status'] ?? '').toUpperCase();
  const status = raw === 'SUCCESS' || raw === 'FAILURE' || raw === 'SUBMITTED' ? raw : 'UNKNOWN';
  const opt = (key: string, name: string) => (fields[key] ? { [name]: fields[key] } : {});
  return { status, ...opt('txnid', 'txnId'), ...opt('responsecode', 'responseCode'), ...opt('approvalrefno', 'approvalRef') };
}
