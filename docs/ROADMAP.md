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
- `CONSTITUTION.md` held as a deliberate placeholder; `LICENSE` since settled
  as Apache-2.0 (see `NOTICE` for the one package with a GPL toolchain).
- Git initialized; first commit recorded.

**Gate:** structure exists; no implementation. *Passed.*

---

## Phase 1 — Architectural Documents  ✅ complete

The `/docs` specifications that define the architecture, with the three frozen
decisions incorporated (HLC ordering, replay-vs-determinism; license since
settled as Apache-2.0).

- `SYSTEM_OVERVIEW`, `RUNTIME_LOOP`, `EVENT_MODEL`, `EVIDENCE_GRAPH`,
  `DIGITAL_TWIN`, `AGENT_RUNTIME`, `CAPABILITY_MODEL`, `STORAGE`,
  `SYNC_PROTOCOL`, `SECURITY`, `ROADMAP`.
- **Amendment:** `RUNTIME_LOOP.md` added to define the system's *dynamics* — the
  continuous Sense→…→Learn loop, the three planes (Reality / Knowledge /
  Execution), and "nothing is live." `SYSTEM_OVERVIEW` updated to reference them.

**Gate:** documents reviewed and accepted. *Passed.*

---

## Phase 2 — Constitution  ✅ complete

`CONSTITUTION.md` ratified: originally 36 laws across nine articles (History; Truth
and Interpretation; Models and Reasoning; Distribution; The Runtime; The Three
Planes; Capabilities and Human Agency; Ownership and Trust; Engineering). Since
extended additively (Article X — The Kernel; Article XI — Reality and Confidence;
Article XII — Identity and Continuity) to **47 laws across twelve articles** during
the Phase 3 kernel and domain reviews.
Includes the laws decided during Phase 1 framing and the continuous-observation /
three-planes invariants from the Phase 1 amendment.

**Gate:** constitution ratified. It changes rarely thereafter; everything follows
it. *Passed.*

---

## Phase 3 — The Kernel & Contracts  ◀ current

Expanded: rather than freeze loose interfaces, define the **Orb Kernel** — the
minimal, permanent contract surface every implementation must preserve.

**3a — `KERNEL.md` (current).** Six domains, 30 contracts, each with exactly four
sections (Purpose, Responsibilities, Invariants, Dependencies). No methods,
fields, or language. Governed by Article X (kernel evolves through addition,
never mutation; v1 contracts permanent). *(Count is post-review: the Intelligence
domain review removed `Memory` and `Reflector` and added `InferenceRecord`, net 31 → 30.)*

- Reality: `Sensor`, `Observation`, `Attachment`, `Event`
- Knowledge: `Evidence`, `Entity`, `Fact`, `Belief`, `Prediction`
- Identity: `DigitalTwin`, `Relationship`, `Project`, `Goal`, `ContextSnapshot`,
  `LiveContext`, `IdentityEvolution`
- Intelligence: `InferenceRecord`, `Retriever`, `Reasoner`, `Planner`
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

### Amendment — the Hyperliquid trade executor

An executable trade executor was built ahead of this phase's gate, at the
operator's explicit direction. It is recorded here rather than quietly, because
the roadmap says phases are sequential and none is skipped.

**What it deviates from.** Phase 3b/3c are not complete: no contract
specification exists for a trading Capability, and implementation interfaces
were written before contract specs were accepted.

**What it does not deviate from.** The executor was built *onto* the kernel
rather than beside it, and the Event Journal — Phase 4's stated first
component — was implemented first and is the executor's only source of truth:

- the signal API and the Hyperliquid feed are **Sensors** producing
  **Observations**;
- order submission is a **Capability** producing **Actions**;
- risk and hard-exit rules are **Policy**;
- position state is a **projection** over the journal, never a source of truth
  (Art. IX §33);
- every lifecycle record enters through the journal (Art. IX §34), append-only
  and hash-chained (Art. I);
- Art. XI §42 is honoured literally: an order is never assumed to have changed
  reality, and a position is closed only when the exchange confirms it.

**Outstanding debt.** `Capability`, `Action` and `Policy` still need contract
specifications, and the executor's implementation should be re-reviewed against
them when they are accepted. Recorded in `ARCHITECTURAL_DEBT.md`.

---

### Amendment — the payment policy engine

An executable spend-authorization engine (`packages/payment-policy`,
`packages/payment-circuit`) was built ahead of this phase's gate, at the
operator's explicit direction. Recorded here for the same reason as the
executor above: phases are sequential, and a deviation that is not written
down is not a deviation, it is a lie of omission.

**What it deviates from.** The same Phase 3b/3c gap as the executor. No
contract specification exists for `Capability`, `Action` or `Policy`, and
implementation interfaces were written before contract specs were accepted.

**What it does not deviate from.** Less than the executor, and this is the
point worth recording. `CAPABILITY_MODEL.md` §5 already placed *"make a
payment"* in the irreversible tier and required *"explicit, per-scope
authorization"* for it. This package is the first implementation of that
requirement rather than a new idea beside it:

- `WINDOW_BUDGET` and `APPROVAL_THRESHOLD` **are** per-scope authorization;
  a scope's budget is never authorization for another scope (§5).
- `APPROVAL_THRESHOLD` is the human confirmation §5 requires for irreversible
  actions, expressed as a rule rather than as configuration.
- the ledger is a **projection** over the journal, never a source of truth
  (Art. IX §33); every reservation, settlement and reversal enters through
  the journal (Art. IX §34), append-only and hash-chained (Art. I).
- `evaluate()` is pure and total: the same request, policy and ledger produce
  the same decision and the same explanation forever (Art. II §9, §10).
- Art. XI §42 is honoured literally. A spend is **never** assumed to have
  happened because it was authorized; the reconciler settles only on a
  Sensor's confirmation, and an observer that answers `UNKNOWN` resolves
  nothing.
- Art. III §11: no provider is named anywhere in the package. Assets, rails
  and directories are all caller-supplied ports.

**The governing rule** is the executor's, one layer down and pointed at money:
*entry may come from the signal provider; exit authority belongs to the
executor* becomes *a payment may be requested by anyone; **spend authority
belongs to the policy***.

**Outstanding debt.** The same three contracts, plus one of its own: nothing
in the runtime yet *invokes* this engine as a Capability, and the trade
executor does not use it. Recorded in `ARCHITECTURAL_DEBT.md`.

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
built to depend on it. **Met** — `runtime/journal`, 26 tests.

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
