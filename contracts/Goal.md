# Goal — Contract Specification

```
Contract:   Goal
Domain:     Identity
Kind:       State
Version:    v1
Status:     Draft
Depends on: Belief
```

> A Goal is a desired future state the user — or Orb on their behalf — intends to
> bring about. It is the *source of intent* that planning reasons toward. See
> `../docs/DIGITAL_TWIN.md` and `RUNTIME_LOOP.md` (Plan).

**Why a permanent kernel contract?** Because Orb acts *toward* something, and that
something — intent — must be a first-class, durable, evidence-grounded object,
never a transient parameter of a planner. A Goal is where the user's intent enters
the model and persists across years; planning, reflection, and learning all read it.
*Can it exist for twenty years?* Yes: a goal recorded in 2026 ("become
financially independent") is still a meaningful anchor in 2046, its progress and
priority recomputed continuously while its original intent stays fixed in history.
That longevity — fixed intent, evolving interpretation — is exactly why intent
belongs in the kernel and not in an implementation's task table.

---

## 1. Semantics

A **Goal** expresses an objective: a future state intended to be brought about.
It answers *"what can change, and toward what?"* — not *"what is true."* A Goal is
**interpretation**: it is recomputable, revisable, and grounded in the Beliefs (and,
beneath them, the Evidence and Observations) that express the user's intent. It is
the target planning reasons toward, and it is **never an authority to act** without
permission — a Goal motivates; a Capability acts.

A Goal is **not edited directly**. The user does not mutate a goal record; they
state intent, which enters history as an Event, from which the Goal (and its
revisions) are derived. Manual corrections are themselves Events.

### Composition (Immutable / Derived / Ephemeral)

- **Immutable** — the **creation event** and the **original intent** (the stated
  objective as first recorded). These never change; they are history.
- **Derived** — **current progress**, **priority**, and **confidence** that the
  goal is still active and achievable. Recomputed continuously from new evidence;
  fully rebuildable on replay.
- **Ephemeral** — **current focus**, **suggested next action**, **temporary
  reminders**. Runtime-only working state; not persisted as truth and **lost on
  replay** without loss of anything that matters.

*Replay test:* immutable + derived survive a complete replay; ephemeral does not.

---

## 2. Lifecycle (begin → evolve → decay → merge → split → end)

1. **Begins** when intent is observed — the user states an objective, or Orb infers
   one from evidence — and a Goal is derived, anchored to its creation event and
   original intent.
2. **Evolves** as evidence accumulates: progress, priority, and confidence are
   recomputed; the Goal may be advanced by one or more Projects (the Goal↔Project
   relation is many-to-many, not a hierarchy — a Goal is an *outcome*, a Project is
   the *work*).
3. **Decays** when intent fades: evidence of abandonment or irrelevance lowers
   confidence; a dormant Goal is retained, not deleted.
4. **Merges** when two Goals are found to express one intent (recorded re-resolution
   unifies them; both histories are kept).
5. **Splits** when one Goal is found to conflate two intents (recorded split).
6. **Ends** by being **achieved** (an Observation confirms the target state),
   **abandoned** (intent withdrawn), or **superseded** — each recorded as history;
   the Goal and its outcome remain forever.

---

## 3. State transitions

A Goal is recomputable interpretation; all moves are appended, never destructive:

```
(intended) ──▶ (active, progress/priority/confidence recomputed)
     │                 │
     │                 ├── achieved (confirmed by Observation)
     │                 ├── abandoned / decayed (intent withdrawn)
     │                 ├── merged (with another Goal)
     │                 └── split (into distinct Goals)
     └────────────── original intent + creation event never change ──────────────┘
```

---

## 4. Invariants

1. **Answers "what can change."** A Goal models intent and its evolution, never a
   settled truth.
2. **Grounded.** Every Goal references the Belief(s) expressing its intent; an
   ungrounded Goal is invalid.
3. **Never an authority to act.** A Goal is the source of intent for planning; it
   confers no permission to touch reality (Constitution Art. VII).
4. **Never edited directly.** Intent and corrections enter as Events; the Goal is
   derived. Nothing bypasses history (Constitution Art. XII §45).
5. **Immutable core, derived surface, ephemeral edge.** Creation event and original
   intent are immutable; progress/priority/confidence are derived; focus/next-action
   are ephemeral and do not survive replay (Art. XII §46).
6. **Recomputable; revision is append-only.** Prior values are retained.

Upholds Constitution Articles XII (Identity and Continuity), II (Truth and
Interpretation), and VII (Capabilities and Human Agency).

---

## 5. Versioning rules

- New **Goal categories** (objective, habit, constraint, aspiration, …) are added
  and versioned; existing categories never change meaning.
- The core obligation — *evidence-grounded intent, immutable original intent,
  derived progress, never an authority to act, never edited directly* — is frozen
  at v1.
- Progress/priority/confidence scoring is implementation; it may evolve and yield
  different derived values over time, but never rewrites the immutable intent.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- A Goal's original intent and creation event never change.
- Progress, priority, and confidence are recomputable from history.
- A Goal never silently authorizes action; planning proposes, permission gates.

Not guaranteed:

- That a Goal is *current* — intent decays; confidence reflects this.
- That derived progress is *correct* — it is the best current estimate, revisable.

---

## 7. Failure modes

- **Stale goal.** Intent has faded but no explicit end was observed; confidence
  decays and the Goal goes dormant — retained, never deleted, recoverable if intent
  returns.
- **Conflated intent.** One Goal records two intents; a recorded split separates
  them; histories preserved.
- **Lost ephemeral state.** A crash loses current focus / suggested next action;
  these are recomputed from the derived Goal — by design, nothing of value is lost.
- **Apparent manual edit.** A user "edits" a goal in the UI; this is recorded as an
  intent-revision Event and re-derived — the prior value remains in history.

Never permitted: editing a Goal's record in place; deriving intent without
grounding; treating a Goal as permission to act; deleting an ended Goal's history.

---

## 8. Examples

- **Long-horizon.** "Become financially independent" recorded in 2026 remains a
  durable anchor for decades; its progress and priority are recomputed as evidence
  arrives, while the original intent stays fixed.
- **Achievement.** "Ship Orb v1" ends when an Observation confirms the release; the
  Goal is marked achieved and kept as history.
- **Decay.** "Learn the violin," unworked for two years, decays in confidence and
  goes dormant — not deleted; a lesson booked next month revives it.
- **Ephemeral surface.** "Reply to the lawyer today" surfaces a suggested next
  action this morning; after a restart the suggestion is recomputed from the still-
  durable Goal, not restored from a saved field.
