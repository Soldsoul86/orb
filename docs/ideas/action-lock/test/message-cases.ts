// Drafts the TypeScript and Kotlin message guards must both get right.
// `npm run guard-vectors` writes them with the expected decisions to test/message-vectors.json.
import { checkMessage, type MessageContext } from '../src/orb/message.ts';

const known: MessageContext = { unknownSender: false, onCall: false };
const stranger: MessageContext = { unknownSender: true, onCall: false };
const call: MessageContext = { unknownSender: false, onCall: true };

export const DRAFTS: readonly { readonly label: string; readonly draft: string; readonly ctx: MessageContext }[] = [
  { label: 'ordinary message', draft: '5pm today at Sathya\'s or Dolphins koramangala', ctx: known },
  { label: 'a price is not a code', draft: '1500', ctx: known },
  { label: 'a year is not a code', draft: 'See you in 2026', ctx: known },
  { label: 'bare 6-digit code', draft: '482913', ctx: known },
  { label: 'code with a word, to a stranger', draft: 'the otp is 4829', ctx: stranger },
  { label: 'code while on a call', draft: 'Code 482913', ctx: call },
  { label: 'UPI PIN', draft: 'my upi pin is 2468', ctx: known },
  { label: 'card number (valid checksum)', draft: 'card 4111 1111 1111 1111', ctx: known },
  { label: 'long number that is not a card', draft: 'order id 1234567890123456', ctx: known },
  { label: 'CVV', draft: 'cvv 123', ctx: known },
  { label: 'password with a value', draft: 'wifi password: Tiger@2026', ctx: known },
  { label: 'the word password alone', draft: 'I forgot my password again', ctx: known },
  { label: 'Aadhaar, printed format', draft: '2345 6789 0123', ctx: known },
  { label: 'recovery phrase', draft: 'abandon ability able about above absent absorb abstract absurd abuse access accident', ctx: known },
];

export function messageVectors() {
  return { cases: DRAFTS.map((d) => ({ ...d, expected: checkMessage(d.draft, d.ctx) })) };
}
