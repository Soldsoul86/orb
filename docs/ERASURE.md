# Erasure — the right to delete, and the duty to say so

**Status: four rulings ACCEPTED, 2026-09-25 — the Art. I §2 reading and the
permanent prohibition on E2/E3 (§2), the coarse envelope type, and the coarse
vocabulary (both §2b). The rest is a PROPOSAL.** §9 carries what is still open.

**A fifth ruling, 2026-09-25 — Attachments are erasable (§2c).** Erasure
destroys a payload key and an Attachment is not payload, so a photograph
outlived the erasure of the entry that carried it: the ruling delivered for
`{"beat": 47}` and not for the content it was made for. Ruled: *a per-photo key
that dies with the last reference.* Now `Attachment.md` inv. 8, with **D9** in
the preview reporting `unavailable` until Attachments exist.

**A sixth, same day — question 5 (§2a).** Ruled: *keep the identity, blind the
address.* Inv. 2's deduplication was the confirmation oracle in a permanent
kernel contract. The defect was never that identity is the content hash — it is
that the **address** was the same value, so the store was a list of the
identities it holds. Now `Attachment.md` inv. 7. Two residuals stay open and are
named rather than glossed: the wire, and blob sizes.

**§2a and §2b are now IMPLEMENTED** in `runtime/journal` as envelope v2: the
coarse type and schema, stated lineage moved into the payload, per-event nonces,
and per-event keys. `tests/coarse-envelope.test.ts` pins what the migration
bought, and each of its claims has a recorded negative control. Two costs the
ruling predicted arrived exactly as written — `holdTypes` holding nothing (see
*What this breaks*, below) and an erased event becoming uninterpretable even to
its owner. One was **not** predicted and is recorded in §2a: `payloadHash` is no
longer a content address, so payloads cannot be deduplicated by hash across
devices.

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

### Built, 2026-09-25 — `keyring.ts` and `sealed-store.ts`

`PayloadKeyring` is a port, injected as `JournalStore` is, with an AES-256-GCM
implementation for tests — real encryption rather than a stub, so what the tests
demonstrate is the property itself and not that a flag changed.

**Keys are stored, never derived.** Deriving a per-event key from a root would be
far cheaper and would make erasure impossible: anything derivable is
re-derivable, so destroying a derived key destroys nothing. The cost is roughly
32 bytes per event and a keyring that is now the most sensitive object on the
device.

**Sealing is a decorator, not an edit to each store.** `sealedStore(inner,
keyring)` gives every store the rule at once, including ones written later, and
`SECURITY.md` §3's *"the store holds ciphertext"* becomes true without any store
implementing cryptography.

**Only the payload is sealed, and `payloadHash` commits to the plaintext.** Two
things depend on that: verification behaves identically before and after
sealing, and a payload recovered from any source is still checkable against its
envelope.

> **Superseded in part, 2026-09-25.** This section originally claimed a third
> consequence — *two devices sealing the same payload under different keys still
> agree on its hash*. The nonce ends that, deliberately. See **The cost that was
> not predicted** below. Sealing still does not affect the hash; the nonce does.

**The keyring is the ground truth for erasure.** A read whose key has gone
returns the envelope marked `erased`, whatever the stored marker says — so a
keyring restored without its journal, or a partial failure, still reports the
erasure rather than the content.

**A destroyed payload cannot be re-sealed back into existence.** A peer
helpfully returning the bytes would otherwise mint a fresh key for content its
owner destroyed, undoing an erasure with nobody deciding to. Refused before a
key is minted, and refused again by the store beneath.

**The negative control:** a *pruned* payload keeps its key and comes back. A
keyring that destroyed keys on every detach would pass every other test here
while making pruning silently irreversible.

### The finding: sealing breaks verification, and the wrong answer is alarming

`verifyLane` hashed the payload and compared it to `payloadHash`. Against a
sealed blob that compares two unrelated values, so it reported **corruption
where nothing was corrupt** — and the device most affected is the one holding
envelopes and sealed blobs and no keys at all: a witness, told its history had
been tampered with every time it looked.

`verifiablePayload` now separates *cannot check* from *failed the check*. Third
time today the same distinction has decided a design — alongside `closed` rather
than *complete* in lineage, and *unavailable* rather than *none* in the erasure
plan. A verifier that collapses them lies in the more alarming direction.

