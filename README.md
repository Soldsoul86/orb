# Orb

**A personal runtime that continuously learns, reasons and acts alongside its user.**

Orb is a long-lived personal intelligence that grows with its user over years rather
than conversations. It transforms observations into knowledge, knowledge into
understanding, understanding into decisions, and decisions into action — while
preserving the complete, replayable history of how every conclusion was reached.

Its intelligence comes from continuity, not from any single model.
Its foundation is evidence.
Its architecture is local-first, model-independent and built to evolve for decades.

---

## Status

**Phase 3 — Contracts.** All 30 kernel contract specifications in
[`contracts/`](contracts/) are Accepted (2026-09-29), which meets the Phase 3b gate;
the operator accepted that gate on 2026-09-29 (`DR-13`), so Phase 3c is open. Phases 0–2 are complete:
repository foundation, the architecture documents in [`docs/`](docs/), and the
ratified [`CONSTITUTION.md`](CONSTITUTION.md).

Now executable:

| Package | What it is |
| --- | --- |
| [`runtime/journal`](runtime/journal) | The **Event Journal** — append-only, hash-chained, HLC-ordered. Phase 4's first component. |
| [`runtime/observation`](runtime/observation) | **Observations** — the record that something occurred, the bridge from Reality to Knowledge. |
| [`packages/device-watch`](packages/device-watch) | The first closed loop: journal → observation → projection → one rule → a person. |
| [`packages/connector`](packages/connector) | Connector **Sensors** — where an external service (mail, calendar, files) becomes history. |
| [`apps/pixel/orb`](apps/pixel/orb) | The Android runtime on the operator's Pixel: share sensor, grants watch, device journal. |

See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Governing Documents

| Document | Purpose |
| --- | --- |
| [`MASTER.md`](MASTER.md) | Vision, design principles, and the canonical architecture. |
| [`CONSTITUTION.md`](CONSTITUTION.md) | The immutable laws of Orb. Everything else follows them. |
| [`CLAUDE.md`](CLAUDE.md) | Engineering rules, standards, and workflow for contributors. |
| [`docs/`](docs/) | Architectural specifications, reviewed before implementation. |

## Repository Layout

```
orb/
├── apps/            Device-native applications
│   ├── mac/         macOS runtime host
│   └── pixel/       Android/Pixel runtime host
├── runtime/         Core runtime
│   ├── journal/     The Event Journal — the single source of truth
│   └── observation/ Observations — Reality into Knowledge
├── platform/        Cross-cutting platform services
├── packages/        Independent, composable packages
│   ├── device-watch/    The first closed loop over the journal
│   └── connector/       Connector Sensors for external services
├── contracts/       Per-contract kernel specifications
├── docs/            Architecture documents
├── tests/           Cross-package and acceptance tests
├── scripts/         Repository automation
├── tools/           Developer tooling
└── .github/         CI and repository configuration
```

Every package carries `README.md`, `DESIGN.md`, `API.md` and `TESTS.md`.

## Principles

- **Local-first always.** Data stays under the user's control; cloud is replication, never authority.
- **Event-first always.** Everything begins as an immutable event. History is never mutated.
- **Evidence-first always.** Every belief references its evidence. Every decision is explainable.
- **Model-independent always.** Reasoning engines are interchangeable; models never define the architecture.

---

## Development

```bash
npm install
npm run build        # tsc -b across every package
npm run typecheck    # also proves each package compiles independently
npm run lint         # repository invariants from CLAUDE.md and CONSTITUTION.md
npm test             # the full suite
npm run verify       # all of the above
```

TypeScript strict mode throughout, with `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Tests use the Node
built-in runner; there is no test framework dependency.

### Publishing

`@orb/journal` is publishable; everything else stays `private`.

```bash
npm run verify                    # must be green first
npm publish -w @orb/journal
```

## License

[Apache License 2.0](LICENSE). Chosen for the explicit patent grant, in an area
where an implicit grant leaves an adopter guessing.

Every package here is Apache-2.0, and none has a third-party runtime dependency.
