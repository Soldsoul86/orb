# Erasure — the right to delete, and the duty to say so

**Status: two rulings ACCEPTED, 2026-09-25 — the Art. I §2 reading, and the
permanent prohibition on E2/E3 (both §2). The rest is a PROPOSAL.** Nothing here
is implemented; §9 carries what is still open.

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

**The consequence worth noticing first.** If you can delete openly, the only
reason to delete secretly is to deceive someone. Silent truncation therefore
becomes, by definition, an attack — never an exercise of a right. Orb stops
having to work against its owner, which is the fork `CLAIMS.md` could not
resolve and this ruling closes.

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

---

## 4. Where the system must stop and ask

The §1 ruling, made concrete. Each is a point where erasure cannot decide
correctly on the owner's behalf, and each is checkable.

| | Situation | What must be shown, **before** erasing |
| --- | --- | --- |
| **D1** | A conclusion rests on the erased event **and others** | That it will survive rebuilding, and why. Then: keep it, erase it too, or keep it marked |
| **D2** | A conclusion rests on the erased event **alone** | That it will disappear — stated, not silent, because the owner may not have known it existed |
| **D3** | The blast radius is large | The full list of what will be torn down, before anything is torn down |
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

## 7. A gap in code that blocks all of this

`DetachedEvent` (`runtime/journal/src/types.ts:77`) is defined as exactly one
thing: `payload?: undefined`. Absence carries no reason.

So **pruned and erased are indistinguishable today** — and they mean opposite
things to a peer:

| | Meaning | What a peer should do |
| --- | --- | --- |
| Pruned for space | "I dropped this; K others hold it" | Send it back on request |
| Erased by the owner | "This is destroyed" | Never send it again; destroy yours |

As built, a peer holding the payload would helpfully restore the thing the owner
deliberately destroyed, **and it would be behaving correctly**. Erasure cannot
exist until absence carries a reason. Small to fix, and first.

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
3. **Does the envelope have to be this legible?** *Open, and the only lever left
   on the accepted cost.* Today an envelope names a precise type and a precise
   wall clock, so an erased `health.appointment` at 15:04:07 still says a great
   deal. A **coarse public type with the true type inside the encrypted payload**
   — the envelope saying only `orb.observation` — would leak far less while
   leaving the sequence, the hashes and the count exactly as the E2/E3 ruling
   requires. It is not E2: nothing is erased, the envelope is simply less
   revealing from the start.
   The cost is real and belongs in the decision: `holdTypes()`
   (`runtime/journal/src/sync.ts:98`) lets a peer choose what to hold *by type*,
   and coarse types would blunt it; routing, indexing and schema resolution all
   read the type today. The wall clock is harder still — it is inside the hash
   preimage and the HLC depends on it, so coarsening it is not a free change.
   **Not decided here.** It is a privacy-versus-function trade with no obviously
   right answer, and §1 says the operator is told rather than defaulted.

---

## 10. Sequencing

Not now. The pass-1 run is in progress and `DEVICE_LOOP.md` §7 R4 stands.

After it, and after AD-6:

1. **A reason on absence** (§7). Nothing else can start until pruned and erased
   are different things in the type system.
1a. **Payload key granularity** (§2a). Encryption at rest is already mandatory;
   what is missing is a key small enough to destroy per event or per epoch.
   Without it the ruling's *destroyed* is only *deleted*, and D4's account of
   what cannot be recalled would be wrong in the owner's favour — the worst
   direction for it to be wrong in.
2. **Lineage completeness** (§3) — while `Belief.md`, `Fact.md` and
   `InferenceRecord.md` are still Draft and cheap to change.
3. **Erasure as a Capability.** It is the canonical irreversible Action: wholly
   local, needing no external service, and impossible to undo. That makes it the
   natural first test of `CLAIMS.md` C1's consent gate — the six routes an agent
   might use to avoid asking are all testable against an operation that never
   leaves the device.
4. **The two-phase preview** (§1, §4) — the part the owner actually touches.