It opens no new hole: substituting a sealed blob for a real payload destroys
content without declaring it, which is `CLAIMS.md` C2d, already named as
undetectable and not made worse here.

### The confirmation oracle — shipped 2026-09-25

`payloadHash` commits to the plaintext, which is what makes everything above
work. It also means **a hash over guessable plaintext is a confirmation
oracle**: an adversary holding envelopes can hash candidate payloads — `{"beat":
1}`, `{"beat": 2}` — until one matches, and learn the content of a structurally
predictable event without any key.

Sealing does not touch this, because the hash is in the envelope and the
envelope is deliberately plaintext.

**A nonce inside the payload is not one option among several — it is the only
shape the constraints allow.** Anyone holding a payload must be able to verify it
against the envelope, and anyone holding only envelopes must not be able to
guess it. So the entropy has to be available to whoever has the payload and
unavailable to whoever has only the envelope, and exactly one place satisfies
both. The alternatives each fail on one side:

| | Why not |
| --- | --- |
| Salt in the envelope | The adversary has the envelope, so they have the salt |
| Hash the event id in | Same — high entropy, but *public* entropy |
| HMAC with a device secret | Kills cross-device verification; `PARTIAL_REPLICATION.md` §3 goes with it |
| Commit to the ciphertext | Two devices sealing the same payload get different hashes; the envelope stops being reproducible and a peer's payload can never be checked |

**And it should not be a field anyone sees.** Not `_nonce` beside the data, where
every consumer, schema and disclosed slice must know to ignore it — wrapped at
the storage layer, as `{n, v}`, unwrapped on read. The same decorator shape as
sealing, for the same reason: it is a storage concern, not a data concern.
Replay sees what it always saw, schemas describe what they always described, the
nonce travels with the payload so verification still works anywhere, and it dies
with the payload on erasure.

**Applied uniformly**, not only to low-entropy payloads: selective application
would make the *absence* of a nonce a signal that the payload was high-entropy,
and would be forgotten the first time someone added an event type.

**Held, 2026-09-25 — ships with the envelope migration (§10.1b).** It changes
what the hash preimage covers, exactly as `type`, `schema` and `causes` moving
into the payload do. Four changes to the same preimage is one break in the
cross-implementation vectors if they travel together, and four if they do not.

#### Built, and the predicted shape was wrong twice

Shipped as `payload.ts`. The reasoning above holds; two of its mechanics did not.

- **Not `{n, v}` — `{causes, data, nonce, schema, type}`.** Once §2b moved the
  real type, schema and causes into the payload, the nonce had a wrapper to live
  in already. One wrapper, not two.
- **Not a store decorator.** The section above reasoned "the same decorator shape
  as sealing, for the same reason". That is wrong, and the difference is the
  whole point: sealing may happen *below* the hash because `payloadHash` commits
  to plaintext, but a nonce the hash does not cover defeats nothing — **the
  oracle it closes works on the hash.** Wrapping therefore happens in `Journal`,
  before `hashPayload`. Sealing is a storage concern; nonces are not.

The second correction is the load-bearing one: a nonce applied where sealing is
applied would have looked right, tested green against every sealing test, and
closed nothing at all.

#### The cost that was not predicted

`payloadHash` is no longer a content address. Identical payloads now produce
different hashes, so **payloads cannot be deduplicated by hash**, on one device
or across devices.

**This is not a tradeoff that went badly. It is an identity.** Deduplication by
hash requires *same content produces the same hash, checkable by whoever holds
the hash*. The confirmation oracle is *guess the content, hash it, compare*.
They are the same capability described from two sides. Any scheme that restores
deduplication restores the oracle to exactly whoever can deduplicate. There is
no version of this where both are had.

What it costs in practice is close to nothing, and the reasons are worth
recording so this is not re-litigated:

- **Nothing was deduplicating.** `payloadHash` appears nowhere in `store.ts`,
  `file-store.ts` or `sync.ts`. It is a commitment, checked on `attach`. A
  possible future optimisation was foreclosed; no working behaviour was removed.
- **The heavy bytes keep it.** `contracts/Attachment.md` inv. 2 makes
  Attachments content-addressed with deduplication as a stated property, and
  `MOBILE_SENSING.md` §258 requires raw audio, images and log blobs to be
  Attachments, never inlined. An Attachment's hash is over its own bytes; the
  payload carries a reference. The same photograph twice is still stored once.
  What loses deduplication is the small JSON record of meaning.
