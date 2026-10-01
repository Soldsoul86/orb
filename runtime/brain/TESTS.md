# Tests

`tests/run.sh` — 135 checks on a desktop JVM, no library (`Harness.kt`).

- **JsonTest** — what is read, and 25 things refused, including hostile depth.
- **ObserverTest** — one Observation per event, idempotent by citation, order, what stays an event,
  unreadable means nothing written, the v2 envelope, hostile payloads.
- **TranslateTest** — output keys within the TypeScript field lists; **the shared vectors**
  (`tests/vectors/observations.json`, computed by TypeScript) over hand cases *and* over the phone-written fixtures.
- **PurityTest** — no Android, files, network, clock or output in the sources.

Mutation-checked: coercing a type, dropping the citation check, ignoring an unreadable line, allowing a
duplicate key, and loosening the attachment identity each fail named checks. Also run once over the
operator's real 185-event export: 0 unreadable, 31 Observations, **identical to TypeScript's on all 31**.

Regenerate vectors: `npm run build && node scripts/write-brain-vectors.mjs`; a stale file fails the TS suite.
