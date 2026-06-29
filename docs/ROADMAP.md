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

## Phase 1 — Architectural Documents  ✅ complete

The `/docs` specifications that define the architecture, with the three frozen
decisions incorporated (HLC ordering, replay-vs-determinism, license deferred).

- `SYSTEM_OVERVIEW`, `RUNTIME_LOOP`, `EVENT_MODEL`, `EVIDENCE_GRAPH`,
  `DIGITAL_TWIN`, `AGENT_RUNTIME`, `CAPABILITY_MODEL`, `STORAGE`,
  `SYNC_PROTOCOL`, `SECURITY`, `ROADMAP`.
- **Amendment:** `RUNTIME_LOOP.md` added to define the system's *dynamics* — the
  continuous Sense→…→Learn loop, the three planes (Reality / Knowledge /
  Execution), and "nothing is live." `SYSTEM_OVERVIEW` updated to reference them.

**Gate:** documents reviewed and accepted. *Passed.*

---

## Phase 2 — Constitution  ✅ complete

`CONSTITUTION.md` ratified: 36 laws across nine articles (History; Truth and
Interpretation; Models and Reasoning; Distribution; The Runtime; The Three
Planes; Capabilities and Human Agency; Ownership and Trust; Engineering).
Includes the laws decided during Phase 1 framing and the continuous-observation /
three-planes invariants from the Phase 1 amendment.

**Gate:** constitution ratified. It changes rarely thereafter; everything follows
it. *Passed.*

---

## Phase 3 — The Kernel & Contracts  ◀ current

Expanded: rather than freeze loose interfaces, define the **Orb Kernel** — the
minimal, permanent contract surface every implementation must preserve.

**3a — `KERNEL.md` (current).** Six domains, 29 contracts, each with exactly four
sections (Purpose, Responsibilities, Invariants, Dependencies). No methods,
fields, or language. Governed by Article X (kernel evolves through addition,
never mutation; v1 contracts permanent).

- Reality: `Sensor`, `Observation`, `Attachment`, `Event`
- Knowledge: `Evidence`, `Entity`, `Fact`, `Belief`, `Prediction`
- Identity: `DigitalTwin`, `Relationship`, `Project`, `Goal`, `Context`
- Intelligence: `Memory`, `Retriever`, `Reasoner`, `Planner`, `Reflector`
- Execution: `Capability`, `Action`, `Policy`, `Scheduler`, `Agent`
- Infrastructure: `Journal`, `Storage`, `Synchronization`, `ModelRouter`,
  `Encryption`

**Gate (3a):** kernel accepted.

**3b — Contract specifications.** After the kernel is accepted, each contract
receives its own document under `contracts/` (e.g. `contracts/Event.md`) defining
Semantics, Lifecycle, State transitions, Invariants, Versioning rules,
Compatibility guarantees, Failure modes, and Examples.

**Gate (3b):** every contract specification accepted.

**3c — Implementation interfaces.** Only after every contract spec is accepted are
implementation interfaces written in TypeScript or Kotlin. Each package carries
`README`, `DESIGN`, `API`, `TESTS`.

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
