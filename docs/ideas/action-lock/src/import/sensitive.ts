// Finds confidential data in imported text, so it can be reported to the user
// and masked before anything is stored. Pure; deterministic.

export type SensitiveKind =
  | 'otp'
  | 'card_number'
  | 'account_number'
  | 'pan'
  | 'aadhaar'
  | 'recovery_phrase'
  | 'private_key'
  | 'api_key'
  | 'password';

export interface SensitiveHit {
  readonly kind: SensitiveKind;
  /** Safe to show: most characters replaced. */
  readonly masked: string;
  readonly start: number;
  readonly end: number;
}

export const LABELS: Readonly<Record<SensitiveKind, string>> = {
  otp: 'One-time codes (OTPs)',
  card_number: 'Full card numbers',
  account_number: 'Full bank account numbers',
  pan: 'PAN numbers',
  aadhaar: 'Aadhaar numbers',
  recovery_phrase: 'Possible wallet recovery phrases',
  private_key: 'Possible private keys',
  api_key: 'API keys or tokens',
  password: 'Passwords',
};

/** Keep the last `keep` characters; mask the rest. */
export function maskTail(value: string, keep = 4): string {
  const clean = value.replace(/\s|-/g, '');
  return clean.length <= keep ? '•'.repeat(clean.length) : `${'•'.repeat(Math.min(8, clean.length - keep))}${clean.slice(-keep)}`;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Verhoeff checksum, used by Aadhaar numbers.
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeff(digits: string): boolean {
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = V_D[c]![V_P[i % 8]![Number(rev[i])]!]!;
  return c === 0;
}

interface Detector {
  readonly kind: SensitiveKind;
  readonly re: RegExp;
  /** Which capture group holds the secret (0 = whole match). */
  readonly group?: number;
  readonly accept?: (value: string) => boolean;
  readonly mask?: (value: string) => string;
}

const DETECTORS: readonly Detector[] = [
  // OTP messages: "123456 is your OTP", "OTP is 123456", "verification code: 1234".
  { kind: 'otp', re: /\b(\d{4,8})\s+is\s+(?:your|the)\s+(?:otp|one[- ]time password|verification code|security code|code)\b/gi, group: 1, mask: () => '••••' },
  // "OTP is 482913", "OTP: 482913", "Use OTP 482913", "Your OTP for login is 482913".
  // Not "Never share your OTP" or "OTP for txn of INR 1250" (no "is" or ":").
  { kind: 'otp', re: /\b(?:otp|one[- ]time password|verification code|security code)\b(?:[^\d\n]{0,30}?\b(?:is|:)\s*|:\s*|\s+)(\d{4,8})\b/gi, group: 1, mask: () => '••••' },
  { kind: 'card_number', re: /\b(?:\d[ -]?){15,18}\d\b/g, accept: (v) => luhn(v.replace(/\D/g, '')) && /^[3-6]/.test(v.replace(/\D/g, '')) },
  { kind: 'pan', re: /\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/g, mask: (v) => `${v.slice(0, 2)}•••••••${v.slice(-1)}` },
  // Aadhaar: only with the word nearby or in its printed 4-4-4 form, because
  // 12-digit UPI reference numbers would otherwise pass the checksum 1 in 10 times.
  { kind: 'aadhaar', re: /\b(?:aadhaa?r|uidai|uid)\b[^\d\n]{0,20}([2-9]\d{3}[ -]?\d{4}[ -]?\d{4})\b/gi, group: 1, accept: (v) => verhoeff(v.replace(/\D/g, '')) },
  { kind: 'aadhaar', re: /\b[2-9]\d{3}[ -]\d{4}[ -]\d{4}\b/g, accept: (v) => verhoeff(v.replace(/\D/g, '')) },
  // Unmasked account numbers next to an account word (masked ones like XX1234 don't match).
  { kind: 'account_number', re: /\b(?:a\/c|acct|account|ac)\.?\s*(?:no\.?|number)?\s*[:#]?\s*(\d{9,18})\b/gi, group: 1 },
  // 64 hex characters is also a transaction hash, so only with a key word nearby.
  { kind: 'private_key', re: /\b(?:private[ _-]?key|priv[ _-]?key|secret[ _-]?key|secret)\b[^0-9a-fA-F\n]{0,20}((?:0x)?[0-9a-fA-F]{64})\b/gi, group: 1 },
  { kind: 'private_key', re: /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g },
  { kind: 'api_key', re: /\b(?:sk|pk|rk)[-_](?:live|test)?[-_]?[A-Za-z0-9]{16,}\b/g },
  { kind: 'api_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'api_key', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { kind: 'password', re: /\b(?:password|passwd|pwd|pass)\s*[:=]\s*(\S{4,})/gi, group: 1, mask: () => '••••••' },
];

// A line of 12, 15, 18, 21 or 24 short lowercase words and nothing else.
const PHRASE = /(?:^|\n)[ \t]*((?:[a-z]{3,8}[ \t]+){11,23}[a-z]{3,8})[ \t]*(?=\n|$)/g;

function findPhrases(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  for (const m of text.matchAll(PHRASE)) {
    const words = m[1]!.trim().split(/[ \t]+/);
    if (![12, 15, 18, 21, 24].includes(words.length)) continue;
    if (new Set(words).size < words.length * 0.7) continue; // mostly repeated words: not a phrase
    const start = (m.index ?? 0) + m[0].indexOf(m[1]!);
    hits.push({ kind: 'recovery_phrase', masked: `${words[0]} ••• (${words.length} words)`, start, end: start + m[1]!.length });
  }
  return hits;
}

/** Every confidential item found in `text`, in order, without overlaps. */
export function scanSensitive(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [...findPhrases(text)];
  for (const d of DETECTORS) {
    for (const m of text.matchAll(d.re)) {
      const value = m[d.group ?? 0];
      if (value === undefined || (d.accept !== undefined && !d.accept(value))) continue;
      const start = (m.index ?? 0) + m[0].indexOf(value);
      hits.push({ kind: d.kind, masked: (d.mask ?? maskTail)(value), start, end: start + value.length });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: SensitiveHit[] = [];
  for (const h of hits) if (kept.length === 0 || h.start >= kept[kept.length - 1]!.end) kept.push(h);
  return kept;
}

/** `text` with every confidential item replaced by its masked form. */
export function redact(text: string, hits: readonly SensitiveHit[] = scanSensitive(text)): string {
  let out = '';
  let at = 0;
  for (const h of hits) {
    out += text.slice(at, h.start) + h.masked;
    at = h.end;
  }
  return out + text.slice(at);
}

export interface SensitiveReport {
  readonly total: number;
  readonly byKind: readonly { readonly kind: SensitiveKind; readonly label: string; readonly count: number; readonly examples: readonly string[] }[];
}

/** Collects hits across many texts into a report for the user. */
export function sensitiveReport(hitsPerText: readonly (readonly SensitiveHit[])[]): SensitiveReport {
  const by = new Map<SensitiveKind, { count: number; examples: string[] }>();
  for (const hits of hitsPerText) {
    for (const h of hits) {
      const e = by.get(h.kind) ?? { count: 0, examples: [] };
      e.count++;
      if (e.examples.length < 3 && !e.examples.includes(h.masked)) e.examples.push(h.masked);
      by.set(h.kind, e);
    }
  }
  const byKind = [...by.entries()]
    .map(([kind, e]) => ({ kind, label: LABELS[kind], count: e.count, examples: e.examples }))
    .sort((a, b) => b.count - a.count);
  return { total: byKind.reduce((s, k) => s + k.count, 0), byKind };
}
