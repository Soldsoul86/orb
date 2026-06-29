# Observation — Contract Specification

```
Contract:   Observation
Domain:     Reality
Kind:       State
Version:    v1
Status:     Accepted
Depends on: Event, Attachment
```

> An Observation is the entry point of all knowledge: the first time the outside
> world becomes part of Orb's history. See `../docs/EVIDENCE_GRAPH.md` and
> `SYSTEM_OVERVIEW.md` (the epistemic stack).

**Why a permanent kernel contract?** Because "an occurrence — recorded and
attributed, but not yet true" is a distinct, load-bearing concept on which the
entire epistemic stack (Evidence → Belief → Decision) is built. It is the stable
boundary at which reality becomes knowledge; downstream contracts depend on
*Observation*, never on raw Events. Collapsing it into "a typed Event" would push
the History/Interpretation boundary down into implementation, where the
Constitution forbids it from living.

> **Attribution note (v1 design):** An Observation is attributed to a **source
> identity** — a stable value naming whatever produced it (a Sensor, an Action
> outcome, or an import). The source is a *value*, not a kernel contract. This is
> deliberate: it keeps the kernel smaller, avoids a circular dependency with
> `Sensor`, and correctly admits non-sensor sources of observation.

---

## 1. Semantics

An **Observation** is a recorded statement that *something occurred in reality*.
It is the bridge between the Reality Plane and the Knowledge Plane: a Sensor
perceives a signal, and the Observation is the historical record that the
perception happened.

An Observation asserts **occurrence, not truth**. "Met John at 3:02 PM" states
that this was observed — not that it is correct, complete, or finally true.
Whether it *means* anything (that John matters, that the time is right) is
interpretation, decided later and revisably, never by the Observation itself.

Every Observation is realized as an Event; the Observation is the *meaning of an
Event whose type is observation*. But the converse does not hold: **Observations
originate from reality; Events originate from runtime activity.** Many
Observations produce Events; not every Event produces an Observation. A reasoning
step, a plan, or an Action's *issuance* are runtime activity — recorded as Events,
not Observations. Reality is updated only when a Sensor *confirms* something
occurred. Orb never assumes an Action changed reality.

### Confidence of Reality

An Observation owns **confidence, not truth**. Truth never exists inside Orb;
what exists is *how strongly a source vouches for what it perceived*. Every
Observation carries a `confidence` in `[0, 1]` — the **Confidence of Reality** —
naming the reliability of the perception at the moment it was recorded:

| Source                         | Typical confidence |
| ------------------------------ | ------------------ |
| GPS fix                        | ~0.97              |
| OCR of a document              | ~0.74              |
| LLM-extracted claim            | ~0.41              |
| Direct manual entry by user    | 1.00               |

Confidence is *recorded*, never *resolved*: it is part of history, not a verdict.
A high confidence is still not truth, and a low confidence is still faithfully
kept — interpretation (Evidence → Belief) weighs confidence later, revisably.

---

## 2. Lifecycle

1. **Emission.** A Sensor perceives a signal and emits an Observation, attributing
   it to itself and referencing any raw Attachments.
2. **Recording.** The Observation is appended to the journal as an Event, fixing
   its identity, causal time, and provenance. From this moment it is permanent
   history.
3. **Existence.** It is read, replicated, and referenced by Evidence and by the
   Evidence Graph. It is never edited.
4. **Supersession (never deletion).** If reality is later observed differently, a
   *new* Observation is recorded. The old Observation remains; both coexist in
   history. Interpretation decides which to believe.

---

## 3. State transitions

An Observation is immutable State. Its only transition is into existence:

```
(perceived) ──emit──▶ (recorded as Event) ──▶ (referenced by Evidence, forever)
```

It never transitions to "edited," "corrected," or "deleted." A correction is a
**new** Observation linked, in the Evidence Graph, as contradicting or refining
the earlier one. The earlier Observation's state never changes.

---

## 4. Invariants

1. **Immutable and append-only**, as an Event (inherits all Event invariants).
2. **Occurrence, not truth.** An Observation never asserts resolved truth; it
   records that something was observed.
