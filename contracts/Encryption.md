# Encryption — Contract Specification

```
Contract:   Encryption
Domain:     Infrastructure
Kind:       Service
Version:    v1
Status:     Draft
Depends on: None. The cryptographic substrate.
```

> Encryption is what makes every other guarantee hold against someone who does not
> cooperate. See `../docs/SECURITY.md` §3–§5 and `../docs/ERASURE.md` §2a.

**Why a permanent kernel contract?** Because every claim Orb makes about ownership
is otherwise a claim about *behaviour* — that the relay will not look, that the
provider will not keep it, that the pruned payload is gone. Behaviour is a promise;
ciphertext is a fact. **This is the one contract whose guarantee survives the holder
being hostile**, and it is the reason Art. VIII §30's *"authority over data and keys
lives with the user"* is structural rather than a policy anyone could quietly
relax. The *algorithms* are replaceable and will be replaced; the obligations are
not.

---

## 1. Semantics

An **Encryption** is a Service that holds keys, seals and opens data under them,
destroys them on request, and binds each device's identity to what it is permitted
to write.

### Cannot read, not merely not allowed to read

`Policy` decides whether something may be disclosed. A permission check is obeyed
by a component that *chooses* to obey it — it is a fact about our code, and it
reaches exactly as far as our code runs. Encryption makes the same boundary a fact
about the data: a relay carrying ciphertext is not trusted to ignore the contents,
it is unable to read them. The two are not alternatives. Policy decides; Encryption
is why the decision still holds on a disk taken out of a drawer, in a backup nobody
remembers, on a peer that has been compromised.

**Encryption decides nothing.** It never reads meaning, never authorizes, never
chooses what may be disclosed. A cryptographic layer that made permission decisions
would be an authority that no one could see making them.

### A key is stored, never derived, exactly when destroying it must accomplish something

Anything derivable is re-derivable. A key derived from a passphrase and an event id
can be reconstructed by anyone who can reconstruct the inputs, so **destroying it
destroys nothing** — the erasure would be theatre, and worse, theatre that reports
success.

So derivability is not an implementation preference. It is a statement about what
destruction means:

- **Erasure keys are stored**, one per payload and one per attachment
  (`Attachment.md` inv. 8). Destroying one is what makes the ciphertext inert on a
  peer's disk, in a backup, and in flash residue that no filesystem references any
  more (`ERASURE.md` §2a).
- **The address secret is derived by design** and is explicitly *not* an erasure
  key. Destroying it hides *where* bytes are; it never makes them unreadable.

### Encrypting the bytes hides the content, never which content

A store addressed by content identity is a list of identities, and anyone holding a
file can test a guess against it. The ciphertext is intact and the store has
answered the question anyway. Hence **blinded addressing**: the address is
`HMAC(addressSecret, identity)` — unguessable without the secret, recomputable from
the identity so nothing extra is persisted, and **rotatable**, which voids every
address an adversary has collected while breaking nothing, because the address is
referenced by the local store alone and the identity is what history references.

The same trap has a second mouth, recorded rather than hidden: `payloadHash`
commits to the **plaintext**, never the ciphertext, so verification works
identically before and after sealing and two devices that seal the same payload
under different keys still agree on its hash — and a hash over guessable plaintext
is a **confirmation oracle**. That is a cost this contract accepts knowingly, not
one it has failed to notice.

### The envelope is not sealed, deliberately

Only payloads are. The hash chain must be verifiable by a device holding **no keys
at all**, which is what lets a witness hold envelopes, check integrity end to end,
and read nothing (`WITNESSES.md` W2). It is also what makes erasure expressible
without amending Art. I §2: the payload is destroyed, the envelope remains, the
sequence keeps its length, order and every hash (`ERASURE.md` §2).

### Tamper-evidence is detection, never prevention

Hash chaining does not stop anyone from rewriting a file they control. It makes the
rewrite **detectable** by everyone else. Stating it the other way — "history cannot
be forged" — would promise something no cryptography delivers on hardware an
adversary holds.

---

## 2. Lifecycle

1. **Device identity.** A device mints a stable identity key. Its lane is bound to
   that identity; the binding is cryptographic, not conventional (`SECURITY.md` §4).
2. **Enrollment.** A new device joins the user's set through an explicit,
   authenticated action initiated from an existing trusted device, and receives the
   user-scoped data key. **No remote authority can add a device.**
3. **Sealing.** Data is sealed on the way to rest and authenticated in transit. A
   payload already sealed is never re-sealed — a second key for one identity
   orphans the first, which is how data becomes unopenable with nobody having
   erased anything.
