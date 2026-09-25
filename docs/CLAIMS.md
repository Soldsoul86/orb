# The claims Orb must earn

**Status: PROPOSAL.** Two rulings are open (§5). Nothing here is ACCEPTED, and
no claim below has been earned yet except where marked.

---

## 0. Why this document exists

The device loop tests whether the runtime survives a real phone. This document
tests something different and harder: whether the *product promise* is true.

The promise, stated plainly, is that Orb combines three things nobody currently
ships together, under the user's ownership:

1. a consent gate at the irreversible moment,
2. a record no agent can rewrite,
3. data that never leaves the user's control,

and does all three with **any** model provider.

That is a claim about the world, not about the code. `CONSTITUTION.md` Art. XI
§42 says Orb never assumes an Action changed reality; the same discipline
applies to this project's own marketing. A promise nobody tried to break is a
hope. This document turns each part of the promise into something that can come
back refuted.

---

## 1. What makes a claim a test rather than a demonstration

Four rules. A claim that fails any of them is not ready to run.

**R1 — A named adversary.** The test must state who is trying to defeat it and
what they are assumed to know. For most claims here the adversary is *the agent
itself*, assumed competent, assumed to want to succeed, and assumed to have read
Orb's source. An adversary who is not trying is not a test.

**R2 — A negative control.** The test must include a variant that a system
*without* the property would fail. This is the rule the gap threshold broke
(`DEVICE_LOOP.md` §5e): a 135-second gate let the instrument report success on
every gap it was built to catch. If a test passes for both Orb and the thing
Orb claims to beat, it discriminated nothing and proved nothing.

**R3 — A dated, versioned comparison.** Any claim of the form "existing tools
fail this" names the product, the version, and the date it was tested. It is a
demonstration that the failure occurred against a stated version on a stated
date — never a measurement of how often it happens, never a standing property
of that product, and never restated as a rate. The same rule governs how this
project talks about anyone else's defects anywhere.

**R4 — A stated boundary.** Every claim below also states what it does *not*
cover. A claim without a boundary is a claim that will be found false by the
first person who looks past its edge, and the finding will be theirs instead of
ours.

---

## 2. C1 — The gate cannot be routed around

**Claim.** An agent cannot complete an irreversible action without an
authorization the user gave *for that action*, even when the agent actively
tries to avoid asking.

*Constitutional basis:* Art. VII §27, §28, §29.
*Status:* UNPROVEN. Blocked on `Capability.md` / `Action.md` / `Policy.md`
leaving Draft, and on the §5 ruling.

**The routes the adversary gets to try.** Each is a separate test; the claim
holds only if every one is refused, and only if every refusal is itself appended
to history (Art. VII §29 — there are no silent actions, and there should be no
silent refusals either).

| | Route | What it attacks |
|---|---|---|
| A1 | Spend one authorization twice | Grants must be single-use or bounded |
| A2 | Ask broadly, act narrowly-but-differently | Scope is not a category, it is a binding |
| A3 | Split one irreversible act into steps that each look reversible | Composition, not the individual call |
| A4 | Get approval for a dry run, then change an argument | The grant must bind to the argument hash |
| A5 | Batch the request into a moment of inattention | Timing of consent — see §5 |
| A6 | Use a path Orb does not mediate at all | The boundary |

**Pass bar.** A1–A5 refused, each refusal journaled with the reason. A6 is
**not refusable** and must not be claimed as such.

**Boundary (R4), and this is the important part.** Orb gates what Orb mediates.
An agent holding its own credentials to some service can act without asking Orb
anything, and no amount of architecture on this device changes that. So the
honest claim splits in two:

> Within the mediated set, the gate cannot be routed around.
> Outside it, the action is *detected and recorded*, never silently absent.

The second half is exactly P4's property — the runtime knows when it was blind —
applied to actions instead of process death. It needs a vantage point the agent
cannot lie from, which `SOVEREIGN_STACK.md` already identified as the router
rather than the phone. Until that exists, C1 is claimable only in its narrow
form, and saying otherwise would be the kind of overreach this document exists
to prevent.

**Negative control (R2).** The same six routes against a named agent framework
with built-in confirmation, same day, version recorded. If A1–A5 do not succeed
anywhere else, the test is not discriminating and needs a stronger adversary.