3. **Always attributed.** Every Observation names the source identity that
   produced it (a Sensor, an Action, or an import); an unattributed Observation is
   invalid. The source is a value, not a dependency on the `Sensor` contract.
4. **Grounded in time and device.** It carries the causal placement and
   provenance of its Event.
5. **References, never copies.** Raw content is referenced as Attachments by
   content hash, never inlined mutably.
6. **Originates from reality.** Observations originate from reality; Events
   originate from runtime activity. Many Observations produce Events; not every
   Event produces an Observation. Reality is updated only through observation —
   Orb never assumes an Action changed reality; the loop closes only when a Sensor
   confirms it.
7. **Carries confidence, not truth.** Every Observation records a `confidence` in
   `[0, 1]` (the Confidence of Reality) describing the reliability of the
   perception. It never records resolved truth, belief, or interpretation;
   confidence is faithfully kept and never silently upgraded to certainty.

Upholds Constitution Articles I (History) and II (Truth and Interpretation).

---

## 5. Versioning rules

- New **Observation payload schemas** (new kinds of observation: location,
  message, file-change, model-output, action-outcome, …) are added freely; each
  is versioned. Existing kinds are never changed in meaning.
- The core obligation — *attributed, occurrence-only, recorded as an Event* — is
  frozen at v1. Strengthening it is addition; weakening it is a breaking change
  requiring `Observation v2` alongside v1.
- Older Observation schemas remain valid and readable forever.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Every Observation is attributable to a source and placed in causal time.
- An Observation never changes; corrections arrive as new Observations.
- An Observation never silently becomes a "fact" — promotion to interpretation is
  always a separate, evidence-bearing step.

Not guaranteed:

- That an Observation is *accurate* (sensors can be wrong; that is what
  corroboration and contradiction in the Evidence Graph are for).
- That all relevant Observations exist yet (sensing is eventually-complete, not
  instantaneous — "nothing is live").

---

## 7. Failure modes

- **Sensor uncertainty.** A low-confidence or ambiguous perception is still
  recorded faithfully *as an uncertain observation*; uncertainty is never
  silently dropped, and never upgraded to certainty.
- **Conflicting observations.** Two Observations that disagree are both kept; the
  conflict is recorded as structure in the Evidence Graph and resolved (if at
  all) in interpretation — never by editing or deleting either.
- **Missing attachment.** If a referenced Attachment is unavailable, the
  Observation remains valid history; only the raw content is temporarily
  unresolved, recoverable by replication.
- **Partial emission.** If recording fails mid-way, no Observation exists (Event
  append is all-or-nothing); the Sensor re-emits idempotently.

Never permitted: an unattributed Observation; mutating or deleting a recorded
Observation; asserting truth from within an Observation.

---

## 8. Examples

- **Location.** The location sensor emits "device at 12.97°N, 77.59°E" at 3:02 PM;
  recorded as an Observation attributed to the GPS sensor.
- **A meeting.** Calendar, Bluetooth-proximity, and a photo each emit
  Observations around 3:02 PM. Together they will *support* the interpreted
  observation "Met John" — but each is, on its own, just an occurrence.
- **A correction.** Yesterday's "Lunch with John at 1 PM" (from a calendar entry)
  is contradicted today by GPS placing the user elsewhere at 1 PM. A new
  Observation records the GPS fact; the calendar Observation is untouched; the
  Evidence Graph records the contradiction; the Twin revises its belief.
- **An action outcome.** After Orb sends a message, the act of *issuing* it is a
  runtime Event. Reality is only updated when a Sensor later *confirms* delivery —
  recorded as an Observation ("message delivered to John at 4:10 PM, ref #...")
  attributed to the action-outcome sensor. The loop closes on confirmation, not on
  issuance.
- **Confidence of Reality.** The same place can be observed at different
  confidences: a GPS fix records "device at 12.97°N, 77.59°E" with `confidence
  0.97`; an OCR of a printed itinerary records the same address at `0.74`; an
  LLM-extracted "user seems to be in Bangalore" at `0.41`; the user typing their
  own location records `1.00`. All four are kept faithfully; none is "true."
  Interpretation weighs them later.