- **Cross-device deduplication was never available.** Each device writes its own
  lane, so two devices observing the same thing produce two events with
  different ids, HLCs and devices. They were never going to collapse.
- **Corroboration does not use it.** `EVIDENCE_GRAPH.md` §5's `corroborates`
  edges are semantic — do the times and places agree — and §3 states edges are
  derived from event payloads and `causes`. Hash equality was never the
  mechanism, so no evidence property was lost.

**The known escape, and why it is foreclosed here.** Convergent encryption
(borg, restic, Tahoe-LAFS) derives the nonce as `HMAC(secret, payload)` rather
than randomly: key-holders deduplicate, outsiders cannot run the oracle. It
would work, and it is the right answer in a backup system. It is the wrong
answer here, for the reason §2b exists: `payloadHash` sits in the **plaintext
envelope**, which is exactly what a witness holds. Convergent nonces would let a
witness see two identical hashes and learn *these two events have identical
content* without knowing what it is — repetition and rhythm, legible to someone
holding no keys. That is the volume-and-rhythm leak, sold back to buy a
deduplication this design does not need. The door is not bolted; opening it
costs more than it returns.

**The constraint this leaves on every future feature.** A question of the form
*"have I recorded this exact thing before?"* can only be answered over decrypted
payloads, locally, on a device holding the keys. It can never be answered by
comparing hashes — not by a witness, not by a peer, not by the sync layer. That
is a design constraint to build around, not a defect to fix.

#### The same oracle in Attachments — question 5, ruled 2026-09-25

Writing the above surfaced it. The identity runs both ways: *deduplication by
hash is the confirmation oracle*. `contracts/Attachment.md` inv. 2 states
**"Identical content yields one identity; deduplication is inherent"** — which
is the oracle, named as a feature, in a **permanent kernel contract**.

**Corrected, same day: this was first called weak because the bytes are
high-entropy.** That is the wrong frame, and it is worth saying why, because the
wrong frame is the one that makes this look ignorable. *The adversary does not
guess.* They hold the file and test it. Matching a known file against a hash
list is not a theoretical attack — it is a deployed industry: known-file
detection, copyright matching and CSAM scanning all work exactly this way, and a
content-addressed store is the ideal substrate for it.

There is a sharper version of the same point. Ask which files actually
deduplicate:

| | deduplication benefit | oracle exposure |
| --- | --- | --- |
| A photograph only you hold | none — there is one copy | none — nobody has it to test |
| A file that circulates | real — many copies | high — anyone holding it can test |

**The files that deduplicate are exactly the files that are testable.** The
identity again, now at the level of content rather than cryptography:
deduplication does not merely coexist with the oracle, it pays off precisely
where the oracle bites.

**Corrected also: the exposure is narrower than first written.** This first said
the reference is on every device that replicated the envelope. It is not. A
reference *"enters history as an Event"* (`Attachment.md` §1) — so it is payload,
which §2b sealed. A witness holding envelopes never sees an Attachment hash. The
exposure needs someone who can read the **Attachment store itself**: the device,
a backup, or a peer that syncs attachments. Still real, because a
content-addressed store is a list of content hashes by construction, and
encrypting the bytes does not hide the addresses.

##### The payload answer does not transfer — in the opposite direction

The first draft of this section said keyed hashing was foreclosed here. That was
§2a's reasoning about *payloads*, applied where it does not hold.

A payload's hash must be checkable by a party with **no key** — that is how a
witness verifies a chain, and it is why the table above rules out *HMAC with a
device secret*: it kills cross-device verification.

No such party exists for Attachments. Resolution *"resolves the hash through
Storage **and decrypts it**"* (§1 step 3); §8's cross-device example has the Mac
fetch, *verify, and decrypt locally*. Both hold the key. `WITNESSES.md` never
mentions Attachments at all, because a witness cannot decrypt one and so never
resolves one. **Nobody keyless ever verifies an Attachment hash**, so the
constraint that forced random nonces on payloads is simply absent, and the
answer is free to differ.

##### The defect is not inv. 2 — it is that identity and address are the same thing

*Identical content yields one identity* is correct and necessary: identity must
be the content hash or neither deduplication nor verification works.