4. **Holding.** Keys live on-device, behind hardware where the device offers it.
5. **Destruction.** A key is destroyed on request, irreversibly, and the identity
   is tombstoned so nothing re-mints it.
6. **Rotation.** The user-scoped data key and the address secret may be rotated.
   Rotation re-seals forward; it rewrites no history, because no hash commits to
   ciphertext.

---

## 3. State transitions

A key, per identity:

```
absent ──mint──▶ held ──destroy──▶ destroyed   (terminal; re-minting refused)
   │                                   ▲
   └──────────destroy──────────────────┘
        (tombstoned even if no key was ever here)
```

**`absent` and `destroyed` are different states and are never merged.** `destroyed`
is a fact about an act; `absent` is the absence of one. A resolver that merged them
fails in both directions, and both failures are real:

- Reading `absent` as `destroyed` tells the user their photo is gone when the key
  has simply not reached this device yet.
- Reading `destroyed` as `absent` lets a peer helpfully restore content its owner
  erased.

A device asked to destroy a key it never held is still tombstoned, because it has
been told the content is gone and must not mint a key for bytes that arrive
afterwards.

---

## 4. Invariants

1. **The user and their devices are the root of trust.** No server, relay or
   provider holds a key, plaintext, or authority (Art. VIII §30).
2. **The store holds ciphertext and transit is authenticated**, on every device,
   always. There is no convenience exemption.
3. **An erasure key is stored, never derived** (§1). Anything derivable is
   re-derivable, so destroying it would destroy nothing.
4. **Destruction is irreversible.** A destroyed identity is tombstoned and a key is
   never re-minted for it.
5. **`held`, `destroyed` and `absent` are three states**, never two.
6. **No escrow, anywhere.** Recovery material is held by the user. A provider-held
   escrow is refused because it would create an authority, not because it is
   inconvenient.
7. **A device writes only its own identity-bound lane** (`SECURITY.md` §4). Lane
   authorship is cryptographic.
8. **History is tamper-evident**: any mutation or reordering is detectable by hash
   chain (`SECURITY.md` §5).
9. **Envelopes stay verifiable without keys.** Integrity is checkable by a holder
   who can read nothing.
10. **Addresses are blinded and rotatable.** The store never reveals which content
    it holds.
11. **Encryption decides nothing.** It enforces decisions made elsewhere and makes
    none of its own.
12. **Depends on nothing.** Opening data requires no other service to be running
    (§6).

Upholds Constitution Articles I §2 (history never edited, reordered or deleted —
by making erasure expressible without touching the sequence), IV §14 (equal peers,
each writing only its own lane), VIII §30–§32 (root of trust, local-first,
minimized disclosure) and X §40 (persistent state never depends on a running
process).

---

## 5. Versioning rules

- **Algorithms are replaceable; obligations are frozen at v1.** A suite will be
  retired within Orb's lifetime. That is expected, and is why it is named in the
  contract nowhere.
- **Sealed data records the suite that produced it**, so a payload sealed years ago
  stays openable after the suite that sealed it is no longer used for new data. A
  format that did not say how it was sealed would make every retirement a migration
  or a loss.
- **A new scheme is an addition, never a redefinition** (Art. X §37). New data may
  carry a new scheme tag while existing data keeps its own and stays valid for
  ever. Identities are scheme-tagged from the first one rather than when a second
  is first needed, because untagged identities cannot be told apart later without
  guessing.
- **Rotation is not re-writing.** Rotating the data key or the address secret
  changes ciphertext and addresses; it changes no event, no hash and no identity.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- **Data at rest is ciphertext**, and transit is authenticated, with no exception.
- **A destroyed key is never re-minted**, so an erasure cannot be undone by
  ordinary operation.
- **Integrity is verifiable without any key.** A witness can hold history and check
  it while reading none of it.
- **Nothing outside the user's devices can decrypt**, whatever it holds.
- **Decryption requires no other Orb service.** A device with the bytes and the
  keys can read its own history with the `Journal`, `Storage` and
  `Synchronization` all stopped. This is what "depends on nothing" is *for*: a
  substrate that needed a layer above it to function would make recovery
  conditional on the health of the thing being recovered.

Not guaranteed:

- **That a key is recoverable if the user loses their recovery material.** There is
  no escrow, and that is the design (`SECURITY.md` §3). The cost is stated here
  rather than discovered at the worst moment.
