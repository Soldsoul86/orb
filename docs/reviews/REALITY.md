# Domain Integrity Report — 1. Reality

> Phase 3b architectural review. The Reality domain answers: **how information
> enters Orb.** Reviewed before freezing. Specs: `../../contracts/{Event,
> Observation, Attachment, Sensor}.md`.

---

## Contracts

| Contract | Kind | Why it deserves to be a permanent kernel contract (summary) |
| --- | --- | --- |
| **Event** | State | The single irreducible unit of history and the only write-path into the past. Everything reduces to Events. |
| **Observation** | State | The stable boundary at which reality becomes knowledge: "an occurrence, recorded and attributed, but not yet true." |
| **Attachment** | State | Architectural separation of immutable content-addressed raw bytes from the replayable structured record. |
| **Sensor** | Service | The only ingress through which the world becomes history; a source- and model-independent, runtime-scheduled boundary. |

All four answer the justification question convincingly. None is a candidate for
demotion to implementation.

---

## Dependency Graph

Directed edges = "depends on". `*` marks a forward edge into a domain reviewed
later (Infrastructure). "produces" edges (Service → the State it emits) are shown
dashed for completeness but are one-directional.

```
Event         → ∅                         (the atom; depends on nothing)
Observation   → Event, Attachment
Attachment    → Storage*, Encryption*     (Infrastructure)
Sensor        → Observation, Attachment   (Sensor produces Observations/Attachments)
```

```
        ┌───────────────┐
        │     Event     │◀─────────────┐
        └───────────────┘              │
                                       │ (depends on)
        ┌───────────────┐     ┌────────┴────────┐
        │  Attachment   │◀────│   Observation   │◀╌╌╌ Sensor (produces)
        └──────┬────────┘     └─────────────────┘        │
               │                       ▲                 │
        Storage*, Encryption*          └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘  (Sensor produces Observations)
```

Topological order (no back-edges): `Event` → `Attachment` → `Observation` →
`Sensor`.

---

## Cycles

**Before this review:** a cycle existed — `Observation → Sensor` (Observation
attributed to the Sensor that produced it) and `Sensor → Observation` (Sensor
produces Observations). This was a genuine kernel-level circular dependency.

**Resolution (applied amendment):** `Observation` no longer depends on the
`Sensor` contract. Attribution is to a **source identity** — a *value* naming the
producer (a Sensor, an Action outcome, or an import). `Sensor → Observation`
remains (a Service produces State); the reverse edge is removed.

**After amendment:** **No cycles exist.** The domain is a DAG.

This change also fixes a latent over-narrowing: not all Observations come from
Sensors (Action-outcome observations originate in the Execution plane). The value-
based source is both more correct and smaller than a contract dependency.

---

## Hidden State

State that lives outside the four State contracts, and why it is permissible:

- **Lane head / hash-chain pointer** and **per-device HLC clock** — operational
  state owned by the `Journal` service (Infrastructure). Not source-of-truth: the
  truth is the Events themselves; the lane head is derivable by scanning the lane.
- **Sensor operational state** (`registered → active → emitting → deferred →
  retired`) — ephemeral Service runtime state. A Sensor owns no *truth*; its past
  emissions are the only durable record and they live in the Journal.
- **Attachment availability / location** — Storage service state (which device
  currently holds which bytes). The content and its identity are fixed; only
  placement varies.

**Conclusion:** No *source-of-truth* state exists outside the State contracts. All
state-outside-State-contracts is operational/runtime and fully derivable or
disposable — consistent with Constitution Art. I §3 (journal is the only source of
truth) and Art. V §22 (services/agents own no durable truth).

---

## Constitution Coverage

Articles exercised by the Reality domain:

- **Article I — History** (Event, Observation, Attachment): append-only,
  immutable, tamper-evident, replayable.
- **Article II — Truth and Interpretation** (Observation): records occurrence, not
  truth; corrections are new records.
- **Article IV — Distribution** (Event): per-device lane, HLC, derived ordering.
- **Article V — The Runtime** (Sensor): runtime-scheduled; "nothing is live";
  deferral never drops.
- **Article VI — The Three Planes** (Sensor): the Reality→Knowledge boundary; only
  attributed Observations cross it.
- **Article VIII — Ownership and Trust** (Attachment): encrypted at rest;
  content-addressed integrity.

Not exercised here (belong to later domains): Art. III (Models), VII
(Capabilities/Human Agency), IX (Engineering), X (Kernel versioning, meta).

---

## Future Extension Points

All additive under Article X (v1 contracts remain valid forever):

- **New Event payload schemas** and **new Observation kinds** (location, message,
  file-change, model-output, action-outcome, …) — added and versioned without
  touching existing kinds.
- **New Sensor types** — new Services; never changes to existing ones.
- **New Attachment content-addressing scheme** — tagged and coexisting with the
  original; old references never break.
- **New source-identity kinds** for attribution — value-level; no contract change.
  (If attribution ever needs to become first-class, a `Source` contract could be
  *added* — but see Questions; currently rejected as unnecessary.)

---

## Questions

1. **Cycle fix — confirm direction.** The applied amendment makes attribution a
   *value* (source identity) rather than introducing a `Source` contract. The
   alternative — a `Source` kernel contract referenced by both `Observation` and
   `Sensor` — also breaks the cycle but *adds* a contract, against "smaller and
   clearer." Recommend keeping the value-based approach. Confirm?
2. **Observation vs. typed Event.** Should `Observation` remain a distinct contract
   or collapse into "an Event whose type is observation"? Recommend **keep**: it is
   the History/Interpretation boundary concept and downstream contracts depend on
   it, not on raw Events. Flagging for explicit ratification since it is the one
   genuine overlap in this domain.
3. **Forward dependencies.** `Attachment → Storage, Encryption` reaches into
   Infrastructure (reviewed last). No action needed now, but the Infrastructure
   review must close these edges consistently.

---

## Recommendation

**Amend (applied) → Accept.**

The one structural defect (the `Observation ↔ Sensor` cycle) has been resolved by
the value-based source-identity amendment, which also makes the domain smaller and
more correct. With that amendment the Reality domain is acyclic, minimal, fully
grounded, and closed under the Constitution. Recommend **acceptance** of the
Reality domain as amended, pending your confirmation of Questions 1–2.