The oracle comes from the **store being addressed by that identity**, so the list
of addresses is the list of identities. The bytes are not what leaks. *Which*
bytes is what leaks, and the addresses say it. Git has exactly this property in
`.git/objects`; Git makes no privacy claim, and Orb does.

##### Ruled: keep the identity, blind the address

| | identity | address | inv. 2 / inv. 5 | deduplication |
| --- | --- | --- | --- | --- |
| A. nonce per Attachment — the payload fix | random | random | **broken** | **lost** |
| B. keyed identity, `HMAC(secret, content)` | secret-dependent | = identity | **changed** | within the trust domain |
| **C. keep identity, blind the address** | `SHA-256(content)` | `HMAC(secret, identity)` | **untouched** | **intact** |

**C, ruled by the operator 2026-09-25.** It costs almost nothing:

- Identity stays the plain content hash, so inv. 2 and inv. 5 are untouched,
  deduplication works, verification works, history is unchanged, and the
  cross-implementation vectors never see it.
- The address is **derived**, so there is no table to persist — nothing new to
  keep durable and nothing that breaks replay from events.
- The secret is **freely rotatable**, because nothing depends on it but local
  store layout. Rotating re-addresses the store and voids every fingerprint an
  adversary already collected. B cannot do that: rotating there re-identifies
  everything.
- Deriving is permitted here, and §2a's *keys are stored, never derived* is not
  violated — that rule governs **erasure** keys, and a derived key is worthless
  because it is re-derivable. This secret never needs destroying. The content
  key, which `Attachment.md` inv. 8 destroys, does that job.

##### What survives C, named rather than glossed

C removes the cheap, scalable, at-rest oracle. It does not remove the oracle.

- **The wire.** §8's fetch names the content hash. A key-holding peer could read
  the content anyway, so that is no loss — but a **durability peer holding
  encrypted blobs without keys** would see hashes cross the wire. Real, and
  unsolved. Independent of C, which is why C did not wait for it.
- **Size and count.** The store still reveals blob sizes. Exact-size matching
  against a known file is a weak oracle that survives every option here,
  including A.
- **Retroactive compromise.** Leaking the address secret reveals *which* files
  are held, historically — not their contents, which need the content keys. A
  rotation closes it going forward.

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

**Implemented 2026-09-25, and it landed harder than written.** The loss is not
only across a trust boundary: a device selecting payloads is reading envelopes
*before* it has the payload, so it sees coarse types locally too.
`holdTypes(["note"])` now holds nothing at all. `holdContent()` was added as the
honest replacement — every content payload, no bookkeeping, which is the finest
split a v2 envelope still supports. A test pins the loss so it cannot be
rediscovered as a bug.

**This changes a kernel contract.** `Event.md` and `EVENT_MODEL.md` define the
envelope, and the type field's meaning changes for every Event in the system.
That edit is not made here; it is named so it is not discovered later.

---

## 2c. Erasure does not reach Attachments

**Found 2026-09-25, while correcting §2a. Not ruled — this is question 6.**

The ruling was *"all these proofs are mine, I should be able to erase it."* For
anything carrying a photograph, a recording or a voice note, the implementation
does not deliver it, and the contract as written says it never will.

### The gap

Erasure destroys the **payload key** (§2a). An Attachment is not payload. It is a
separate blob, in a separate store, under separate encryption
(`Attachment.md` inv. 4), referenced from the payload by content hash.

So erasing an event destroys the record's own account of itself and leaves the
attached bytes untouched. `Attachment.md` §1 is explicit about how long they
stay:

> *The Attachment persists, encrypted, for as long as anything references it
> (and, by default, for the life of the journal — continuity is the product).*

The diary entry becomes unreadable; the photograph stapled to it stays in the
drawer, for the life of the journal, by default and by contract.

**This is where the sensitive material actually is.** Nobody is coerced over
`{"beat": 47}`. The ruling is delivered for exactly the content nobody needed it
for, and not delivered for the content it was made for.

`Attachment.md` carries six invariants and none of them mentions erasure,
deletion or destruction. This is not a conflict between two rules — it is a rule
that was never written.

### A second gap, already solved once

Inv. 6 says an Attachment *"may be momentarily unavailable on a device without
invalidating the history that references it."* Unavailable, with no reason
recorded, and "momentarily" doing work it cannot do.

That is precisely the defect fixed for events in §7 — `AbsenceReason`, where
*never fetched*, *dropped for space* and *destroyed by the owner* are three
different answers and a peer that confuses them restores content its owner
destroyed. Attachments need the same distinction, for the same reason, and a
helpful peer re-offering an erased photograph is the exact failure it prevents.