- **That ciphertext an adversary already holds becomes unreadable retroactively** —
  unless the key is destroyed, which is exactly why key destruction is the erasure
  mechanism.
- **Protection against a compromised device while it is unlocked.** Encryption
  defends data the device is not currently reading; it cannot defend data it is.
- **That metadata reveals nothing.** The envelope carries type and timestamp by
  design (`ERASURE.md` §2), and a plaintext-committing hash is a confirmation
  oracle (§1). Both are named costs, not oversights.

---

## 7. Failure modes

- **A key is absent.** Reported as `absent`, which is *not* an erasure. The data is
  unreadable here and may be readable elsewhere; saying so precisely is the whole
  reason the third state exists.
- **A key was destroyed.** Opening returns nothing, and that is the erasure having
  worked, not a failure. Sealing under that identity is **refused** — a keyring
  that re-minted on the next write would make erasure reversible by accident: the
  original ciphertext stays unreadable, but the same bytes arriving again become
  readable, which is the erasure quietly undone.
- **Integrity check fails.** The data is rejected and the failure recorded. It is
  never accepted "provisionally", and a chain break is never repaired by
  recomputation — recomputing a hash over tampered data produces a chain that
  verifies and a history that lies.
- **A suite is retired or found weak.** New data uses the new suite; old data stays
  openable under the recorded one. Data is re-sealed forward deliberately, never
  silently, and re-sealing changes no hash.
- **Recovery material is lost.** The data is unrecoverable, and Orb says so
  plainly. It does not offer a provider-held fallback, because the fallback is the
  authority Art. VIII §30 forbids.
- **A device is lost or stolen.** Its identity is revoked so it enrolls no further
  devices and its future writes are not accepted; history it already wrote remains
  valid and attributed. Revocation is a statement about the future, never a rewrite
  of the past — so the record names **the point acceptance stops**, not merely the
  device (`../docs/reviews/RECORDS.md` §2). Two limits follow and are part of the
  contract rather than of an implementation:
  1. **A revoked device can still write its own lane.** Nothing stops it; it holds
     its key. Revocation is a rule about **acceptance**, enforced independently by
     every peer — never a rule about writing, which no one can enforce.
  2. **A device cannot reliably be told it is revoked.** A stolen phone may never
     sync again. Revocation is effective where it is known, so the honest sentence
     has the same shape as an unconfirmed erasure: *"revoked, and four of five
     peers have seen it."*
- **A relay or provider is compromised.** It holds ciphertext and learns nothing
  new. This is the case the contract is designed around, not an exceptional one.

Never permitted: plaintext at rest; unauthenticated transit; a provider-held key or
escrow; re-minting a destroyed key; repairing a broken chain by recomputation;
deriving a key whose destruction is supposed to mean something.

---

## 8. Examples

- **Erasure that reaches a copy you do not control.** The user erases an event.
  Deleting the bytes would leave a peer's copy readable and flash residue
  recoverable. Destroying the key leaves both in place and neither decodable, at a
  cost of a few bytes rather than the size of the payload. This is the difference
  between erasure as a promise and erasure as a fact.
- **A witness that verifies what it cannot read.** A device holds envelopes only.
  It checks every hash link end to end and confirms nothing was edited, reordered
  or removed — while reading not one payload. Integrity and confidentiality are
  separable here on purpose.
- **The address that gave the game away.** A store keyed by content identity is a
  set of hashes. An adversary with a copy of a photo hashes it and asks whether
  this device has it; the ciphertext never budges and the answer is yes. Blinded
  addressing is what closes that, and rotation is what makes an old leak stop
  mattering.
- **A key that was not there versus a key that is gone.** Two devices, one erasure.
  The device that performed it holds a tombstone. A device that never received the
  key holds nothing. If both reported "gone", the second would be telling its owner
  their data was erased when it is sitting on the first device; if both reported
  "not here", the first would re-mint a key the moment those bytes arrived again.
  Three states is the minimum that is honest.
- **The escrow that would have been convenient.** A provider-held key backup would
  solve lost recovery material outright. It is refused because the holder of a key
  is an authority over the data, and the architecture is built so that no such
  authority exists to be subpoenaed, breached, or changed by a change in terms.
  The lost-key case is the price, and it is a price rather than an oversight.
- **What is not encrypted at all, and why that is fine.** `packages/device-watch`
  folds a projection from device exports on a machine the user controls. The
  ciphertext boundary exists between the user and everyone else, not between the
  user and their own tools — which is the practical shape of "the user is the root
  of trust" (Art. VIII §30).
