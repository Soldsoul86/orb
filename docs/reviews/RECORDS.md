# Cross-Domain Review — the records that had no home

> Written 2026-09-28, after `ModelRouter` and `Encryption` completed the first pass
> over all 30 kernel contracts. **Status: proposal.** Nothing here is applied to a
> contract yet; three of the four findings need no approval to act on, and the
> fourth is a gap this report can only name.

Four review questions, raised independently in three different domains, turned out
to be one question asked four times:

| Raised in | The record with no home |
| --- | --- |
| `Agent` §7 (`EXECUTION.md` q3) | an intent no Capability can bind |
| `Synchronization` §7 (`INFRASTRUCTURE.md` q3) | which peers confirmed an erasure |
| `Encryption` §7 (`INFRASTRUCTURE.md` addendum q5) | a device revocation, and how a peer learns of it |
| `ERASURE.md` D4, reported by `erasure-plan.ts` | what this device has already disclosed |

Reviewing them one at a time would have meant answering the same question four
times and risking four different answers. Worse, each one reads as *the kernel is
missing a State contract*, and four contracts added one at a time is how a kernel
stops being a kernel.

---

## The answer to three of them: not every record needs a contract

The kernel has 17 State contracts. It also already has **two implemented record
types that are not contracts at all**:

- `orb.custody.receipt` (`runtime/journal/src/custody.ts`) — *I hold payloads for
  lane L through envelope H.*
- `orb.erasure` (`runtime/journal/src/erasure.ts`) — *this payload was destroyed.*

Both are an ordinary `Event` with a type and a payload schema. Neither needed a
kernel contract, and neither is worse for it. `KERNEL.md` already states the
principle for the other side of the ledger — *not every behavior earns a contract;
Reflection is composed behavior* — and this is the same rule for state: **a record
earns an `Event` type; it earns a kernel contract only when its meaning is
architectural.**

Both existing types share one design, and it is the design that answers the open
questions:

> **The actor is the lane, never a field.** A custody receipt has no `holder`
> field, because a receipt is an Event on the holder's own lane, so the holder *is*
> `event.device`. Repeating it would be a second source of truth for one fact
> (Art. IX §33) and could disagree with the envelope.

---

## 1. Erasure confirmation — the record type already exists

`INFRASTRUCTURE.md` q3 says *"§7 requires recording which peers confirmed an
erasure, and no contract defines that record."* **The first half is right and the
second half is wrong**, and the mistake is instructive enough to keep.

`ErasureRecord` is `{ lane, hash }` — a declaration that one payload was
destroyed, appended to the lane of the device that destroyed it. So a peer that
honours an erasure appends **its own** `orb.erasure` naming the same
`{ lane, hash }`, on its own lane. The confirming device is `event.device`, by the
same rule as custody. Nothing is missing.

What *is* missing is a reader. `erasedHashes()` collapses every declaration into a
`Set<string>` of hashes — deliberately, because that is what the erased-set
projection needs — and in doing so it **throws away the only field that answers
D5**: who declared it. The confirmation is in history and nothing looks at it.

```
erasedHashes(events)         → Set<hash>              (exists; loses the device)
confirmationsFor(events, h)  → Set<device>            (does not exist; one projection)
```

So D5's finding is computable today as: the devices that declared `h` erased,
intersected against the holders that custody receipts name. No new type, no new
field, no contract.

**Two corrections follow.** `erasure-plan.ts`'s D5 reason says *"no
erasure-confirmation protocol exists"* — true of the reader, false of the record,
and a reader who took it at face value would go and invent a record type that is
already there. And `Synchronization.md` §7 should cite `orb.erasure` rather than
leave the record unnamed.

> This is precisely the failure `SETTLED.md` exists to stop: reading the code,
> reasoning correctly, and arriving at a conclusion the repository already
> answered better. It happened here in the review, not on a device.

---

## 2. Device revocation — an Event type, but the only one that breaks the pattern

Custody says *I hold*. Erasure says *I destroyed*. Both are a device speaking
about itself, which is what makes `event.device` sufficient and what makes them
unforgeable: a device can only write its own lane (`SECURITY.md` §4).

**Revocation is a device speaking about another device.** A revocation of B is
written on A's lane. That is the first record of its kind, and it is where the
equal-peers rule (Art. IV §14) has to be read carefully: if A can revoke B, and B
can revoke A, then either is authoritative over the other, which Art. IV forbids —
or neither is, and revocation means nothing.

The resolution is that **the authority is the user, not the device.** Enrollment is
already *"an explicit, authenticated action initiated from an existing trusted
device"* with *no remote authority that can add a device* (`SECURITY.md` §4).
Revocation is the same act inverted, and A's lane is where the user's instruction
happened to be recorded — not a claim that A outranks B.

Two consequences that should be stated in `Encryption.md` rather than discovered:

