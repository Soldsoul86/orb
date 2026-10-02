/**
 * What the extractor must find — and, as much, what it must **not** — written by hand.
 *
 * These are the spec. The TypeScript reference and the phone's Kotlin are both held to them (the Kotlin through
 * `runtime/brain/tests/vectors/handles.json`, written from this file), so the two cannot agree with each other
 * by accident: each is checked against an answer a person wrote down.
 */
import type { Handle } from "../src/handles.js";

export interface HandleCase {
  readonly name: string;
  readonly text: string;
  readonly expect: readonly Handle[];
}

const phone = (value: string): Handle => ({ kind: "phone", value });
const site = (value: string): Handle => ({ kind: "site", value });
const email = (value: string): Handle => ({ kind: "email", value });
const upi = (value: string): Handle => ({ kind: "upi", value });
const amount = (value: string): Handle => ({ kind: "amount", value });
const date = (value: string): Handle => ({ kind: "date", value });

export const CASES: readonly HandleCase[] = [
  // ---- nothing, and nothing is not an error
  { name: "empty", text: "", expect: [] },
  { name: "plain words", text: "meet at the red door", expect: [] },

  // ---- phone numbers (India first)
  { name: "+91 with spaces", text: "call +91 98765 43210 now", expect: [phone("+919876543210")] },
  { name: "bare ten digits", text: "9876543210", expect: [phone("+919876543210")] },
  { name: "+91 with hyphens", text: "+91-98765-43210", expect: [phone("+919876543210")] },
  { name: "leading zero", text: "09876543210", expect: [phone("+919876543210")] },
  { name: "91 prefix without a plus", text: "91 98765 43210", expect: [phone("+919876543210")] },
  { name: "in brackets", text: "(+91) 98765 43210", expect: [phone("+919876543210")] },
  { name: "two numbers, in order", text: "Ravi: 98765-43210, Priya: 91234 56789", expect: [phone("+919876543210"), phone("+919123456789")] },
  { name: "the same number two ways is one", text: "9876543210 and +91 98765 43210", expect: [phone("+919876543210")] },
  { name: "a mobile does not start with 5", text: "5876543210", expect: [] },
  { name: "eleven digits is not a mobile", text: "order 12345678901", expect: [] },
  { name: "after a hash it is an id", text: "id#9876543210", expect: [] },
  { name: "after a hash a +91 number is an id too", text: "id#+919876543210", expect: [] },
  { name: "after a hyphen it is an id", text: "ref-9876543210", expect: [] },
  { name: "inside a longer run it is not a mobile", text: "9876543210123", expect: [] },
  { name: "an international number", text: "+1 415 555 2671", expect: [phone("+14155552671")] },
  { name: "another international number", text: "+44 20 7946 0958", expect: [phone("+442079460958")] },
  { name: "an invalid +91 is nothing, not an international guess", text: "+91 12345 67890", expect: [] },
  { name: "beside emoji", text: "😀 9876543210 😀", expect: [phone("+919876543210")] },

  // ---- cards are excluded and never listed
  { name: "a card number is excluded", text: "The 4111 1111 1111 1111 card", expect: [] },
  { name: "a card-like run that fails the check is still no handle", text: "4111 1111 1111 1112", expect: [] },
  { name: "a phone beside a card is still found", text: "9876543210 4111 1111 1111 1111", expect: [phone("+919876543210")] },
  { name: "a card with no spaces is excluded", text: "pay 4111111111111111", expect: [] },
  { name: "a long amount that fails the card check is still an amount", text: "paid ₹ 1234567890123 today", expect: [amount("INR 1234567890123")] },
  { name: "a long amount that passes the card check is excluded", text: "paid ₹ 1234567890128 today", expect: [] },

  // ---- sites
  { name: "a site, without www and path", text: "see https://www.Example.com/a/b?x=1.", expect: [site("example.com")] },
  { name: "a site, without the port", text: "http://sub.example.co.in:8080/path", expect: [site("sub.example.co.in")] },
  { name: "www alone", text: "www.test.org, ok", expect: [site("test.org")] },
  { name: "a host with no dot is not a site", text: "https://localhost/x", expect: [] },
  { name: "a file name is not a site", text: "notes.txt", expect: [] },
  { name: "a non-breaking space ends a link as a space does", text: "https://example.com/a\u00a09876543210", expect: [site("example.com"), phone("+919876543210")] },
  { name: "an email inside a link is the link's", text: "https://example.com/?mail=a@b.com", expect: [site("example.com")] },
  { name: "a number inside a link is the link's", text: "https://example.com/9876543210", expect: [site("example.com")] },

  // ---- email and UPI
  { name: "an email, lower-cased, without the full stop", text: "write to Priya.S@Gmail.com.", expect: [email("priya.s@gmail.com")] },
  { name: "a UPI id", text: "pay ravi@oksbi.", expect: [upi("ravi@oksbi")] },
  { name: "a UPI id made of a number is not also a phone", text: "9876543210@ybl", expect: [upi("9876543210@ybl")] },
  { name: "two UPI ids", text: "name@paytm and name@ibl", expect: [upi("name@paytm"), upi("name@ibl")] },
  { name: "a mention is not a UPI id", text: "@ravi hello", expect: [] },
  { name: "one letter before the at is not a UPI id", text: "a@b", expect: [] },
  { name: "an email with a one-letter ending is nothing", text: "xy@ab.c", expect: [] },

  // ---- amounts
  { name: "rupee sign and a comma", text: "paid ₹1,200 today", expect: [amount("INR 1200")] },
  { name: "Rs. and a short fraction", text: "Rs. 500.5 only", expect: [amount("INR 500.50")] },
  { name: "Indian grouping and a zero fraction", text: "rs 12,34,567.00", expect: [amount("INR 1234567")] },
  { name: "INR", text: "INR 5000", expect: [amount("INR 5000")] },
  { name: "a fraction", text: "₹ 99.99", expect: [amount("INR 99.99")] },
  { name: "rs inside a word is not rupees", text: "Hours 5", expect: [] },
  { name: "no space", text: "RS5", expect: [amount("INR 5")] },
  { name: "a sign with no number", text: "Rs.", expect: [] },

  // ---- dates, day first
  { name: "slashes", text: "on 12/10/2026", expect: [date("2026-10-12")] },
  { name: "hyphens", text: "12-10-2026", expect: [date("2026-10-12")] },
  { name: "ISO", text: "2026-10-12", expect: [date("2026-10-12")] },
  { name: "day, month name, year", text: "12 Oct 2026", expect: [date("2026-10-12")] },
  { name: "ordinal and a full month", text: "12th October, 2026", expect: [date("2026-10-12")] },
  { name: "month first", text: "Oct 12, 2026", expect: [date("2026-10-12")] },
  { name: "dots, two digits each", text: "01.02.2026", expect: [date("2026-02-01")] },
  { name: "a version number is not a date", text: "version 1.2.2026", expect: [] },
  { name: "the thirty-first of February", text: "31/02/2026", expect: [] },
  { name: "a leap day", text: "29/02/2024", expect: [date("2024-02-29")] },
  { name: "not a leap day", text: "29/02/2026", expect: [] },
  { name: "two-digit years are not guessed", text: "12/10/26", expect: [] },
  { name: "March is a month and marching is not", text: "5 March 2026 and 5 Marching 2026", expect: [date("2026-03-05")] },

  // ---- several kinds in order of appearance
  {
    name: "a booking",
    text: "Booked for 3 pm on 5 Nov 2026 at ₹2,000, call 9876543210",
    expect: [date("2026-11-05"), amount("INR 2000"), phone("+919876543210")],
  },
  { name: "devanagari digits are not read", text: "₹ १२३", expect: [] },
];
