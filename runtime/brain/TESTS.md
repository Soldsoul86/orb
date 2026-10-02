# Tests

`tests/run.sh` — 378 checks on a desktop JVM, no library (`Harness.kt`).

- **JsonTest** — what is read, and 25 things refused, including hostile depth.
- **ObserverTest** — one Observation per event, idempotent by citation, order, what stays an event,
  unreadable means nothing written, the v2 envelope, hostile payloads.
- **TranslateTest** — output keys within the TypeScript field lists; **the shared vectors**
  (`tests/vectors/observations.json`, computed by TypeScript) over hand cases *and* over the phone-written fixtures.
- **GraphTest** — the Evidence Graph held to `@orb/evidence` by `tests/vectors/graph.json`: 9 scenarios (a hand-made history, four damaged variants, three phone-written fixtures), 483 questions, every answer — including the order of `unresolved` — identical; plus unreadable lines, no content, sensor matching, cycles.
- **HandlesTest** — the 64 hand-written handle cases (`tests/vectors/handles.json`, serialised from `runtime/entities/tests/handle-cases.ts` — **not** computed from either implementation), the bounds (a million characters, 200 handles), determinism, a card number never in the answer.
- **RelativeDaysTest** — the 54 hand-written relative-day cases (`tests/vectors/relative.json`, serialised from `runtime/entities/tests/relative-cases.ts`), the bounds and determinism.
- **NamesTest** — the 45 hand-written name cases (`tests/vectors/names.json`, serialised from `runtime/entities/tests/name-cases.ts`), the bounds and determinism.
- **PurityTest** — no Android, files, network, clock or output in the sources.

Mutation-checked (graph): dropping the cannot-say naming, the visited set, the unheld-cause naming, the sort of `unresolved`, the unreadable-line marks, the occurrence tiebreak, the kind of a cited event, and "no stated lineage" each fail named checks (removing the visited set shows as an out-of-memory run on the cycle scenario rather than a clean failure — a hang in CI is still a failure, but the cycle check is the one to watch). Also run over the operator's two real v19 exports: **1,393 questions, Kotlin identical to TypeScript on every one**.

Mutation-checked (translation): coercing a type, dropping the citation check, ignoring an unreadable line, allowing a
duplicate key, and loosening the attachment identity each fail named checks. Also run once over the
operator's real 185-event export: 0 unreadable, 31 Observations, **identical to TypeScript's on all 31**.

Regenerate vectors: `npm run build && node scripts/write-brain-vectors.mjs`; a stale file fails the TS suite.