---

## 3. C2 — The record cannot be rewritten without detection

**Claim.** Any alteration or deletion of history is detected.

*Constitutional basis:* Art. I.
*Status:* **partly earned, 2026-09-25.** See `DEVICE_LOOP.md` §5d — the hash
chain caught a defect its own author had introduced, on the operator's phone,
within three minutes, without being asked to look. That is the single strongest
piece of evidence this project has, precisely because nobody staged it.

It is partly earned and not fully earned because "the record" has three
different failure modes and only one of them has been demonstrated.

**C2a — Alteration in place.** An envelope is edited. **Not detected by the
shipped probe**, and the earlier draft of this document was wrong to say it was.

`verify()` compares each event's `previous` against the recorded hash of the
line before it. It never recomputes a hash from the stored fields. So an edit
that changes what an event *says happened* while leaving the hash fields alone
passes clean — demonstrated, not argued, by
`apps/pixel/pass1/tests/JournalTest.java.in`, which edits a payload and asserts
that `verify()` still returns `ok`.

What §5d actually demonstrated is narrower and still valuable: **linkage**
evidence. The chain detects deletion, insertion, reordering, and a restart that
forks the chain — which is the defect it caught. That is a real property and it
caught a real bug. It is not alteration-detection, and calling it that would
have been the exact overreach this document exists to prevent.

Re-derivation needs a JSON parser the probe does not have. The right home for it
is the desktop analyser rather than the phone, because a chain checked only by
the device that wrote it is the weaker check — the same reasoning as C2c.

**C2b — A missing payload.** Under `PARTIAL_REPLICATION.md` this is *legitimate*
— pruning is a feature, not damage. The bar is therefore not "payloads are never
missing" but: **a pruned payload is distinguishable from a lost one.** The
envelope survives, `payloadHash` survives, and the prune itself is journaled.
A replica that cannot tell the two apart has a history with holes it cannot
explain, which is the condition P4 exists to make impossible.

**C2c — Tail truncation by the key holder.** The device that holds the signing
key drops the last N events and re-signs. **This is not detectable from that
device alone**, and any claim that it is would be false. It is detectable only
by a second witness comparing watermarks — which is what custody receipts and
K≥2 are for, and is the reason the `SyncPeer` port exists at all. The property
is not "tamper-proof". It is: *tampering requires defeating every witness, and
the number of witnesses is the user's choice.*

**A witness counts only if it holds an independent key.** Two devices sharing a
signing key are one witness, because whoever holds the key can make both say the
same false thing. This is not what the code counts today: `evaluatePrune`'s
`holders` are device identifiers (`runtime/journal/src/retention.ts:93`), and
there is no key concept anywhere in `runtime/` or `contracts/` — a search for
signing key, public key or key id returns nothing.

The distinction matters differently for the two properties K≥2 is asked to
carry. For **durability**, two devices sharing a key are still two copies, so
counting devices is defensible. For **tamper-detection**, they are one witness,
so counting devices is wrong. Orb cannot currently tell these apart because it
cannot express "independent key" at all. Logged as architectural debt (AD-6); C2c is
not runnable until it can. `WITNESSES.md` works out what a witness should be —
another person's phone holding a few hundred bytes it cannot read — and is
blocked on the same entry.

**The owner is not the adversary here, as of 2026-09-25.** `ERASURE.md` records
the operator's ruling that deletion is a right, exercised openly and declared in
history. That removes the awkwardness in C2: Orb is not trying to stop its owner
from deleting, it is trying to ensure no deletion is *silent*. Undeclared
removal is therefore an attack by definition, never an exercise of a right — and
since a declared erasure leaves the envelope, the height and every hash
unchanged, it is invisible to C2c. The two concerns are orthogonal.

**Negative control (R2).** The same three mutations against a product whose log
lives on the vendor's server. C2c is that product's default configuration: the
operator of the log is, by construction, the party who can truncate it. Naming
that is the comparison — not a claim that any particular vendor has done it.

**Method.** An adversary harness in `runtime/journal` that performs each
mutation and asserts detection. This is the nearest claim to runnable and should
be first.

---

