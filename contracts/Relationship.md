# Relationship — Contract Specification

```
Contract:   Relationship
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Entity, Belief
```

> A Relationship is a modeled connection between entities — knows, works-with,
> located-at, owns, reports-to — held as an evolving, evidence-grounded belief. See
> `../docs/DIGITAL_TWIN.md` and `EVIDENCE_GRAPH.md`.

**Why a permanent kernel contract?** Because continuity is largely *relational*:
who the user knows, works with, and depends on is the connective tissue of their
world, and it changes continuously. Modeling a connection as a first-class,
evidence-grounded, revisable object — rather than a foreign key — is what lets Orb
track how a relationship strengthens, cools, or ends over years. *Can it exist for
twenty years?* Yes: "works-with Acme," asserted in 2026, may strengthen, lapse, or
resume across a career; the connection's history is meaningful the whole time.
A connection that could not evolve would be a profile field; a connection that
*does* evolve, grounded in evidence, is kernel identity.

---

## 1. Semantics

A **Relationship** is a typed, directed (or symmetric) association between two
**Entities**, held with **confidence** and grounded in **Belief** (and the Evidence
beneath it). It answers *"what can change between these two?"* — connections form,
strengthen, weaken, and dissolve. A Relationship is **interpretation**: recomputable
and revisable, never asserted as truth.

A Relationship is **not edited directly**. Connections are inferred from
observations and evidence (or stated by the user as an Event); the record is
derived. Manual corrections enter history as Events.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — the **creation event** and the **originally asserted connection**
  (the two entities and the relation type as first recorded).
- **Derived** — **current confidence**, **strength**, and **active/dormant
  status**, recomputed from accumulating evidence.
- **Ephemeral** — **current salience** (whether this connection is relevant to the
  moment). Runtime-only; lost on replay.

*Replay test:* immutable + derived survive a complete replay; ephemeral does not.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when evidence first connects two entities (a shared meeting, an email
   thread, a stated fact), deriving a Relationship anchored to that event.
2. **Evolves** as evidence accumulates: confidence and strength rise; the type may
   be refined (acquaintance → colleague).
3. **Decays** as contact lapses: strength and confidence fall; the Relationship
   goes dormant, retained not deleted.
4. **Merges** when duplicate connections (via entity merge, or two records of the
   same tie) are unified by recorded re-resolution.
5. **Splits** when one record conflated two distinct ties, or when an underlying
   Entity splits; a recorded split follows.
6. **Ends** when the tie dissolves (a recorded "no longer works-with"); the
   Relationship is closed but its history persists.

---

## 3. State transitions

```
(asserted) ──▶ (active, confidence/strength recomputed)
     │                 ├── dormant (contact lapses)  ──▶ (revived on new evidence)
     │                 ├── merged / split (entity re-resolution)
     │                 └── ended (tie dissolved)
     └────────────── creation event + original connection never change ──────────────┘
```

---

## 4. Invariants

1. **A belief about a connection.** A Relationship carries confidence and is
   grounded in Belief/Evidence; it is never asserted as truth.
2. **Connects resolved Entities.** Both endpoints are Entities; a Relationship to an
   unresolved subject is invalid.
3. **Never edited directly.** Connections and corrections enter as Events; the
   record is derived (Constitution Art. XII §45).
4. **Immutable core, derived surface, ephemeral edge.** Creation event and the
   originally asserted connection are immutable; confidence/strength/status are
   derived; salience is ephemeral and does not survive replay (Art. XII §46).
5. **Recomputable; revision is append-only.** Prior values are retained.

Upholds Constitution Articles XII (Identity and Continuity) and II (Truth and
Interpretation).

---

## 5. Versioning rules

- New **Relationship types** (knows, works-with, located-at, owns, reports-to, …)
  are added and versioned; existing types never change meaning.
- The core obligation — *typed, entity-to-entity, confidence-bearing,
  evidence-grounded, never edited directly* — is frozen at v1.
- Strength/decay scoring is implementation; it may evolve, but never rewrites the
  immutable asserted connection.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Relationship's endpoints, type, and creation event (as originally asserted)
  never change.
- Confidence, strength, and status are recomputable from history.
- A dormant or ended Relationship retains its full history.

Not guaranteed:

- That a Relationship is *current* — ties decay; status reflects this.
- That a Relationship is *correct* — it may be inferred wrongly and revised.

---

## 7. Failure modes

- **Lapsed tie.** No recent evidence; strength and confidence decay to dormant —
  retained, revived if contact resumes.
- **Entity merge/split fallout.** When an endpoint Entity merges or splits, the
  Relationship is re-attached by recorded re-resolution; history preserved.
- **Spurious connection.** A wrongly inferred tie is contradicted by later evidence
  and ended; the erroneous assertion remains in history with its correction.
- **Lost salience.** A restart loses the "currently relevant" flag; it is recomputed
  from the durable Relationship.

Never permitted: editing a Relationship in place; a Relationship with an unresolved
endpoint; deleting an ended tie's history.

---

## 8. Examples

- **Strengthening.** Repeated meetings and emails raise "works-with Acme" from
  0.4 to 0.9 over a quarter; the original assertion stays fixed.
- **Decay.** "Knows Sam" goes dormant after two years of no contact; a chance
  message revives it rather than creating a new tie.
- **Type refinement.** "Knows John" is refined to "reports-to John" as evidence of
  an org structure accumulates; the refinement is appended.
- **Dissolution.** "Located-at Bangalore office" ends when the user relocates; the
  past tie remains queryable for history.