### Three shapes, and what each costs

| | What erasure destroys | Deduplication (inv. 2) | Delivers the ruling |
| --- | --- | --- | --- |
| **A. Share the event's payload key** | Key dies, blob is inert | **Lost** — one photo under two keys is two blobs | Yes |
| **B. Per-attachment key, destroyed with the last reference** | Key dies when nothing points at it | **Kept** — one blob, one key, many references | Yes, with a caveat |
| **C. Attachments are not erasable** | Only the reference | Kept | **No** |

**A** is the simplest and it is wrong here. Deduplication is load-bearing for
heavy bytes — `PARTIAL_REPLICATION.md` §228 leans on it to make high-rate signal
affordable at all — and A trades the thing that makes attachments viable for a
property B also delivers.

**C** is honest and contradicts the ruling. Named so it is not arrived at by
default, which is what happens today.

**B. Ruled 2026-09-25 by the operator: *"per-photo key that dies with the last
reference."*** It is the same mechanism §2a already chose — destroy a key, not
bytes — applied one layer down, and it keeps the deduplication that makes heavy
bytes affordable at all.

### What "the last reference" has to mean

Writing the ruling down forces a question the shape does not answer, and the
naive reading of it does not survive contact with erasure itself.

References live in payloads. Erasure destroys payloads. **So after erasing
anything, you can no longer recount what it referenced** — and a rule of the form
*count the references, destroy the key at zero* would break the first time it was
used. Recording what an erased event referenced is not available either: that is
the erasure oracle, forbidden by §2b.

The resolution is that the count was the wrong question. Ask instead:

> **Can any event that is still readable resolve this Attachment?**

Three kinds of event, three answers, and only one of them is a count:

| The referring event is… | Can it resolve the Attachment? | Effect on the key |
| --- | --- | --- |
| **Readable here** | Yes | **Keeps it alive** |
| **Erased** | Never again — its payload is destroyed, so the reference is destroyed with it | **Does not keep it alive** |
| **Unfetched or pruned** | Unknown; the payload may come back | **Blocks destruction, and is reported** |

An erased event cannot resolve anything. Its reference is not merely unreadable,
it is *gone* — which means erasure decrements the count by the same act that
hides it, and nothing needs to remember what was decremented. The rule composes
with itself.

The third row is the same shape that has now decided five designs here: *cannot
check* is not *failed the check*. A pruned payload that might name this
Attachment is **unknown**, not absent, and a device that treated unknown as
absent would destroy a photograph its own history still points at.

### What the owner must be shown, and why it is a ninth D-point

Under B, erasing one entry does **not** destroy an Attachment another readable
entry still references. That is correct and it is not what "erase this" sounds
like.

> **You can only erase content that nothing else of yours still points at.**

And §6 cuts the other way too, harder than for payloads. Destroying a key is
global in effect: it reaches every copy, including the copy on a device whose
readable entry still legitimately displays that photograph. So the preview owes
the owner two facts, not one — *N readable entries here still reference this*,
and *other devices may hold entries this one cannot see*.

Silence on either is a declared erasure that did not happen, or an undeclared
one that did. **D9** carries both.

Everything B needs is a projection over history — no stored count, no second
source of truth (Art. IX §33) — precisely because the erased row above needs no
bookkeeping.

### The caveat B carries, restated for the preview

Under B, erasing one event does **not** destroy an attachment another event still
references. That is correct behaviour and it is not what "erase this" sounds
like.

> **You can only erase content that nothing else of yours still points at.**

Implemented as **D9** in `erasure-plan.ts`, reported `unavailable` on every plan
until Attachments exist — the same posture as D4, D5 and D6. A preview that
omitted the question entirely would let an owner erase an entry believing the
photograph went with it. Reported-and-unanswerable is the honest state; silent is
not.

### What this requires of the Attachment contract

`Attachment.md` is a **permanent kernel contract** and says so deliberately, to
stop content-addressing being revised as an implementation detail. That is the
right call and it is exactly why this cannot wait: nothing implements Attachments
today — the name appears in `runtime/journal` only as precedent in comments — so
there is no store, no resolver and no key scheme to migrate. The cost of
answering now is a paragraph. The cost of answering later is amending a contract
whose whole purpose is not being amendable.

