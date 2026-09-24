// The message guard: what the lock does with a message you are about to send
// in WhatsApp. Pure. It looks only at the draft and at whether the chat is with
// a saved contact; the draft itself is never stored.
//
// The Accessibility service carries a Kotlin copy (MessageRules.kt), checked
// against the same cases (test/message-vectors.json).

import type { GuardDecision } from './guard.ts';

export interface MessageContext {
  /** The chat title is a bare phone number: not someone in your contacts. */
  readonly unknownSender: boolean;
  /** A phone or WhatsApp call is going on. */
  readonly onCall: boolean;
}

export type MessageFinding = 'code' | 'pin' | 'card' | 'cvv' | 'password' | 'aadhaar' | 'phrase';

export const FINDING_LABEL: Readonly<Record<MessageFinding, string>> = {
  code: 'One-time code',
  pin: 'PIN',
  card: 'Card number',
  cvv: 'Card CVV',
  password: 'Password',
  aadhaar: 'Aadhaar number',
  phrase: 'Recovery phrase',
};

const WHY: Readonly<Record<MessageFinding, string>> = {
  code: 'This looks like a one-time code (OTP). Banks, couriers and support staff never need it; sharing it is how most accounts are taken over.',
  pin: 'This looks like a PIN. No one ever needs it, not even your bank.',
  card: 'This contains a card number.',
  cvv: "This contains a card's CVV. With the number, it is enough to spend on your card.",
  password: 'This contains a password.',
  aadhaar: 'This contains an Aadhaar number.',
  phrase: 'This looks like a wallet recovery phrase. Anyone who has it can take everything in the wallet.',
};

/** Luhn checksum, so ordinary long numbers (order IDs, phone numbers) are not called card numbers. */
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** What in the draft should not be sent. Plain ASCII patterns, identical in the Kotlin copy. */
export function findings(draft: string): MessageFinding[] {
  const t = draft.trim();
  const lower = t.toLowerCase();
  const out: MessageFinding[] = [];
  // A bare 6-digit message is almost always a code; other lengths need a word like "OTP" or "code".
  if (/^\d{6}$/.test(t) || (/(^|[^a-z])(otp|code|verification|one time|one-time)([^a-z]|$)/.test(lower) && /(^|[^0-9])\d{4,8}([^0-9]|$)/.test(t))) out.push('code');
  if (/(^|[^a-z])(upi pin|atm pin|mpin|pin)([^a-z]|$)[^0-9]{0,12}\d{4,6}([^0-9]|$)/.test(lower)) out.push('pin');
  for (const m of t.matchAll(/\d[\d -]{11,22}\d/g)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      out.push('card');
      break;
    }
  }
  if (/(^|[^a-z])(cvv|cvc)([^a-z]|$)[^0-9]{0,10}\d{3,4}([^0-9]|$)/.test(lower)) out.push('cvv');
  // "password is …" / "password: …", or a word after it that has a digit or symbol ("forgot my password again" is fine).
  if (/(^|[^a-z])(password|passwd|pwd|passcode)\s*(is|:|=|-)\s*[^\s]{4,}/.test(lower) || /(^|[^a-z])(password|passwd|pwd|passcode)\s+[^\s]*[0-9@#$%!&*][^\s]*/.test(lower)) out.push('password');
  // Exactly three groups of four (a 16-digit card printed in fours is not an Aadhaar).
  if (/(?<![0-9])(?<![0-9] )\d{4} \d{4} \d{4}(?! ?[0-9])/.test(t) || (/aadhaa?r/.test(lower) && /(^|[^0-9])\d{12}([^0-9]|$)/.test(t))) out.push('aadhaar');
  const words = lower.split(/\s+/).filter((w) => w !== '');
  if (words.length >= 12 && words.every((w) => /^[a-z]{3,8}$/.test(w))) out.push('phrase');
  return out;
}

export function checkMessage(draft: string, ctx: MessageContext): GuardDecision & { readonly findings: readonly MessageFinding[] } {
  const found = findings(draft);
  if (found.length === 0) return { mode: 'pass', seconds: 0, reasons: [], findings: found };
  const reasons = found.map((f) => WHY[f]);
  let seconds = 10;
  let confirm = found.some((f) => f === 'pin' || f === 'card' || f === 'cvv' || f === 'phrase');
  if (confirm) seconds = 20;
  if (ctx.unknownSender) {
    reasons.push("You're sending it to a number that isn't in your contacts.");
    seconds = Math.max(seconds, 20);
    confirm = true;
  }
  if (ctx.onCall) {
    reasons.push("You're on a call. Scammers ask for codes while they keep you talking.");
    seconds += 10;
    confirm = true;
  }
  return { mode: confirm ? 'confirm' : 'wait', seconds, reasons, findings: found };
}
