# Action — Contract Specification

```
Contract:   Action
Domain:     Execution
Kind:       State
Version:    v1
Status:     Accepted
Accepted:   2026-09-28
Depends on: Event, Policy
```

> An Action is the record that Orb *attempted* to change the world. It is not
> the change. See `../docs/CAPABILITY_MODEL.md` §7 and `../docs/RUNTIME_LOOP.md`
> §2.

**Why a permanent kernel contract?** Because without a durable record of
issuance, "Orb tried" and "the world changed" are indistinguishable — and once
they are indistinguishable, Art. XI §42 is unenforceable and the runtime loop
can never honestly close. The Action is the anchor that keeps *intent* and
*outcome* separate for the life of the journal: it is what a confirming
Observation later points back at, what a retry is deduplicated against, and what
makes an authorization auditable years after the Policy that granted it was
superseded. Collapse it into "an event with a type" and the boundary between
attempting and achieving moves into implementation, where the Constitution
forbids it from living.

> **Attribution note (v1 design).** An Action names the Capability that ran by a
> **capability identity and declaration version** — a stable value, not a kernel
> dependency. This is deliberate and follows `Observation.md`'s treatment of its
> source: it keeps the kernel a DAG under Art. X §40 (*a State contract never
> depends on a Service*), avoids a cycle with `Capability`, and correctly admits
> Actions whose Capability has since been retired. `KERNEL.md` listed
> `Capability` among this contract's dependencies; that edge was State→Service and
> could not stand. **Corrected 2026-09-28** and AD-5 closed.

---

## 1. Semantics

An **Action** is the immutable record that a Capability was invoked, with which
inputs, under which authorization, at a point in causal time.

An Action asserts **issuance, not effect**. "Message sent to John at 16:10"
records that Orb invoked a send. It does not record that John received anything,
or that anything left the device. Whether the world changed is a separate
question answered by a `Sensor`, later, as an `Observation` — and until that
arrives, the honest state of the world is *unknown*, not *done*.

Every Action is realized as an `Event`; the Action is the meaning of an Event
whose type is action. Per Art. XI §41, the converse does not hold: the *issuing*
of an Action is runtime activity, not an Observation of reality.

> **A conflict inside the Constitution, named rather than resolved quietly.**
> Art. VII §29 reads *"An action, once taken, is appended to history **as a new
> observation**."* Art. XI §41 reads *"the issuance of an Action [is] runtime
> activity recorded as Events — they are not, in themselves, Observations."*
> Those cannot both be literal.
>
> **This contract reads §29 as requiring that an action be appended to history and
> never be silent, and §41 as governing what kind of record that is.** The reasons:
> §41 is the more specific provision and the later article; §42's whole loop —
> *reality is updated only through observation* — is vacuous if the issuance itself
> were an Observation, because an Action would then update reality by existing; and
> §43 gives every Observation a Confidence of Reality, which an issuance has no
> honest value for. Under the other reading, "the message was sent" and "the message
> arrived" become the same record, which is the single collapse this contract exists
> to prevent.
>
> **Stated so it can be rejected rather than assumed**, following `Policy.md` §1. If
> review holds that §29 is literal, then §29 and §41 conflict on their face and the
> Constitution needs an amendment rather than this contract needing a reading.

---

## 2. Lifecycle

1. **Authorization.** `Policy` is evaluated against the intended effect. The
   resulting authorization is recorded. An Action never exists without one.
2. **Issuance.** The Capability is invoked and the Action is appended to the
   device's own lane. From this moment it is permanent history.
3. **Awaiting confirmation.** The Action exists; the world's response does not
   yet. This is a normal, possibly long-lived state — not an error.
4. **Confirmation, contradiction, or silence.** A Sensor may observe the effect
   (confirming), observe something incompatible with it (contradicting), or never
   observe anything at all. **Silence is a legitimate terminal state** and is
   recorded as a gap by Reflection, never resolved by assumption.

---

## 3. State transitions

An Action is immutable State. Its only transition is into existence:

```
(authorized) ──issue──▶ (recorded as Event, immutable, forever)
```

What changes afterwards is not the Action but *what history knows about it*:

```
(issued) ──Sensor observes the effect──────▶ referenced by a confirming Observation
         ──Sensor observes the contrary────▶ referenced by a contradicting Observation
         ──nothing is ever observed───────▶ unconfirmed, recorded as a gap
```

It never transitions to "succeeded", "failed", "cancelled", or "undone". A
reversal is a **new** Action referencing the original; the original's state never
changes, because it remains true that it was issued.

---

## 4. Invariants

1. **Immutable and append-only**, as an Event (inherits all Event invariants).
2. **Issuance, not effect.** An Action never asserts that reality changed
   (Art. XI §42).
3. **Always authorized.** It names the authorization that permitted it. An
   unauthorized Action is not an Action; it is a defect.
4. **Idempotency-bound.** It binds to the decision that triggered it, and that
   binding is its idempotency key: a retry for the same decision can never
   produce a second effect. *(The matching obligation — that an irreversible
   Capability verify the effect has not already occurred before repeating — is a
   runtime obligation and lives in `Capability.md` §4.9, where a Service contract
   can impose it. A State contract cannot bind a Service's behaviour, and this
   invariant previously tried to.)*
