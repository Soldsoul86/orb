/**
 * What the name matcher must find — and, as much, what it must **not** — written by hand. The TypeScript reference and the phone's
 * Kotlin are both held to these (`runtime/brain/tests/vectors/names.json`).
 */
import type { NameContact, NameMatch } from "../src/names.js";

export interface NameCase {
  readonly name: string;
  readonly contacts: readonly NameContact[];
  readonly text: string;
  readonly expect: readonly NameMatch[];
  /** Optional: the shared first names these contacts have. */
  readonly shared?: readonly string[];
}

const c = (id: string, name: string): NameContact => ({ id, name });
const full = (id: string, word: string): NameMatch => ({ id, by: "full", word });
const first = (id: string, word: string): NameMatch => ({ id, by: "first", word });

const BOOK = [c("1", "Ravi Kumar"), c("2", "Priya Shah"), c("3", "Anil"), c("4", "Will Smith"), c("5", "Ravi Menon"), c("6", "Jo Lee")];

export const NAME_CASES: readonly NameCase[] = [
  { name: "no contacts, nothing", contacts: [], text: "Ravi called", expect: [] },
  { name: "empty text", contacts: BOOK, text: "", expect: [] },
  { name: "a full name, in its own case", contacts: BOOK, text: "Call Ravi Kumar tomorrow", expect: [full("1", "Ravi Kumar")] },
  { name: "a full name in any case", contacts: BOOK, text: "RAVI KUMAR and priya shah", expect: [full("1", "RAVI KUMAR"), full("2", "priya shah")] },
  { name: "a unique first name, capitalised", contacts: BOOK, text: "Priya said hello", expect: [first("2", "Priya")] },
  { name: "a unique first name that is the whole contact name", contacts: BOOK, text: "Tell Anil", expect: [first("3", "Anil")] },
  { name: "a possessive is the name", contacts: BOOK, text: "Priya's phone", expect: [first("2", "Priya")] },
  { name: "a shared first name alone is never matched", contacts: BOOK, text: "Ravi called", expect: [] },
  { name: "but the full name of one of them is", contacts: BOOK, text: "Ravi Menon called", expect: [full("5", "Ravi Menon")] },
  { name: "the verb is not the contact", contacts: BOOK, text: "I will do it", expect: [] },
  { name: "the capitalised word is", contacts: BOOK, text: "Will is coming", expect: [first("4", "Will")] },
  { name: "a lower-case first name is not read", contacts: BOOK, text: "priya said hello", expect: [] },
  { name: "part of a longer word is not the name", contacts: BOOK, text: "Priyanka and Anilkumar", expect: [] },
  { name: "a name inside a longer word with digits", contacts: BOOK, text: "Priya2", expect: [] },
  { name: "two letters are too short for a first name", contacts: BOOK, text: "Jo is here", expect: [] },
  { name: "several, in contact order, each once", contacts: BOOK, text: "Anil and Priya and Anil", expect: [first("2", "Priya"), first("3", "Anil")] },
  { name: "the full name wins over the first name", contacts: [c("1", "Ravi Kumar")], text: "Ravi Kumar, Ravi", expect: [full("1", "Ravi Kumar")] },
  { name: "a unique first name found later in the text", contacts: [c("1", "Ravi Kumar")], text: "ravi, then Ravi", expect: [first("1", "Ravi")] },
  { name: "extra spaces in the contact's name", contacts: [c("1", "Ravi   Kumar")], text: "Ravi Kumar", expect: [full("1", "Ravi Kumar")] },
  { name: "a phrase broken by a line is not the full name", contacts: [c("1", "Ravi Kumar"), c("2", "Ravi Menon")], text: "Ravi\nKumar", expect: [] },
  { name: "Devanagari has no case, so a first name is read", contacts: [c("1", "रवि कुमार"), c("2", "प्रिया")], text: "प्रिया ने कहा", expect: [first("2", "प्रिया")] },
  { name: "a full name in Devanagari", contacts: [c("1", "रवि कुमार")], text: "आज रवि कुमार आया", expect: [full("1", "रवि कुमार")] },
  { name: "accented names", contacts: [c("1", "José García")], text: "Ask José García", expect: [full("1", "José García")] },
  { name: "an accented first name, capitalised", contacts: [c("1", "Élodie Martin")], text: "Élodie is here", expect: [first("1", "Élodie")] },
  { name: "punctuation ends a word", contacts: BOOK, text: "(Priya), Anil; Will.", expect: [first("2", "Priya"), first("3", "Anil"), first("4", "Will")] },
  { name: "a contact with only initials has no usable name", contacts: [c("1", "A B")], text: "A B", expect: [full("1", "A B")] },
  { name: "characters that lower-case to two do not shift what is found", contacts: [c("1", "Priya")], text: "İİİ Priya", expect: [first("1", "Priya")] },
  { name: "a contact with an empty name", contacts: [c("1", "")], text: "anything", expect: [] },
  { name: "shared first names are listed", contacts: BOOK, text: "", expect: [], shared: ["ravi"] },
  { name: "no shared first names", contacts: [c("1", "Priya Shah"), c("2", "Anil")], text: "", expect: [], shared: [] },
  { name: "a shared one-word name too", contacts: [c("1", "Anil"), c("2", "Anil Rao")], text: "", expect: [], shared: ["anil"] },
];
