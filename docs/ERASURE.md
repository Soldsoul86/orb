# Erasure — the right to delete, and the duty to say so

**Status: four rulings ACCEPTED, 2026-09-25 — the Art. I §2 reading and the
permanent prohibition on E2/E3 (§2), the coarse envelope type, and the coarse
vocabulary (both §2b). The rest is a PROPOSAL.** Nothing here is implemented;
§9 carries what is still open.

---

## 0. The ruling

> *"All these proofs are mine. I should be able to erase it — just that Orb
> should know that I have done it."*
> — the operator, 2026-09-25

Which gives the rule this document is built on:

> **History may shrink. It may never shrink silently.**

Both halves matter. Immutable history denies the owner a right over their own
life. Silent deletion deceives whoever reads the record. This is the third path:
erasure is legitimate, and erasure is declared.

**Read §0a before relying on that sentence.** It is a rule an honest
implementation follows, not an invariant the format enforces, and the difference
is load-bearing.

**The consequence worth noticing first.** If you can delete openly, the only
reason to delete secretly is to deceive someone. Silent truncation therefore
becomes, by definition, an attack — never an exercise of a right. Orb stops
having to work against its owner, which is the fork `CLAIMS.md` could not
resolve and this ruling closes.

---

## 0a. Policy, not invariant — and the difference matters

*Recorded 2026-09-25, after the operator asked what the claim actually rests on.*

§0's rule reads like an invariant. It is not one. **Nothing in the structure
forces a declaration to be written.** An originator can drop a payload and stay
silent, and no hash chain, witness or protocol detects it — because *"I will not
show you"* and *"I cannot show you"* are the same observation from anywhere
else, in this system and in every other.

So the rule is what an **honest implementation does**, not what the format
guarantees. Stating it as a guarantee was an overreach, and it was mine.

### What is enforced, and what is merely followed

| | Enforced by structure | Followed by policy |
| --- | --- | --- |
| The sequence — nothing altered, inserted, removed, reordered | **Yes**, hash chain | |
| The count — E1 removes no events | **Yes** | |
| The commitment — `payloadHash` survives erasure | **Yes** | |
| An absence carries a reason locally | **Yes**, the type system now requires it | |
| Every absence is explained in history | | **Policy** (inv. 6, receipts, declarations) |
| An erasure is declared at all | | **Policy** |

An erased payload therefore leaves a record that proves *something of this hash
existed at this position in this order*. It proves nothing about what that
something said — and it cannot prove that the silence around it was honest.

### The two things that narrow it

**Unexplained absence is visible.** Each honest reason has a journaled
counterpart: `unfetched` a policy record, `pruned` custody receipts, `erased` a
declaration. An absence with none of them is *detectably unexplained*, which is
the "knows what it does not know" property applied to content instead of to
time.

**Custody turns silence into a contradiction.** A device that asserted custody
and later cannot produce the payload has either pruned it — which needs receipts
— or erased it — which needs a declaration. With neither in history it is caught
holding a claim it cannot support.

What escapes both is content **only the originator ever held**: nothing outside
that device ever recorded that the payload was available, so its destruction
leaves no contradiction to find. `CLAIMS.md` C2d carries this as a named,
undetectable case rather than a gap to be closed later.

### Why this is written down rather than fixed

It cannot be fixed. It can only be stated, so that no claim in this project
rests on it quietly. A reader deciding whether to trust an Orb journal is
entitled to know that *declared* erasure is a discipline its owner keeps, not a
property its format enforces — and that the value of the record comes from the
sequence being provable, not from the content being complete.

---

## 1. The second ruling: no silent choices

> *"Wherever there is ambiguity, user should be notified and then proceed, so
> everything is transparent to me."*
> — the operator, 2026-09-25

This is not a preference about dialogs. It decides a design question that was
open: when erasure reaches something it cannot cleanly resolve — a conclusion
that only partly depended on the erased event, a peer that has not confirmed, a
disclosure that cannot be recalled — the system **does not pick a default.** It
names the ambiguity and waits.