5. **Names its Capability as a value** — identity plus declaration version — so
   the effect it was permitted to have stays recoverable after the Capability is
   retired or replaced.
6. **Never silent.** Every invocation produces one, including refusals and
   failures (Art. VII §29).
7. **Never edited.** A reversal, correction or retry is a new Action; the
   original stands.
8. **Unknown is preserved.** An outcome that is not known is recorded as not
   known, never as success and never as failure.

Upholds Constitution Articles I (History), VII §28–29 (authorization, no silent
actions), and XI §41–42 (issuance is runtime activity; reality only through
observation).

---

### The chain an Action belongs to — DR-5

An Action is rarely alone. `DECISIONS.md` DR-5 (decided 2026-09-26) fixes one chain
per intent:

```
intent → review → confirm | cancel → release → result
```

Three consequences bind this contract:

1. **The chain is `causes`, not a new field.** The Event envelope already expresses
   lineage, and a parallel `intent_id` would be a second way to say one thing
   (`Event.md`; Art. IX §33). An Action names its `intent` and its `confirm`
   through `causes` and nowhere else.
2. **Cancels are recorded, and they are the evidence.** *A gate that records only
   what passed cannot demonstrate what it stopped.* A chain ending in `cancel`
   produces a record exactly as one ending in `release` does — §4.6's *never
   silent* covers refusals the human made, not only those the world made.
3. **`release` and `result` are distinct terminal states** (DR-4). A hand-off ends
   the chain without a result and says so; it does not borrow `result` to mean
   *something happened, probably*. That is §1's issuance-not-effect boundary
   appearing again at the end of the chain.

**Hesitation time is content, not bookkeeping.** How long a person paused before
confirming a payment is behavioural data of a fairly intimate kind. It is subject to
`ERASURE.md` like any other payload, and it must not be written into a bookkeeping
event that erasure does not reach.

---

## 5. Versioning rules

- **New Action payload schemas** — new kinds of effect — are added freely; each
  is versioned, and existing kinds never change meaning.
- The core obligation — *authorized, issuance-only, idempotency-bound, recorded*
  — is frozen at v1. Weakening it requires `Action v2` alongside v1, never
  replacing it.
- Older schemas remain valid and readable forever, and remain explainable against
  the Capability declaration and Policy version they name.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- An Action names what was attempted, with which inputs, under whose
  authorization, and at what causal time.
- That authorization stays explainable even after the Policy is superseded and
  the Capability retired.
- An Action never changes; corrections arrive as new Actions.
- A retry bound to the same decision never doubles an effect.

Not guaranteed:

- **That the effect happened.** That is what confirmation is for.
- **That confirmation will ever arrive.** Some effects are never observable.
- **That the outcome Observation exists yet.** Sensing is eventually-complete,
  not instantaneous.

---

## 7. Failure modes

- **Not issued.** The Capability was unavailable or refused before reaching the
  world. Recorded as an attempt that did not issue. **Safe to retry.**
- **Issued, outcome unknown.** Recorded as issued and unconfirmed. **Not safe to
  retry** except through the idempotency binding of §4.

  These two must be distinguishable in the record, always. Collapsing them is the
  single most dangerous simplification available in an effect system: it is
  exactly how a payment is made twice, and the ambiguity is invisible until it
  costs something real.
- **Confirmed contrary.** A Sensor observes something incompatible with the
  intended effect. Both the Action and the contradicting Observation stand; the
  conflict is structure in the Evidence Graph, resolved in interpretation, never
  by editing either.
- **Never confirmed.** Remains unconfirmed forever. Reflection records the gap.
  Reality is not updated — an issued Action that is never confirmed leaves the
  world, as far as Orb is concerned, unchanged.
- **Duplicate issuance attempt.** Re-issuing for a decision that already produced
  an Action yields that same Action. No second effect, no second record.
- **Authorization expired between authorizing and issuing.** The Action is not
  issued; the lapse is recorded. Time passing is not consent.

Never permitted: an Action without an authorization; editing or deleting one;
asserting an effect occurred without a confirming Observation; recording an
unknown outcome as a known one.

---

## 8. Examples

- **A message with a receipt.** Orb issues a send at 16:10 — that is the Action.
  A delivery receipt observed at 16:11 is an Observation referencing it. Only
  then does history hold that the message arrived.
- **A message with no receipt.** The send is issued; nothing is ever observed.
  The Action stands, permanently unconfirmed. Reflection records the gap. Orb
  never says the message arrived, and never says it did not.
- **A payment.** The spend is issued, never assumed. The reconciler settles only
  on a Sensor's confirmation, and an observer that answers "unknown" resolves
  nothing — the Action stays unconfirmed rather than being read as either
  outcome.
- **A retry after a timeout.** The first attempt timed out: issued, unknown. The
  retry is bound to the same decision, so it either returns the existing Action
  or verifies the effect has not occurred before repeating. It never sends twice.
- **A reversal.** A draft event created in error is deleted. The deletion is a
  **new** Action referencing the first. History holds both: it remains true that
  the event was created.
- **A fall alarm.** Issued after a standing authorization's silence window
  elapses. It is confirmed when the contact answers — and if nobody answers, the
  Action stands unconfirmed and the gap is exactly what Reflection should
  surface, because an alarm nobody received is the failure that matters most.
