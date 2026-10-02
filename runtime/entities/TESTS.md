# Tests

`tests/handle-cases.ts` — the spec, written by hand: what each kind must find and what it must **not** (order ids, card numbers,
version numbers, invalid dates, mentions). `tests/handles.test.ts` runs every case, the bounds (a million characters, 200 handles),
and determinism. The phone's Kotlin runs the same cases from `runtime/brain/tests/vectors/handles.json`.