Whichever shape is chosen needs, at minimum: a seventh invariant naming erasure,
an absence reason on inv. 6, and §2a's rule that **keys are stored, never
derived** restated for attachment keys — a derived key is re-derivable, and
destroying it destroys nothing.

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

### Closed as far as it can be, 2026-09-26

Two halves, neither of which alone is enough.

**The contracts now say where lineage lives.** `Belief.md`, `Fact.md` and
`InferenceRecord.md` each said a derivation *references* what it rests on, and
none said **where**. A Belief carrying `{factIds: [...]}` in its payload with
`causes: []` satisfied every invariant they had and was invisible to every walk —
exactly the derivation this section says makes erasure a lie. Each now carries
*"lineage is `causes`, not only prose"*, frozen at v1 so a later version cannot
quietly relax it, and `EVIDENCE_GRAPH.md` inv. 2's *"payload/causality"* is
sharpened the same way.

**The preview now refuses to pretend.** `planErasure` takes a `derived`
predicate from a layer that can read payloads, and reports `ungrounded`:
derivations that cite nothing. This matters because a forward walk **closes**
over such a history — there is nothing to walk to — and returns a radius that is
short and looks complete. Short is the dangerous direction. Given no predicate at
all, D3 now says *the check did not run* rather than returning a clean-looking
answer.

**What is still not prevented.** Nothing stops the append. The contracts state
the obligation, and the preview detects a breach after the fact; neither is
enforcement, and §0a's distinction applies — this is followed, not enforced,
until payload schema validation exists. `ungrounded` is deliberately kept apart
from `unresolved` for the same reason the two must not be confused: a dangling
cause is a partial replica and syncing repairs it, while a derivation that
recorded nothing will sit on erased content forever.

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

### Built, 2026-09-25 — `runtime/journal/src/erasure-plan.ts`

`planErasure` computes the eight points as findings; `decisionsRequired` names
which the owner must answer. A pure function over events — it has no journal, so
a caller cannot journal the preview by accident (§2b).

**The property that carries the most weight is not the blast radius.** It is
that every finding says whether it was *computed* or is *unavailable*, and an
unavailable one never degrades into a reassuring one. *"No disclosures found"*
where no disclosure record type exists is not caution; it is a false statement
the owner would act on. Three gaps are reported unconditionally:

| | Why it cannot be computed |
| --- | --- |
| **D4** | No disclosure record type exists. Nothing was found because nothing *can* be found — not because nothing left. Art. VIII §32 requires disclosures to be history; until they are, what already left is beyond recall **and beyond report** |
| **D5** | Holders are listed from custody receipts, but no erasure-confirmation protocol exists, so every holder is unconfirmed |
| **D6** | Needs a collection policy layer that does not exist (§5c) |

**What is computed.** D2 separates from D1 by a fixpoint: a conclusion loses its
whole basis when every cause it names is either a target or is itself losing its
whole basis. Everything else in the fallout **survives rebuilding** — §5a, an
over-determined pattern survives its own evidence — and each one is a decision,
not a deletion. D7's residue is read off the event rather than hard-coded, so it
shrinks by itself when `type`, `schema` and `causes` move into the payload (§2b)
instead of needing this document edited. D8 is `false` by the ruling: E1 changes
no hash, height or count, so an attestation taken before still reconciles after.

### The finding a failing test produced

D3 was first raised only when the traversal reported itself unclosed. That is
**not sufficient, and the test that was written to confirm it exposed why.**

A forward walk reports `closed` when it runs out of dependents it holds — and it
can close **perfectly over a fragment**, because a cause that is named but not
held is never stepped through: the walk goes the other way. So a partial replica
would have presented a confident, short blast radius with no warning, which is
the exact failure `lineage.ts` was built to prevent, arriving by the one route
its own flag does not cover.

The evidence of fragmentary history is a **dangling cause anywhere in the
index**, and D3 is now raised on that as well. The test asserts both halves: the
walk genuinely closed, *and* the plan still refuses to call the radius
trustworthy.

---

## 4a. The authorization binds to the plan, not to the targets

**Built 2026-09-26.** `planDigest`, `grantFor`, `grantCovers`.

