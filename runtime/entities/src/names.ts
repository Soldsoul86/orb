/**
 * Names: which of a person's contacts a text *mentions by name* — the plain, honest part of "everything about Ravi".
 *
 * `docs/PEOPLE_PHONE.md` §3.4. Rules, not a model, and nothing stored: contacts and text go in, matches come out. A name is
 * **a word that happens to be a name** — *Mark*, *May*, *Will* — so the rules are deliberately plain and every match says which kind it is:
 *
 * - the **full name** (two words or more) matches as a whole-word phrase, in any case — it is distinctive;
 * - a **first name** (the first word, three letters or more) matches **only if it is unique among the contacts** — two Ravis are
 *   matched by full name or number, never by "Ravi" alone — **and only when capitalised** (so *Will* the contact is not *will* the verb;
 *   a script with no case, such as Devanagari, is always "capitalised");
 * - a one-word contact name is a first name by the same rules;
 * - whole words only, letters and digits bound a word, a possessive (*Ravi's*) is the name.
 *
 * The phone's Kotlin is held to the same hand-written cases by shared vectors.
 */

export interface NameContact {
  readonly id: string;
  readonly name: string;
}

export interface NameMatch {
  readonly id: string;
  /** `full` or `first`. */
  readonly by: "full" | "first";
  /** The word or phrase as the text wrote it. */
  readonly word: string;
}

/** Only this much of a text is read. */
export const NAME_MAX_CHARS = 1_000_000;
/** Only this many contacts are considered. */
export const NAME_MAX_CONTACTS = 5000;
/** A first name is at least this many letters. */
export const NAME_MIN_FIRST = 3;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Lower case that **never changes the length** of the text (a few characters lower-case to two), so a position found in the
 * folded text is a position in the original — in this implementation and in the Kotlin one.
 */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

function words(name: string): string[] {
  return name.split(/[ \t\r\n]+/).filter((w) => w.length > 0);
}

function letterCount(word: string): number {
  let n = 0;
  for (const ch of word) if (/\p{L}/u.test(ch)) n++;
  return n;
}

/** The first word of a contact name, if it can serve as a first name. */
function firstName(name: string): string | null {
  const first = words(name)[0];
  return first !== undefined && letterCount(first) >= NAME_MIN_FIRST ? first : null;
}

/** First names (lower case) that more than one contact has. */
export function sharedFirstNames(contacts: readonly NameContact[]): string[] {
  const count = new Map<string, number>();
  for (const c of contacts.slice(0, NAME_MAX_CONTACTS)) {
    const f = firstName(c.name);
    if (f !== null) count.set(fold(f), (count.get(fold(f)) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([w]) => w).sort();
}

function bounded(text: string, start: number, end: number): boolean {
  const before = start === 0 ? "" : [...text.slice(Math.max(0, start - 2), start)].pop() ?? "";
  const after = end >= text.length ? "" : [...text.slice(end, end + 2)][0] ?? "";
  return !(before !== "" && LETTER_OR_DIGIT.test(before)) && !(after !== "" && LETTER_OR_DIGIT.test(after));
}

/** Every position a word occurs at, whole-word, comparing case-insensitively. */
function occurrences(text: string, lowerText: string, word: string): number[] {
  const out: number[] = [];
  const target = fold(word);
  let from = 0;
  for (;;) {
    const at = lowerText.indexOf(target, from);
    if (at < 0) break;
    if (bounded(text, at, at + target.length)) out.push(at);
    from = at + 1;
  }
  return out;
}

function capitalised(ch: string): boolean {
  return ch === ch.toUpperCase();
}

/** The contacts a text mentions by name, each at most once (the first way it was found), in contact order. Never throws. */
export function matchNames(input: string, contacts: readonly NameContact[]): NameMatch[] {
  const text = input.length > NAME_MAX_CHARS ? input.slice(0, NAME_MAX_CHARS) : input;
  const lower = fold(text);
  const shared = new Set(sharedFirstNames(contacts));
  const out: NameMatch[] = [];
  for (const c of contacts.slice(0, NAME_MAX_CONTACTS)) {
    const parts = words(c.name);
    // The full name: two words or more, as a phrase with single spaces, in any case.
    if (parts.length >= 2) {
      const phrase = parts.join(" ");
      const at = occurrences(text, lower, phrase)[0];
      if (at !== undefined) {
        out.push({ id: c.id, by: "full", word: text.slice(at, at + phrase.length) });
        continue;
      }
    }
    const first = firstName(c.name);
    if (first === null || shared.has(fold(first))) continue;
    for (const at of occurrences(text, lower, first)) {
      const ch = [...text.slice(at)][0] ?? "";
      if (capitalised(ch)) {
        out.push({ id: c.id, by: "first", word: text.slice(at, at + first.length) });
        break;
      }
    }
  }
  return out;
}