§4 turns that into a list of the specific points where it fires, so it is a
testable obligation rather than a slogan.

It also settles the shape of the operation. Erasure is **two-phase**: compute
the full consequence, show it, then act — never act and report. Art. VII §28
requires explicit, scoped authorization for irreversible actions, and there is
no more irreversible action in Orb than this one.

---

## 2. Art. I §2, and why an amendment may not be needed

Art. I §2: *"Events are never edited, reordered, or deleted."*

`PARTIAL_REPLICATION.md` §10 already ruled on this clause, but that ruling does
not cover erasure. It turned on **"relocated, not deleted"** — a pruned payload
still exists, readable, on K other devices, so identity, content and
replayability survive. Erasure destroys content. It fails the test that ruling
passed, and cannot ride on it.

**The reading, ruled on:**

> Erase the payload. Keep the envelope.
>
> No event is edited, none reordered, none removed from the sequence. The
> sequence is the same length, in the same order, with the same hashes. One
> event has no readable content any more, and says so.

> *"E1 is right, payload goes, envelope stays."*
> — the operator, 2026-09-25

**Ruled: accepted, 2026-09-25**, explicitly rather than by assumption, for the
reason `PARTIAL_REPLICATION.md` §10 gives — *a law quietly reinterpreted once
would be quietly reinterpreted again.* Art. I §2 is unamended. What it forbids
is a change to the **sequence**: editing an event, moving one, removing one. A
payload destroyed in place leaves the sequence identical in length, order and
every hash. The event is still there, still linked, still counted, and now says
of itself that its content is gone.