`CLAIMS.md` C1 route **A4** — *get approval for a dry run, then change an
argument* — and the answer it already names: **the grant must bind to the
argument hash.** For erasure the argument is not a target list. It is the whole
picture §4 shows the owner: what is torn down, what loses its sole support, who
must be told, what the residue still says, and which decision points could not
be computed at all. Approving that is approving a picture, and **a grant that
survives the picture changing is not consent to what actually happens.**

The case this catches arrives from the world rather than from an adversary. A
derivation is appended between the preview and the act, citing a target. Nothing
was tampered with; the blast radius is simply larger than the one the owner saw,
so their approval was consent to a smaller act than the one about to occur. The
grant is void and the owner is asked again.

### What the digest covers, and what it deliberately does not

Covered: targets, the blast radius and its three honesty flags, sole and partial
support, residue, holders, whether witnesses are affected, and **which** decision
points could not be computed.

Not covered, each for a reason:

- **`scope`** — how many events the plan was read over. Including it would void a
  grant on every unrelated append, and on a phone writing a heartbeat a minute
  that is every sixty seconds. It protects nothing `fallout` does not: a new
  derivation citing a target moves the radius, and that *is* covered.
- **The prose of `unavailable`** — the owner answered a set of questions, not a
  set of sentences. Editing an explanation must not invalidate a live grant.

Both are asserted, because a digest that covered everything would be unusable
and one that covered too little would be theatre.

**The coverage is tested field by field, and that was not the first attempt.**
The obvious tests — append a derivation, watch the grant break — passed with the
radius removed from the digest entirely, because appending changes several
covered fields at once and any one shifts the hash. They passed for a reason
other than the one they named. Two negative controls found it. The tests now
mutate one field at a time, and four controls bite where two did not.

### What it does not decide, and why not

**Staleness.** Whether an authorization is valid only at the moment of issue or
persists for a declared window is `CLAIMS.md` §5 Ruling 1, and it is the
operator's. So `grantCovers` checks the binding, returns the grant's `ageMs`,
and lets the caller apply whatever the ruling says — rather than baking in an
answer and making a reserved ruling look already made.

### The narrow ruling that would unblock the rest

Ruling 1 does not have to be settled in general for erasure to proceed.

`Policy.md` §1 argues for standing authorization from one case: *"a person who
has fallen cannot confirm a prompt"* — ask, then act on silence. That argument
has a shape. The action is **urgent** and the human is **unable to answer in
time**.

Erasure has neither property. There is no erasure that cannot wait for a prompt,
and nobody needs their journal destroyed while unconscious. So erasure is the
case where standing authorization has **no motivating example at all**, and the
principle that follows is narrower than Ruling 1 and settles this one:

> **A standing authorization is available only where waiting for consent would
> defeat the action's purpose.** Erasure's purpose is never defeated by waiting,
> so erasure is authorized contemporaneously, bound to the plan shown, or not at
> all.

This is consistent with `Policy.md`'s own floor, which already voids any policy
that would *"make an irreversible action ambient"* or *"make an authorization
blanket"*. **Proposed, not ruled** — the general question of timing stays open,
and this only claims that erasure does not depend on how it lands.

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
6. ~~**Erasure does not reach Attachments — what should it do?**~~ **Ruled
   2026-09-25: a per-photo key that dies with the last reference.** Now
   `Attachment.md` inv. 8; mechanism and the D9 caveat in §2c. Raised
   2026-09-25. Erasure destroys the payload key; an Attachment is a separate
   blob under separate encryption, so a photograph outlives the erasure of the
   entry that carried it — by contract, *"for the life of the journal"*.
   `Attachment.md` has six invariants and none mentions erasure. **This is the
   ruling failing for exactly the content it was made for.** Three shapes are
   set out in §2c with the recommendation (per-attachment key, destroyed with
   the last reference) and the caveat the owner must be shown (you can only
   erase what nothing else of yours points at). Needed before the first
   Attachment implementation — a kernel contract is the wrong thing to amend
   later. See §2c.
