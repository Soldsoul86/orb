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

**Phase 0 — Foundation.** Repository structure and governing documents only.
No implementation yet. See [`docs/ROADMAP.md`](docs/ROADMAP.md) once authored.

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
├── runtime/         Core runtime (Event Journal first)
├── platform/        Cross-cutting platform services
├── packages/        Independent, composable packages
├── docs/            Architecture documents
├── tests/           Cross-package and integration tests
├── scripts/         Repository automation
├── tools/           Developer tooling
└── .github/         CI and repository configuration
```

## Principles

- **Local-first always.** Data stays under the user's control; cloud is replication, never authority.
- **Event-first always.** Everything begins as an immutable event. History is never mutated.
- **Evidence-first always.** Every belief references its evidence. Every decision is explainable.
- **Model-independent always.** Reasoning engines are interchangeable; models never define the architecture.

## License

See [`LICENSE`](LICENSE). _(License selection pending — see Phase 0 review notes.)_
