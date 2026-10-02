/**
 * What the relative-day reader must find — and, as much, what it must **not** — written by hand, with the dates worked out
 * on a calendar and not by the code (2026-10-06 is a Tuesday).
 *
 * The TypeScript reference and the phone's Kotlin are both held to these (`runtime/brain/tests/vectors/relative.json`).
 */
import type { RelativeDay } from "../src/relative.js";

export interface RelativeCase {
  readonly name: string;
  readonly anchor: string;
  readonly text: string;
  readonly expect: readonly RelativeDay[];
}

const day = (date: string, phrase: string): RelativeDay => ({ date, phrase });
const TUE = "2026-10-06";

export const RELATIVE_CASES: readonly RelativeCase[] = [
  // ---- nothing, and nothing is not an error
  { name: "empty", anchor: TUE, text: "", expect: [] },
  { name: "plain words", anchor: TUE, text: "meet at the red door", expect: [] },
  { name: "an anchor that is not a date reads nothing", anchor: "", text: "tomorrow", expect: [] },
  { name: "an anchor that is not a real day", anchor: "2026-02-30", text: "tomorrow", expect: [] },
  { name: "an anchor outside the years it knows", anchor: "1850-01-01", text: "tomorrow", expect: [] },
  { name: "an anchor in the wrong shape", anchor: "6/10/2026", text: "tomorrow", expect: [] },

  // ---- tomorrow and the day after
  { name: "tomorrow", anchor: TUE, text: "call him tomorrow", expect: [day("2026-10-07", "tomorrow")] },
  { name: "in any case", anchor: TUE, text: "TOMORROW", expect: [day("2026-10-07", "tomorrow")] },
  { name: "the day after tomorrow", anchor: TUE, text: "flight is the day after tomorrow's", expect: [day("2026-10-08", "day after tomorrow")] },
  { name: "tomorrow is a word, not a part of one", anchor: TUE, text: "Tomorrowland", expect: [] },
  { name: "yesterday is the past", anchor: TUE, text: "I sent it yesterday", expect: [] },
  { name: "today is not read", anchor: TUE, text: "see you today, tonight", expect: [] },

  // ---- in N days / weeks
  { name: "in three days", anchor: TUE, text: "in 3 days", expect: [day("2026-10-09", "in 3 days")] },
  { name: "in two weeks, spelled", anchor: TUE, text: "back in two weeks", expect: [day("2026-10-20", "in 2 weeks")] },
  { name: "in one week", anchor: TUE, text: "In 1 week", expect: [day("2026-10-13", "in 1 week")] },
  { name: "in one day", anchor: TUE, text: "in one day", expect: [day("2026-10-07", "in 1 day")] },
  { name: "in a year of days", anchor: TUE, text: "in 365 days", expect: [day("2027-10-06", "in 365 days")] },
  { name: "none is not a number of days", anchor: TUE, text: "in 0 days", expect: [] },
  { name: "a few is not a number", anchor: TUE, text: "in a few days, in a week, soon", expect: [] },
  { name: "too many days", anchor: TUE, text: "in 400 days", expect: [] },
  { name: "too many weeks", anchor: TUE, text: "in 53 weeks", expect: [] },
  { name: "in is a word, not a part of login", anchor: TUE, text: "login 3 days", expect: [] },

  // ---- a weekday, spelled out
  { name: "Friday", anchor: TUE, text: "I'll send it Friday", expect: [day("2026-10-09", "friday")] },
  { name: "on, by, this and coming Friday are all the coming one", anchor: TUE, text: "on Friday, by friday, this Friday, coming Friday", expect: [day("2026-10-09", "friday")] },
  { name: "the weekday that is today means next week's", anchor: TUE, text: "Tuesday", expect: [day("2026-10-13", "tuesday")] },
  { name: "Monday", anchor: TUE, text: "Monday", expect: [day("2026-10-12", "monday")] },
  { name: "Sunday", anchor: TUE, text: "Sunday", expect: [day("2026-10-11", "sunday")] },
  { name: "Wednesday", anchor: TUE, text: "Wednesday", expect: [day("2026-10-07", "wednesday")] },
  { name: "Saturday", anchor: TUE, text: "Saturday", expect: [day("2026-10-10", "saturday")] },
  { name: "a possessive is still the day", anchor: TUE, text: "Friday's meeting", expect: [day("2026-10-09", "friday")] },
  { name: "a weekday on its own line after another word", anchor: TUE, text: "call me\nFriday", expect: [day("2026-10-09", "friday")] },

  // ---- not read: people mean different things, or it recurs
  { name: "next Friday", anchor: TUE, text: "next Friday", expect: [] },
  { name: "last Friday", anchor: TUE, text: "last Friday", expect: [] },
  { name: "previous Friday", anchor: TUE, text: "previous Friday", expect: [] },
  { name: "past Friday", anchor: TUE, text: "past Friday", expect: [] },
  { name: "every Friday", anchor: TUE, text: "every Friday", expect: [] },
  { name: "each Friday", anchor: TUE, text: "each Friday", expect: [] },
  { name: "every other Friday", anchor: TUE, text: "every other Friday", expect: [] },
  { name: "any Friday", anchor: TUE, text: "any Friday", expect: [] },
  { name: "since Friday", anchor: TUE, text: "since Friday", expect: [] },
  { name: "following Friday", anchor: TUE, text: "the following Friday", expect: [] },
  { name: "next across a line break", anchor: TUE, text: "next\nFriday", expect: [] },
  { name: "Fridays recur", anchor: TUE, text: "Fridays", expect: [] },
  { name: "abbreviations are not read", anchor: TUE, text: "Fri, Sat, Sun, Wed, Mon, Tue, Thu", expect: [] },
  { name: "other languages are not read", anchor: TUE, text: "kal, parso, kal subah", expect: [] },

  // ---- calendar arithmetic across the ends
  { name: "end of a month", anchor: "2026-10-31", text: "tomorrow", expect: [day("2026-11-01", "tomorrow")] },
  { name: "end of a year", anchor: "2026-12-31", text: "tomorrow", expect: [day("2027-01-01", "tomorrow")] },
  { name: "a leap day", anchor: "2024-02-28", text: "in 2 days", expect: [day("2024-03-01", "in 2 days")] },
  { name: "not a leap year", anchor: "2023-02-28", text: "tomorrow", expect: [day("2023-03-01", "tomorrow")] },
  { name: "past the years it knows", anchor: "2100-12-31", text: "tomorrow", expect: [] },
  { name: "a weekday across a year end (2026-12-30 is a Wednesday)", anchor: "2026-12-30", text: "Friday", expect: [day("2027-01-01", "friday")] },

  // ---- several, in the order they appear, each date once
  { name: "two in order", anchor: TUE, text: "tomorrow or Friday", expect: [day("2026-10-07", "tomorrow"), day("2026-10-09", "friday")] },
  { name: "the same day two ways is one", anchor: TUE, text: "Wednesday or tomorrow", expect: [day("2026-10-07", "wednesday")] },
  { name: "the day after tomorrow is not also tomorrow", anchor: TUE, text: "day after tomorrow and tomorrow", expect: [day("2026-10-08", "day after tomorrow"), day("2026-10-07", "tomorrow")] },
];