5. ~~**Does `Attachment`'s content-addressing keep the confirmation oracle the
   payload nonce just closed?**~~ **Ruled 2026-09-25: keep the identity, blind
   the address.** Now `Attachment.md` inv. 7. The defect was never that identity
   is the content hash — it is that the *address* was the same value, making the
   store a list of the identities it holds. Deriving the address as
   `HMAC(addressSecret, identity)` leaves inv. 2 and inv. 5 untouched, persists
   nothing extra, and is rotatable, which voids every address already collected.
   Two framings were considered and rejected on the way: that the oracle is weak
   because the bytes are high-entropy (the adversary does not guess — they hold
   the file and test it, which is how known-file detection works at scale), and
   that the payload fix cannot transfer (it is the payload *constraint* that
   does not transfer — no keyless party ever verifies an Attachment hash, so
   keying was available here all along). **Two residuals remain open:** a
   durability peer holding encrypted blobs without keys still sees content
   hashes on the wire, and blob sizes are visible in any store. Both are
   independent of the ruling. See §2a.

---

## 10. Sequencing

Not now. The pass-1 run is in progress and `DEVICE_LOOP.md` §7 R4 stands.

**Partly overtaken, 2026-09-26.** Items 1, 1a, 1b and the computation half of 4
landed while the run continued, because none of them touched the instrument —
`DEVICE_LOOP.md` §7 R4 forbids changing the phone mid-run, not changing the
runtime. What remains below is what genuinely waits.

After it, and after AD-6:

1. ~~**A reason on absence** (§7).~~ **Done 2026-09-25**, with the erasure
   declaration alongside it. 453 tests pass, lint clean.
1a. ~~**Payload key granularity** (§2a).~~ **Done 2026-09-25**, 10 cases. The
   confirmation oracle is closed for payloads by the nonce, and ruled for
   Attachments by inv. 7. What remains is putting the keyring itself behind
   hardware (device predictions P8 and P11).
1b. ~~**The coarse vocabulary, then the envelope change** (§2b).~~ **Done
   2026-09-25/26.** All four surfaces this named are migrated: `Event.md`,
   `EVENT_MODEL.md`, the TypeScript envelope, and the phone's encoder. The four
   changes moved together as planned — `type` became coarse, `schema`, `causes`
   and the nonce went inside.

   **It cost zero breaks in the vectors, not the one predicted.** Bundling them
   was the right call for a different reason than the one given: because `v` is
   inside the preimage and *absent means 1*, v2 was added **alongside** v1 rather
   than replacing it, which is the mechanism `Event.md` §5 already required for
   any envelope change. v1's vector still pins the hash it always did, and v2 is
   pinned in both its branches from both implementations.

   **The "last cheap moment" argument was half spent and half deliberately
   deferred.** The phone *implements* v2 and still *writes* v1, by choice: pass 1
   is a measuring instrument whose journal is evidence about the phone, and a
   heartbeat's fine type discloses that a heartbeat happened. Migrating mid-run
   would put a version seam through a measurement for no gain in what it
   measures. `DEFAULT_ENVELOPE_VERSION` is the one line that changes it, and a
   test fails if it changes by accident. So the legible prefix this entry warned
   about does exist and is growing — and it is a probe log, which is the case
   where the warning does not bite.
2. ~~**Lineage completeness** (§3) — while `Belief.md`, `Fact.md` and
   `InferenceRecord.md` are still Draft and cheap to change.~~ **Done
   2026-09-26**, and it was cheap exactly because they were still Draft. The
   three contracts now say lineage lives in `causes`, frozen at v1;
   `EVIDENCE_GRAPH.md` inv. 2 is sharpened to match; and `planErasure` reports a
   derivation that cites nothing rather than returning a short radius that looks
   complete. Still **followed, not enforced** — nothing stops the append until
   payload schema validation exists. See §3.
3. **Erasure as a Capability.** It is the canonical irreversible Action: wholly
   local, needing no external service, and impossible to undo. That makes it the
   natural first test of `CLAIMS.md` C1's consent gate — the six routes an agent
   might use to avoid asking are all testable against an operation that never
   leaves the device.

   **Partly done 2026-09-26, and the rest is genuinely blocked.** There is no
   Capability plane in this repository: `Capability.md`, `Action.md` and
   `Policy.md` are Draft, `CAPABILITY_MODEL.md` is Phase-1 architecture, and
   `CLAIMS.md` §5 reserves two rulings for the operator that C1 waits on. A gate
   cannot be tested before it exists, and building one on this entry's authority
   would be inventing architecture. See §4a for what was built, what it settles,
   and the one narrow ruling that would unblock the rest.
4. ~~**The two-phase preview** (§1, §4).~~ **Computation done 2026-09-25** —
   `erasure-plan.ts`, 12 cases. What remains is the surface the owner touches,
   and the act itself, which is gated on §10.3.