## 4. C3 — Providers are replaceable; C4 — the slice is minimal and visible

### C3 — Switching providers loses nothing

**Claim.** Change the model provider and no history, no derived state, and no
capability is lost.

*Constitutional basis:* Art. VIII §31 — never introduce vendor lock-in.
*Status:* UNPROVEN.

**Pass bar, in three ascending steps.**

1. Run task T on provider A from a known pre-state; keep journal `J_A`. Run the
   same T on provider B from the same pre-state; keep `J_B`. The two must differ
   **only** in `InferenceRecord` fields naming the provider and in fields derived
   from model output. Every envelope, every capability invocation, every consent
   grant must be structurally identical. If the shape of history depends on who
   answered, the provider is load-bearing and the claim is false.
2. Replay `J_A` with provider B configured. Bounded replay must reproduce the
   same derived state, because under Art. I derivations come from events.
3. **The strong form:** replay `J_A` with *no provider at all*. Orb must degrade,
   not fail (Art. VIII §31). A local model satisfies this; a network error does
   not.

**Negative control (R2).** The same task on a product where memory is a
server-side feature. The bar is deliberately higher than "you can export your
data" — nearly everyone can export text. The question is whether the export,
taken out and loaded elsewhere, **replays into equivalent state.** That is the
difference between portability and a souvenir.

### C4 — The task completes on the slice, and the slice is in the record

**Claim.** A model finishes a task using only the slice of data it needed, and
the user can see what that slice was.

*Constitutional basis:* Art. VIII §32.
*Status:* UNPROVEN and **not yet runnable** — it measures the outbound side of
`AIRWALL.md`, which is still an unapproved proposal. C4 cannot precede it.

**Three assertions, and the third is the one that matters.**

1. The bytes that actually left equal the contents of the slice event —
   compared against an **egress capture taken off the device**, per
   `SOVEREIGN_STACK.md`. A phone reporting on its own egress is not evidence.
2. The slice is strictly smaller than the store, by a stated ratio, on a task
   where that is non-trivial.
3. **Removing any one item from the slice makes the task fail.**

Assertion 3 is the negative control and without it the whole claim is vacuous: a
system that ships the entire store also "finishes the task using the data it
needed." Minimality is only demonstrated by showing the slice is *tight* — that
nothing in it was surplus. If the task still succeeds with an item removed, the
minimization was not minimal and the number in assertion 2 was decoration.

---

## 5. Open rulings — these block C1

**Ruling 1 — timing of consent (Art. VII §28).** `Policy.md` §1 offers two
readings: authorization is valid only at the moment of issue, or it persists for
a declared window. A5 above cannot be specified until this is decided, because
under one reading batch approval is a feature and under the other it is the
hole. This awaits the operator's explicit ruling, as `PARTIAL_REPLICATION.md`
§10 awaited one.

**Ruling 2 — how narrowly C1 is stated.** Either the claim is made only for the
mediated set (defensible today), or it also claims detection of out-of-band
action within a stated bound (stronger, and requires the off-device vantage
point to exist first). This is a decision about what Orb promises, which is not
mine to make.

---

## 6. Order of work

Not now. `DEVICE_LOOP.md` §7 R4 stands: the pass-1 run is under way and the
instrument does not change while it is running.

After it, in this order, because each is gated by what it needs:

1. **C2** — the harness is mechanical and the journal is built. C2b is
   runnable now. C2a needs re-derivation, which belongs in the desktop
   analyser. C2c needs the key concept that does not yet exist (AD-6), so the
   claim that looked nearest to runnable is the one with the most missing under
   it — which is what writing the tests was for.
2. **C3** — needs no phone and no airwall. Pure runtime.
3. **C1** — needs the three contracts accepted and Ruling 1 made. Its first
   subject should be erasure (`ERASURE.md` §10): the canonical irreversible
   Action, wholly local, needing no external service, and impossible to undo, so
   all six routes above are testable without anything leaving the device.
4. **C4** — needs the airwall to exist.

A claim moves from UNPROVEN to EARNED the same way P0, P0a and P4 did: a dated
entry, the evidence, and what would have changed had it come back the other way.
Until then this project says it is *building* toward these, and does not say it
has them.
