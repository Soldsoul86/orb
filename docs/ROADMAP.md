# Roadmap

> Status: Phase 1 architecture. Reviewed before implementation.
> The phased delivery plan for Orb. Phases are sequential; none is skipped.

---

## Principle

> The architecture is permanent. The implementation is replaceable.

Each phase produces a reviewable artifact and a gate. We do not begin a phase
until the prior gate is accepted. We build the **smallest correct implementation**
that preserves the long-term architecture, and we never optimize prematurely.

---

## Phase 0 — Foundation  ✅ complete

Repository structure and governance, versioned from day one.

- Repository tree (`apps/`, `runtime/`, `platform/`, `packages/`, `docs/`,
  `tests/`, `scripts/`, `tools/`, `.github/`).
- Root documents: `MASTER.md`, `CLAUDE.md`, `README.md`, `.gitignore`.
- `CONSTITUTION.md` and `LICENSE` held as deliberate placeholders.
- Git initialized; first commit recorded.

**Gate:** structure exists; no implementation. *Passed.*

---

## Phase 1 — Architectural Documents  ◀ current

The ten `/docs` specifications that define the architecture, with the three
frozen decisions incorporated (HLC ordering, replay-vs-determinism, license
deferred).

- `SYSTEM_OVERVIEW`, `EVENT_MODEL`, `EVIDENCE_GRAPH`, `DIGITAL_TWIN`,
  `AGENT_RUNTIME`, `CAPABILITY_MODEL`, `STORAGE`, `SYNC_PROTOCOL`, `SECURITY`,
  `ROADMAP`.

**Gate:** documents reviewed and accepted before any constitution ratification or
code. *Awaiting review.*

---

## Phase 2 — Constitution

Ratify `CONSTITUTION.md`: the immutable laws of Orb. Includes the laws decided
during Phase 1 framing (separate history from interpretation; Orb stores no
truth; replay reproduces history not intelligence; model outputs are
observations; devices are equal peers).

**Gate:** constitution ratified. It changes rarely thereafter; everything follows
it.

---

## Phase 3 — Contracts

Freeze interfaces only — no business logic — so the shape is fixed before
implementation:

`Event`, `Observation`, `Evidence`, `Fact`, `Belief`, `Entity`, `Capability`,
`Agent`, `Sensor`, `Memory`, `Reasoner`, `Planner`, `Action`.

These map onto the documents above (e.g. `Event` ← `EVENT_MODEL`; `Belief`,
`Fact`, `Entity` ← `DIGITAL_TWIN`; `Reasoner`, `Planner`, `Agent`, `Memory` ←
`AGENT_RUNTIME`; `Capability`, `Action` ← `CAPABILITY_MODEL`; `Sensor`,
`Observation`, `Evidence` ← `EVIDENCE_GRAPH`).

**Gate:** contracts accepted/frozen. Each package carries `README`, `DESIGN`,
`API`, `TESTS`.

---

## Phase 4 — Runtime Skeleton

Only after contracts are accepted. The **first executable component is the Event
Journal** — the single source of truth that everything else depends on.

- Append-only, single-writer-per-lane journal.
- HLC stamping and `(hlc, lane)` derived ordering.
- Hash-chained integrity.
- Replay to a trivial projection (proof of reconstruction).
- Unit tests before integration tests; every module compiles independently.

**Gate:** the journal runs, replays deterministically, and everything else can be
built to depend on it.

---

## Beyond Phase 4 (indicative, not yet committed)

The order below follows the dependency direction of the architecture pipeline.
Details are settled at each phase's own gate, not now.

1. **Evidence Graph** projection over the journal.
2. **Storage** hardening (encryption at rest, projection rebuild).
3. **Sync** between two devices (anti-entropy lane replication).
4. **Knowledge Engine + Digital Twin** (first interpretation layer).
5. **Agent Runtime** with an injected local Reasoner (model-independent).
6. **Capabilities** with the permission-tier gate.
7. **Reflection + Continuous Learning** loop closure.
8. **Apps** (`mac`, `pixel`) as device-native runtime hosts.

---

## Standing Rules Across All Phases

- Local-first, model-independent, event-first, evidence-first — always.
- If an architectural concern is discovered, **stop and surface it** before
  proceeding.
- Do not revisit frozen decisions unless a fundamental flaw is found.
- Optimize for clarity, determinism, and decades-long maintainability over
  short-term convenience.
