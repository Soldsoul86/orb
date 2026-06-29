# Fact — Contract Specification

```
Contract:   Fact
Domain:     Knowledge
Kind:       State
Version:    v1
Status:     Accepted
Depends on: Evidence, Entity
```

> A Fact is an interpretation currently treated as settled — settled until
> contradicted, never eternal truth. See `../docs/DIGITAL_TWIN.md` and
> `SYSTEM_OVERVIEW.md` (the determinism boundary).

**Why a permanent kernel contract?** Because Orb needs a stable category for the
claims it *currently relies upon* to reason and act — without ever pretending those
claims are eternal truth. That category, distinct from a low-confidence Belief and
from a raw Observation, is a permanent feature of the epistemic stack: planning and
action read Facts as their working ground. If Fact were collapsed into Belief, Orb
would lose the explicit notion of "relied-upon-for-now," and the Constitution's
demand that interpretation be *revisable* would blur into either certainty or
permanent doubt. A Fact makes "settled until contradicted" a first-class, grounded,
recomputable record.

---

## 1. Semantics

A **Fact** is an interpretation that Orb currently treats as settled given the
evidence: "John's email is john@example.com," "the user lives in Bangalore," "the
Q3 review is on Friday." It is the claim the system relies upon *right now* — not
because it is proven true, but because the evidence currently warrants treating it
as settled.

A Fact is **revisable, never eternal**. New contradicting Evidence can unsettle it;
when that happens the Fact is revised (by append), and the prior value is retained
in history.

A Fact is a **distinct epistemic object** from a Belief — not the same claim at a
different confidence:

- A **Fact** is the runtime's best-supported *objective* statement, grounded
  directly in evidence: "the meeting lasted 43 minutes." It persists until
  contradicted by better evidence.
- A **Belief** is *contextual* interpretation built on facts and evidence: "this
  customer is becoming disengaged." It may disappear tomorrow.

Neither converts into the other. A Fact does not "decay" into a Belief when doubted,
and a Belief does not "graduate" into a Fact when confident; they are adjacent
layers of one stack (`Observation → Evidence → Fact → Belief`). When a Fact is
contradicted it is **revised or retired**, recorded as new history — never
reclassified.

A Fact concerns one or more **Entities** and is justified by **Evidence**.

---

## 2. Lifecycle

1. **Settlement.** During Understand, evidence about an Entity accumulates to the
   point where a claim is treated as settled; a Fact is formed, grounded in that
   Evidence.
2. **Recording.** The Fact is recorded as an Event and becomes part of the
   recomputable Digital Twin.
3. **Reliance.** Planning, action, and further interpretation read the Fact as
   working ground.
4. **Revision (never rewrite).** Contradicting Evidence can unsettle the Fact; a
   new value is appended, the prior value retained. A superseded Fact is *retired*,
   recorded as history — never reclassified into a Belief.

---

## 3. State transitions

A Fact is recomputable interpretation; its revisions are appended:

```
(settled) ──relied upon──▶ (referenced)
    │
    ├──contradicting evidence──▶ (revised value, prior retained) ──▶ (settled')
    └──superseded──▶ (retired, prior retained)
```

No transition rewrites history; every prior value remains, grounded by the
Evidence that justified it at the time.

---

## 4. Invariants

1. **Interpretation, never eternal truth.** A Fact is settled-for-now, recomputable
   from the journal, never asserted as final.
2. **Grounded in Evidence.** Every Fact references the Evidence that settles it;
   an ungrounded Fact is invalid.
3. **About Entities.** A Fact concerns resolved Entities, tying interpretation to a
   known subject.
4. **Revision is append-only.** Updating a Fact retains its prior value; history is
   never rewritten.
5. **A distinct object from a Belief.** A Fact is an objective, evidence-supported
   statement; it never reclassifies into a Belief (nor a Belief into it).
   Contradiction revises or retires it; it does not demote it.
6. **Knowledge plane only.** A Fact holds no power to act and no source-of-truth
   state of its own.

Upholds Constitution Articles II (Truth and Interpretation) and I (History).

---

## 5. Versioning rules

- New **Fact categories** (contact detail, location, schedule, measurement, …) are
  added freely and versioned; existing categories never change meaning.
- The core obligation — *evidence-grounded, entity-scoped, objective,
  settled-until-contradicted, revised by append, never reclassified into a Belief*
  — is frozen at v1.
- The threshold and policy by which evidence "settles" a Fact are implementation;
  they may evolve (interpretation is not frozen) but never rewrite history.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Fact is traceable, through Evidence, to recorded history, and scoped to an
  Entity.
- A Fact may be revised or retired, but its prior values are retained, and it is
  never reclassified into a Belief.
- A Fact never silently becomes eternal truth; it is always revisable.

Not guaranteed:

- That a Fact is *correct* — it is the best current settlement, not proof.
- That a Fact is *permanent* — sufficient contradiction unsettles it.

---

## 7. Failure modes

- **Contradicted Fact.** New Evidence contradicts a settled Fact; the Fact is
  revised or retired, prior value retained, history untouched.
- **Over-settlement.** A claim treated as settled on thin Evidence is retired when
  its grounding is re-examined and found wanting; the retirement is recorded. (A
  *contextual* judgment that was mistakenly recorded as a Fact should have been a
  Belief; that is a modeling error, corrected by recording the Belief, not by
  demoting the Fact.)
- **Entity re-resolution.** If the Entity a Fact concerns is merged or split, the
  Fact is re-attached to the correct Entity by recorded re-resolution; the Fact's
  history is preserved.
- **Recompute drift.** Improved interpretation may settle a different value; prior
  values remain in history with their evidence. Replay reproduces history, not
  intelligence.

Never permitted: asserting a Fact as eternal truth; grounding a Fact without
Evidence; reclassifying a Fact into a Belief; rewriting a prior Fact value; a Fact
with no Entity.

---

## 8. Examples

- **Measurement.** Corroborated Evidence settles "the meeting lasted 43 minutes"
  as a Fact — objective and grounded, persisting until better evidence contradicts
  it. (Whether the meeting "went well" is a *Belief*, not this Fact.)
- **Contact detail.** Repeated, corroborated Evidence settles "John's email is
  john@example.com" as a Fact about the Entity *John Doe*.
- **Location.** GPS and manual confirmation settle "the user lives in Bangalore";
  the Fact is relied upon for planning until contradicted by a move.
- **Schedule.** "The Q3 review is Friday 3 PM" is a Fact grounded in a calendar
  Observation; a later reschedule Observation revises it, prior value retained.