The cost this accepts, stated at the moment of accepting it rather than
discovered later: **the envelope still carries type and timestamp** (§2's ladder,
E1's limit). The right ruled on here is the right to erase *what happened*, not
the right to erase *that something happened*.

**The envelope with no payload *is* the tombstone.** It is not a separate record
that could itself be erased, so there is no regress to argue about.

### What falls out of it

Height does not change. The head does not change. No hash changes.

**So erasure never looks like truncation.** A witness's attestation — lane at
height 4,812, fingerprint `a7f3` — still reconciles exactly after two hundred
payloads are destroyed. Erasure and `CLAIMS.md` C2c become fully orthogonal, and
witnesses are left with one narrow job: detect **undeclared** removal.

### The ladder, and what each rung costs

| | What goes | Chain | Amendment? |
| --- | --- | --- | --- |
| **E0** | Nothing | — | Today's behaviour |
| **E1** | The payload | Intact; height and hashes unchanged | **No** — ruled 2026-09-25. **Adopted.** |
| **E2** | Payload and the event's *type* | Hash changes; the chain must be re-linked | **Forbidden** — ruled 2026-09-25 |
| **E3** | The whole event | Height changes; indistinguishable from truncation | **Forbidden** — ruled 2026-09-25 |

**E1's honest limit:** the envelope still carries type and timestamp. Erasing
the payload of a `health.appointment` at 15:04 does not hide that an event of
that kind happened then. E1 gives the right to erase *what happened*. Erasing
*that something happened* would be E2 or above.

### E2 and E3 are forbidden, not merely unadopted

> *"E2 and E3 should never be possible. There can always be a representation,
> but someone should not be able to go and decode what has happened."*
> — the operator, 2026-09-25

**Ruled.** This is a law, not a deferral. The shape of history — that an event
occurred, of some type, at some time, in some position — is **permanent and not
erasable by anyone, including its owner.** Only content is erasable.

The reason it is worth fixing as law rather than leaving open: an erasure that
can remove the shape is indistinguishable from truncation, which would undo the
orthogonality §2 just bought and re-open the conflict with witnesses. Forbidding
it keeps `CLAIMS.md` C2c's job narrow forever, rather than only until someone
asks for more.

**The cost, accepted knowingly.** Under compulsion the shape is visible and
cannot be removed: an adversary sees *"twelve events of this type in March, all
erased."* That is information, it is permanent, and no future feature will take
it away. §9.3 records the one lever that could narrow it without breaking this
ruling.

**And a second cost, found later and recorded here rather than moved.** Shape
implicates; content exonerates. E1 destroys content and this ruling makes shape
permanent, so **an erasure removes the owner's defence and leaves the accusation
standing.** Erasure is therefore not a neutral safety action — it is a choice
about which adversary is being defended against, protective against a reader and
costly in front of an accuser. `THREAT_MODEL.md` §3 and §5.

---

## 2a. What "cannot be decoded" requires

The ruling says *destroyed*, not *deleted*. Those are different engineering
problems and only one of them is achievable.

### Deleting the bytes is the weak answer

Two reasons it does not deliver what was ruled:

- **Flash does not overwrite where you tell it to.** Wear levelling and
  copy-on-write mean a payload "removed" from a file may persist in cells the
  filesystem no longer references. Forensic recovery is a real possibility, not
  a theoretical one.
- **It cannot reach a copy you do not control.** §6 — erasure is local. A peer
  that holds the payload holds it whether or not this device deleted anything.

### Destroying the key is the strong answer, and it is nearly in place

`SECURITY.md` §3 already makes encryption at rest **mandatory** and states that
the store holds ciphertext; `STORAGE.md` §49 repeats it. So the architecture
already stores payloads encrypted. The missing piece is **granularity**: one
store-wide key cannot be destroyed for one event.

With a per-event or per-epoch payload key, erasure becomes *destroy that key*:

| | Delete the bytes | Destroy the key |
| --- | --- | --- |
| Copy on a peer's device | Still readable | **Inert ciphertext** |
| Residue in flash | May survive | **Survives, and is undecodable** |
| Copy in a backup | Still readable | **Inert** — unless the key was backed up too |
| Cost of the operation | Proportional to the payload | A few bytes |

This is the mechanism that makes the ruling true rather than aspirational. It is
also the only way §6's "erasure is local" stops being a serious limitation: the
witness who holds an envelope, the peer who holds a payload, and the backup on
a drive in a cupboard all hold something that no longer decodes.

### What makes this checkable by anyone but the owner

Per-event keys give the owner erasure. They do not, on their own, give anyone
else a reason to believe the keys were ever where the owner says.

**Hardware attestation is that step** (`THREAT_MODEL.md` §7a): a lane key held
in StrongBox and named by an attestation turns *"my key is in secure hardware"*
from a claim into something a reader can check — and makes a truncate-and-re-sign
require physical possession of the device. Recorded as device predictions P8 and
P11 rather than assumed, because nothing has tested either on this hardware.

Attestation stays an Observation with its own confidence, never a root of trust;
a design that let it settle a question rather than inform one would have put a
vendor back at the root by the back door.

### The property worth naming

**A key that no longer exists cannot be produced under compulsion.**

This is one of very few genuine protections against coercion available to
anyone. It is a direct consequence of the ruling and should be stated as a
designed property, not discovered later as a side effect.

### What it costs, and one trap

- **There is no undo, at all.** That is the point, and it is also a foot-gun.
  The two-phase preview in §1 is not a nicety here; it is the only thing standing
  between the owner and an irreversible mistake.
- **The key store becomes the crown jewels.** Losing it loses everything, which
  is a different failure from the one erasure is for.
- **A backed-up key is an un-erased payload.** Key backup policy is therefore
  *part of erasure semantics*, not a separate operational concern. An erasure
  that leaves a key in a backup is a declared erasure that did not happen, which
  is exactly the deception this document exists to prevent. D4 must cover it.
- **It interacts with AD-6.** Keys become load-bearing in two unrelated places —
  witness independence and payload erasure — which is an argument for getting the
  key identity right once rather than twice.

**What it does not fix:** §5a and §5b stand unchanged. Destroying a key removes
the content. It does not remove a pattern that was over-determined, and it does
not make re-derivation impossible.

---

## 2b. The envelope is coarse from birth

> *"Coarse type in the envelope, real type inside the payload."*
> — the operator, 2026-09-25

**Ruled.** The envelope carries a coarse public type. The true type travels
inside the encrypted payload.

### This is not E2, and the distinction matters

E2 was *erasing* the type from an existing envelope: the hash changes, the chain
must be re-linked, and it is forbidden. This is different in kind — **nothing is
ever erased from an envelope.** The envelope simply never carried the fine type
in the first place. Sequence, order, count and every hash are untouched, exactly
as the E2/E3 ruling requires.

### It also makes E1 stronger than it was

Under the original E1, erasing a payload left `health.appointment` standing in
the envelope. Under this ruling, the fine type lives in the payload — so
**erasure takes the type with it.** What remains is `orb.observation` at a
timestamp: that something was observed, and nothing about what.

The cost accepted in §2 — *"twelve events of this type in March, all erased"* —
shrinks to *"twelve observations in March, all erased."* The shape stays
permanent, as ruled, but it says much less.

### Three other fields leak the same thing, or the ruling is cosmetic

Verified against the envelope (`runtime/journal/src/types.ts:52`):

1. **`schema`.** Today `schema.id` *is* the type — `Journal.java.in` sets
   `schema.put("id", type)` and the TypeScript side matches. Coarsening `type`
   while leaving `schema.id: "health.appointment"` would leak everything the
   ruling removes. **The schema reference must move into the payload too**, or
   become coarse alongside the type. This is the one that would have quietly
   undone the whole change.
2. **`lane`.** A lane named for a content domain reinstates the leak by another
   route. Lanes are per-device today (`pixel`), and this ruling makes that a
   **constraint rather than a convention**: lanes are named for devices or
   origins, never for subject matter.
3. **`device`.** Stays legible. It is needed for attribution and ordering, and it
   says who recorded rather than what — but it is a linkability signal and is
   recorded here as an accepted residue, not an oversight.

The wall clock stays as it is. It is inside the hash preimage and the HLC
depends on it, so coarsening it is not available without a deeper change.

### The vocabulary, ruled

> **Bookkeeping events keep their real names. Everything else gets one label.**
>
> **Ruled 2026-09-25.**

Bookkeeping types stay exactly as they are — `orb.custody.receipt`,
`orb.sync.policy`, and the erasure declaration and chain-discontinuity records
still to be written. They are *about* the record rather than *of* a life, they
disclose nothing under compulsion, and the sync layer cannot function without
them: `isBookkeeping` (`sync.ts:128`) reads `event.type`, `latestCustody` needs
receipts told from policy specifically, and **a witness holds no payloads ever**,
so it can never decrypt to find out.

Everything else — observation, inference, plan, issued Action, disclosure —
carries a single type: **an event whose nature is inside the payload.**

**Why the minimum rather than a richer split.** Every label is permanent under
§2, so the choice is asymmetric: starting coarse stays reversible, because
finer labels can begin later while the old prefix stays safely coarse. Starting
fine is irreversible, because the events already written keep their labels and
§2 forbids removing them. A survey of what reads `event.type` without the key
found only bookkeeping on the list — so a three-way split (`observation` /
`activity` / bookkeeping, following Art. XI §41) would spend an irreversible
privacy budget on a distinction no current code consumes. If that changes, it
can begin then.

**Schema follows.** `schema` describes the payload, so it belongs with the
payload. A content event's envelope carries only a schema for *"an encrypted
payload"* — not for what is inside. Bookkeeping events keep their real schema,
since peers parse them without decrypting. The envelope shape stays uniform and
the leak closes at both fields.

### What this costs, and why the operator accepted it

An erased event becomes **completely uninterpretable**. Not "a health record was
erased," not "an observation was erased" — only *something was here, at this
time, and its content is gone.*

That includes to the owner. There is no record of what was erased, and no undo.

> *"This is perfectly alright, else someone will just try to erase and get the
> summary."*
> — the operator, 2026-09-25

**This is the deciding argument, and it is stronger than the privacy one.** A
record of what was erased is an **oracle**. It turns coercion into a two-step
procedure: compel an erasure, then read the summary of what was erased. The
mechanism for forgetting would become the most efficient way to interrogate.

It is also the same object §5b already identified. A "what I erased" log and a
suppression list are one thing under two names: a permanent record of exactly
what the owner wanted forgotten. §5b ruled it unbuildable on privacy grounds;
this rules it unwanted on adversarial grounds. Both point the same way.

### The consequence for the erasure declaration itself

The erasure declaration is **bookkeeping** — a peer must read it to know *"never
send this again"* without decrypting anything. It is therefore legible.

So it must carry **only a reference**: which envelope, by hash and position, and
the fact of erasure. Never the type, never a summary, never a plain-text reason.
A legible declaration that described its subject would reintroduce the oracle at
exactly the point the ruling removes it.

### The preview may be rich; the record must be bare

§4 requires that the owner be shown what will be torn down *before* it is torn
down. That preview is **ephemeral** — computed at the moment of decision, from
data that still exists, shown once, never written to history.

The distinction is the whole design:

| | Preview | Record |
| --- | --- | --- |
| When | Before erasure, while the payloads still exist | After, forever |
| Contains | Everything: types, content, blast radius, disclosures | A reference and a fact |
| Survives | No | Yes |

An implementation that journals the preview has built the oracle by accident.

### What this breaks

`holdTypes()` (`sync.ts:98`) lets a device choose what to hold *by type*. Across
a trust boundary it now sees only coarse types, so a fine-grained hold policy is
no longer expressible remotely — it would need an encrypted index shared between
devices that already share keys, which is machinery that does not exist.

Recorded as a cost of the ruling rather than argued against it. `holdEverything`,
`holdNothing` and `holdSince` are unaffected, and those are the policies a
witness and a durability peer actually use.

**This changes a kernel contract.** `Event.md` and `EVENT_MODEL.md` define the
envelope, and the type field's meaning changes for every Event in the system.
That edit is not made here; it is named so it is not discovered later.

---

## 3. Erasure is a graph operation, not a row operation

Deleting an event does not delete what was learned from it. The Belief, the
Fact, the index entry, the summary, the twin — each was computed once and now
stands on its own, still answering questions from content that is gone.

Art. I §3 gives the mechanism and needs no amendment:

> *"All other state is a derived projection and may be discarded and rebuilt."*

So: **erase the event, discard everything derived from it, replay what remains,
rebuild.**

### The requirement this creates

**No derivation without recorded lineage.**

Given an event, Orb must be able to find every Belief, Fact, index entry and
summary that used it. `Belief.md` carries provenance and Inference Records point
*backward*, from conclusion to evidence. Erasure walks the same edges *forward*.

If one derivation exists whose inputs were not recorded, **erasure is a lie** —
something downstream still holds what was destroyed, and nothing knows to clear
it. This is a hard constraint on `Belief.md`, `Fact.md`, `InferenceRecord.md` and
`EVIDENCE_GRAPH.md`, and all of them are still Draft. Now is the cheap moment.

### Built, 2026-09-25 — `runtime/journal/src/lineage.ts`

The forward read of `causes`. Nothing new is stored: an event that cites its
inputs *is* the lineage, and a second structure holding the same facts would be
a second source of truth for them (Art. IX §33).

**Ephemeral by construction.** The index is a value — computed, used, dropped.
The operator ruled that *the journal entries are the only trace that exists*, so
an index on disk would be a second trail outliving the entries it describes, and
would survive the erasure that removed them. It holds ids, hashes and edges;
never content.

**`closed`, not `complete`.** A traversal reports whether it ran out of edges
*within the events indexed*. It never claims no other device holds a derivation
this one has not seen — not knowable from here, which is what `Horizon` exists
for. A root the index does not hold comes back `closed: false` with the root
named, because the dangerous answer is an empty list that looks like *"nothing
was built on it"*: an erasure planned on that tears down nothing while believing
it tore down everything.

**Provenance survives the ruling.** `ancestorsOf` reads what an event openly
says about itself. What the ruling forbids is a trail stored *beside* the
journal, not an entry's own account of where it came from — Reading 1, ruled
2026-09-25.

**Cycle safety is not hypothetical hygiene.** `Journal.append` only ever cites
earlier events, so a cycle means a malformed or hostile journal — and a
traversal that looped on one would hang the erasure preview at the moment the
owner is waiting on it. Verified by removing the visited-set guard: the suite
then runs until killed at twenty seconds, and passes in milliseconds with it.

**What it cannot find**, unchanged: a derivation that did not record its inputs.
See below.

---

### Lineage is policy too — and the coarse type removed the check

`causes` is populated by whoever appends. Nothing forces it to be complete or
honest, so a derivation that recorded no inputs is invisible to any traversal,
sits on erased content forever, and no amount of walking will reach it. Third
instance of the same shape as §0a and `CLAIMS.md` C2d, and it is recorded here
rather than found later.

It narrows but does not close: `Belief.md` requires a model-backed Belief to
carry provenance sufficient to explain it, so the **model** path is
contract-enforced. Hand-written code appending a derived event is checked by
nothing.

**The obvious enforcement point is gone, and §2b is why.** The natural check —
*the journal refuses an append of a derived event with empty `causes`* — is no
longer available: the envelope says only that this is content, and the real type
is inside the encrypted payload, so the journal cannot tell an observation,
which legitimately cites nothing, from a conclusion, which must cite something.

The check therefore has to live above the journal, in whatever appends, or in
payload schema validation. **A real cost of the coarse-type ruling that was not
visible when it was made.** It does not overturn it — the privacy gain is larger
— but it is recorded as a consequence rather than discovered by someone later
wondering why nothing validates this.

---

## 4. Where the system must stop and ask

The §1 ruling, made concrete. Each is a point where erasure cannot decide
correctly on the owner's behalf, and each is checkable.

| | Situation | What must be shown, **before** erasing |
| --- | --- | --- |
| **D1** | A conclusion rests on the erased event **and others** | That it will survive rebuilding, and why. Then: keep it, erase it too, or keep it marked |
| **D2** | A conclusion rests on the erased event **alone** | That it will disappear — stated, not silent, because the owner may not have known it existed |
| **D3** | The blast radius is large | The full list of what will be torn down, before anything is torn down — **shown, never journaled** (§2b) |
| **D4** | Some of it was already disclosed | What left, when, to whom, and that it **cannot** be recalled |
| **D5** | Peers hold copies | Which peers confirmed the erasure and which have not been seen |
| **D6** | The pattern will re-derive from ongoing collection | That erasing the past does not stop the future — with the option to change the collection policy in the same breath |
| **D7** | E1 leaves the envelope | Exactly what still remains visible: type, timestamp, position |
| **D8** | Witness attestations exist | That they are unaffected at E1 — and, at E2/E3, that they will conflict and how that is resolved |

A system that resolves any of these quietly is not doing erasure. It is doing
something else and calling it erasure.

---

## 5. Three things that cannot be bought

Stated plainly, because a deletion feature that oversells itself is worse than
none at all.

### 5a. An over-determined pattern survives its own evidence

A Belief resting on one event dissolves when that event is erased. A Belief
resting on fifty, minus one, **rebuilds almost unchanged.** The knowledge
survives because it never depended on the part that was removed.

You cannot erase your way out of a pattern. D1 exists because of this.

### 5b. "Never re-derived" is an impossibility, not a gap

To guarantee something is never concluded again, Orb must remember what it is
forbidden to conclude — a suppression list, which is *a permanent record of
exactly the thing the owner asked it to forget*, and would become the most
sensitive object in the system.

A partial dodge: store a **hash** of the erased content rather than the content,
which blocks exact reappearance without keeping the thing. It does nothing for
patterns, because a pattern has no fixed content to hash.

So the guarantee is not available. Orb should say so rather than imply otherwise.

**And it would not be wanted even if it were available.** §2b: a suppression
list and a record of what was erased are the same object under two names, and
either one turns coercion into *compel an erasure, then read what it removed.*
The privacy argument and the adversarial argument reach the same conclusion from
opposite directions, which is the strongest kind of agreement a design decision
can have.

### 5c. Erasing the past does not stop the future

Sensors keep running. Erase every record of going somewhere, keep going there,
and the record honestly rebuilds from new evidence next week.

Which points at the conclusion that matters most in this document:

> **Prevention beats erasure. The strongest control is not recording it.**

That places `Policy` and `Capability` *above* deletion in the architecture. A
rule that says *do not observe this* is strictly more powerful than any amount
of erasing afterwards. Erasure is the fallback for what the owner did not
anticipate — necessary, and the weaker tool. It must not be presented as the
main one.

---

## 6. Erasure is local

The owner can destroy what is on their device. They cannot make another device
forget — offline, lost, unwilling, or simply not yet asked.

What is available: erase locally, declare it, propagate the declaration, and
**record which peers confirmed**. The honest statement is then not *"it is
gone"* but *"gone here; three of four peers confirmed; one has not been seen
since Tuesday."* Same move as everywhere else in this project — state the
boundary instead of promising past it. D5.

**§2a changes how much this limitation hurts.** If a peer only ever held
ciphertext and the key is destroyed, their unconfirmed copy is inert. Locality
then constrains *bookkeeping* — knowing who acknowledged — rather than
*exposure*. The sentence becomes "gone here, undecodable everywhere, and one
peer has not yet acknowledged," which is a far smaller admission. This is the
strongest argument for key destruction over byte deletion, and it is why §2a is
a requirement of the ruling rather than an optimisation of it.

---

## 7. Absence carries a reason — **built, 2026-09-25**

`DetachedEvent` used to be exactly one thing: `payload?: undefined`. Pruned and
erased were indistinguishable, and they mean opposite things to a peer, so a
peer holding the payload would have helpfully restored what its owner destroyed
**and would have been behaving correctly**.

`AbsenceReason` now has **three** values, not the two this section originally
called for. The type checker found the third:

| | Meaning | May it be fetched? |
| --- | --- | --- |
| `unfetched` | The envelope replicated here; this device's policy never wanted the payload | Yes |
| `pruned` | Held once, then dropped for space, with journaled proof K others hold it | Yes |
| `erased` | Destroyed by the owner | **Never, on any device, forever** |

Making `absence` required turned every construction site into a compile error,
and one of them had no honest answer: an envelope arriving by replication was
never pruned — it was never held. `unfetched` and `pruned` are also not
interchangeable, because they are different answers to *"why does my phone not
know this?"*, which is the question inv. 6 exists to make answerable.

**Where the rule lives.** `Journal.replicate` marks arriving envelopes
`unfetched` rather than each call site doing it, so the journal keeps ownership
of the invariant that absence always explains itself and a store can never be
handed one that does not.

**Reasons move only toward `erased`, never back.** An already-absent payload can
still be raised to `erased` — a device that never held a payload receives the
owner's declaration like any other event and must obey it from that moment,
rather than keeping the right to ask forever because it had not got round to
asking. `unfetched` is never relabelled `pruned`: that would claim this device
once held something it never did, and a horizon explained by a false history is
worse than one left unexplained.

That transition was **found by a failing test, not by review** — the sync test
asserted an erased envelope is never named to a peer, and it was, because
`detach` acted only on payloads that were present.

**The protections, each with a negative control** (`tests/erasure.test.ts`, 12
cases):

- `attach` restores a pruned payload and refuses an erased one **in the same
  call** — so the refusal is specific, not a store that refuses everything.
- Sync never names an erased envelope to a peer, and still asks for the one it
  should. Checked in `pullFrom` as well as in the store because **asking is
  itself a disclosure**: a request tells the peer which envelope this device
  wanted back, even when the answer is no.
- The reason survives a round trip through the file store, read back by a second
  store over the same directory.

### The declaration (`src/erasure.ts`)

The durable, replicating half; `AbsenceReason` is its local projection and
cannot replicate on its own (Art. I §3).

It is **bookkeeping**, so a peer reads it without decrypting and a witness can
read it holding no payloads at all. Being legible, it says almost nothing: a
lane and an envelope hash. The hash rather than the event id, because the hash
is what the chain commits to — a reader can check the reference without trusting
whoever sent it. A test asserts the payload has exactly two keys, so an added
field fails CI rather than review (§2b: a record of *what* was erased is an
oracle).

A declaration whose own payload is not held is **skipped, never guessed**: it is
still a declaration, it can no longer say what it referred to, and acting on a
guess would erase the wrong thing.

---

## 8. What erasure actually outputs

Not *"it's gone."* Four statements:

1. **What was removed.**
2. **What was rebuilt without it.**
3. **What survived rebuilding, and why** — because the pattern did not need it
   (§5a).
4. **What had already left the device**, when, and to whom (§5c, D4).

The fourth line only exists because disclosures are themselves recorded as
history under Art. VIII §32. This is the first place that requirement pays for
itself.

So the full promise is larger than the ruling as first stated:

> **I can erase; Orb records it; Orb tears down what was built on it; and Orb
> tells me honestly what it could not take back.**

Stronger than most systems offer. Smaller than "it's gone." True.

---

## 9. Open — for the operator, in their own words

1. ~~**The Art. I §2 reading (§2).**~~ **Ruled 2026-09-25: E1 accepted.** See §2.
2. ~~**How far up the ladder (§2).**~~ **Ruled 2026-09-25: E1 only. E2 and E3
   are forbidden, permanently.** The shape of history is not erasable by anyone,
   including its owner. See §2.
3. ~~**Does the envelope have to be this legible?**~~ **Ruled 2026-09-25:
   coarse type in the envelope, real type inside the payload.** See §2b.
4. ~~**What is the coarse vocabulary?**~~ **Ruled 2026-09-25: bookkeeping keeps
   its real names; everything else gets one label.** See §2b.

---

## 10. Sequencing

Not now. The pass-1 run is in progress and `DEVICE_LOOP.md` §7 R4 stands.

After it, and after AD-6:

1. ~~**A reason on absence** (§7).~~ **Done 2026-09-25**, with the erasure
   declaration alongside it. 453 tests pass, lint clean.
1a. **Payload key granularity** (§2a). Encryption at rest is already mandatory;
   what is missing is a key small enough to destroy per event or per epoch.
   Without it the ruling's *destroyed* is only *deleted*, and D4's account of
   what cannot be recalled would be wrong in the owner's favour — the worst
   direction for it to be wrong in.
1b. **The coarse vocabulary, then the envelope change** (§2b). The vocabulary
   is a decision (§9.4); the envelope edit that follows touches `Event.md`,
   `EVENT_MODEL.md`, the TypeScript envelope and the phone's encoder together,
   and moves `schema` with `type` or achieves nothing. It is also the **last
   cheap moment**: every event already written carries a fine type, and changing
   the rule later leaves a permanent, legible prefix of history that no erasure
   may remove — because §2 forbids removing it.
2. **Lineage completeness** (§3) — while `Belief.md`, `Fact.md` and
   `InferenceRecord.md` are still Draft and cheap to change.
3. **Erasure as a Capability.** It is the canonical irreversible Action: wholly
   local, needing no external service, and impossible to undo. That makes it the
   natural first test of `CLAIMS.md` C1's consent gate — the six routes an agent
   might use to avoid asking are all testable against an operation that never
   leaves the device.
4. **The two-phase preview** (§1, §4) — the part the owner actually touches.
