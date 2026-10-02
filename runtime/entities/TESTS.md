# Tests

`tests/handle-cases.ts` — the spec, written by hand: what each kind must find and what it must **not** (order ids, card numbers,
version numbers, invalid dates, mentions). `tests/handles.test.ts` runs every case, the bounds (a million characters, 200 handles),
and determinism. The phone's Kotlin runs the same cases from `runtime/brain/tests/vectors/handles.json`.

`tests/relative-cases.ts` — 54 hand-written relative-day cases **worked out on a calendar** (25 must find, 29 must not): tomorrow, the day after, *in N days/weeks* (and the limits), each weekday and the same-weekday rule, every exclusion (*next, last, previous, past, every, each, other, any, since, following*, plurals, abbreviations, line breaks), month, year and leap-day ends, invalid anchors. `tests/relative.test.ts` runs them, the bounds and determinism, and checks the serialised vectors for the Kotlin (`runtime/brain/tests/vectors/relative.json`).

`tests/name-cases.ts` — 31 hand-written name cases (what a text must name **and must not**): full names in any case and with extra spaces, unique and shared first names, capitalisation (*Will* the contact is not *will* the verb), whole words and longer words, possessives, accents, Devanagari, a character whose lower case is two characters, the length bound, many contacts. `tests/names.test.ts` runs them, the bounds and determinism, and checks the serialised vectors for the Kotlin (`runtime/brain/tests/vectors/names.json`).