1. **A revoked device can still write its own lane.** Nothing stops it; it holds
   its key. What revocation changes is that *other* devices stop accepting its
   later events. Revocation is therefore a rule about acceptance, enforced by every
   peer independently — never a rule about writing, which no one can enforce.
2. **A device cannot be told it is revoked, reliably.** A stolen device may never
   sync again. So revocation is effective exactly where it is known, and the
   honest statement is *"revoked, and four of five peers have seen the
   revocation"* — the same shape, and the same limit, as an unconfirmed erasure.

This one is a real addition: `orb.device.revoked`, payload naming the revoked
device identity and the point in its lane from which acceptance stops. It needs no
kernel contract for the same reason custody did not.

---

## 3. Unbindable intent — a record of *could not*, and it has no home

`Agent` §7 records an intent no Capability matches, *"a finding rather than an
error."* The review asked whether it belongs in `InferenceRecord` or `Action`.
**Neither, and for reasons each contract states itself:**

- **Not an `InferenceRecord`.** That is *reasoning provenance* — inputs, evidence,
  model, parameters, output. The reasoning already happened and is already
  recorded. That no Capability matched is a fact about the **capability set at a
  moment**, discovered afterwards by the Agent. It is not a step in how a
  conclusion was reached.
- **Not an `Action`.** An Action is *"the immutable record that a Capability was
  invoked."* No Capability was invoked. An Action with no Capability would break
  the one thing an Action means.

So it is a third kind: a record that a **binding did not exist**. That is the
project's recurring distinction in a new costume — the same shape as
`Readable: false`, which must never be collapsed into an empty holding set, and as
`absent` versus `destroyed` in the keyring. *Could not bind* is not *chose not to
act*, and dropping it silently deletes the only evidence that Orb was asked for
something it cannot do.

It is an Event type — `orb.intent.unbindable`, carrying the intent and the moment —
for the same reason as the others. What it is **not** is a defect to be fixed by
adding a Capability, and nothing should treat a run of these as an error rate.

---

## 4. Disclosure — the one DR-9 did not close, and cannot

`erasure-plan.ts` reports D4 unconditionally: *"no disclosure record type exists,
so this device cannot say what left it. Nothing was found because nothing can be
found — not because nothing left."*

DR-9 looked like the answer. It ruled this morning that every remote route is a
`Capability`, and `Capability.md` inv. 6 says every invocation produces an
`Action`. One egress path, every crossing recorded.

**It is not the answer, and `Action.md` §1 says why in its own words:**

> *"An Action asserts **issuance, not effect**. … It does not record that John
> received anything, **or that anything left the device**. … until that arrives, the
> honest state of the world is *unknown*, not *done*."*

D4 does not ask what Orb *attempted to send*. It asks what the user must now treat
as **out of their hands**, because that is the question that changes whether an
erasure is worth performing. An Action cannot answer it without becoming the exact
collapse — *sent* and *arrived* as one record — that `Action.md` exists to prevent.

So the gap is narrower and harder than it read:

- **Issuance is recorded** — after DR-9, completely and through one gate.
- **Disclosure is not**, and under Art. XI §42 (*reality is updated only through
  observation*) it would have to arrive as an `Observation` from a `Sensor`
  observing the egress.
- **That Sensor may not be constructible.** A device can observe that it wrote
  bytes to a socket. Whether they were received, retained, or logged by the other
  side is not observable from here, ever.

Which means Art. VIII §32's *"data leaving the device is … itself recorded as
history"* is satisfiable only in its issuance half, and the strongest honest
version of D4 is *"these disclosures were issued; whether each completed is
unknown, and unknowable from this device."* **That is still enormously better than
today's silence** — today the plan cannot even list the attempts.

**Recommendation:** leave D4 open as architectural debt with this characterisation
attached, rather than closing it with Actions and calling disclosure recorded. Of
the four questions this report set out to answer, this is the one that needs a
ruling; the other three need only writing down.

---

## What this proposes, in full

| # | Finding | Kernel contract needed? | Action |
| --- | --- | --- | --- |
| 1 | Erasure confirmation **already has a record type** | No | Add a `confirmationsFor` projection; correct D5's reason string and `Synchronization.md` §7 |
| 2 | Revocation is an Event type, and the first record about *another* device | No | Add `orb.device.revoked`; state the two limits in `Encryption.md` §7 |
| 3 | Unbindable intent is a record of *could not* | No | Add `orb.intent.unbindable`; cite it from `Agent.md` §7 |
| 4 | Disclosure is genuinely unrecorded, and an `Action` cannot record it | Undecided | **Needs a ruling.** Propose: record issuance, name the unknowable half, keep D4 open |

**No new kernel contract, and the kernel is not amended.** Three of the four
questions were asking for a contract where an `Event` type was the right answer —
and one of those three was asking for a record that already existed.

The fourth is the only one that was really a gap, and DR-9 makes it *sharper*
rather than smaller: now that every disclosure goes through one gate, the thing
that is missing is no longer "somewhere to put it" but the honest admission that
what left the device cannot be observed from the device.
