# Threat model — malicious intent must not corrupt, and must not harm

**Status: PROPOSAL, 2026-09-25.** Records the operator's statement of what Orb
is for, worked out into requirements. Requirement 5 and §7 are new work; the
rest names where existing design already lands.

---

## 0. The statement

> *"Vision is some malicious intent should not corrupt and do harm to the user."*
> — the operator, 2026-09-25

Two verbs, and they are different problems. **Corrupt** is an attack on the
record: changing what it says. **Harm** is an attack through the record: using
it, or claims about it, against the person it belongs to.

Most systems that address the first ignore the second. A tamper-proof log that
can be mined, subpoenaed or misread has protected its own integrity and done
nothing for its subject.

---

## 1. The five requirements

| | Requirement | Mechanism | Where it stands |
| --- | --- | --- | --- |
| **R1** | Cannot **alter** the record | Hash chain; witnesses for truncation | Chain built and demonstrated (`DEVICE_LOOP.md` §5d). Witnesses blocked on AD-6 |
| **R2** | Cannot **read** it | Encryption at rest; per-event keys | At-rest mandatory (`SECURITY.md` §3). Key granularity missing (`ERASURE.md` §2a) |
| **R3** | Cannot **compel** it out of the owner | Key destruction | Designed, not built. A key that no longer exists cannot be produced |
| **R4** | Cannot **infer** from its shape | Collection resolution | Unaddressed. §4 |
| **R5** | Cannot **make a claim about the owner stick** | Machine-verifiable proofs over a committed record | **New. §3** |

R1 and R2 are the ordinary ones and the ones most projects stop at. R3, R4 and
R5 are where *harm* lives, and none of them is a cipher.

---

## 2. Verification is performed by machines, not understood by people

An earlier draft of this reasoning called proof-acceptance *"a social problem,
and the harder half."* That was wrong, and the operator corrected it.

Nobody inspects a certificate chain before using their bank. TLS protects people
who could not describe it, because **the check is made by something that cannot
be talked out of it.** Comprehension was never load-bearing.

So the design target is a **verifier that is code**, and the owner's
understanding is not a requirement of the system working. Where the eventual
audience is an institution deciding whether to accept a standard at all, that is
a deployment question and does not change what to build, and it is not the first
thing to build for.

---

## 3. R5 — the requirement this project had been under-weighting

The threat is not only that someone reads the journal. It is that **someone
asserts something about the owner and the owner cannot contest it.**

That is the default condition everywhere today: an accusation stands unless
disproved, and disproving means opening everything — so the price of defending
yourself is exactly the thing you were protecting.

### The asymmetry, stated

- To **implicate**, an adversary needs *shape*: that the owner was active,
  awake, present, capable.
- To **exonerate**, the owner needs *content*: what was actually happening.

Under `ERASURE.md`'s rulings, shape is permanent (E2/E3 forbidden) and content is
destroyable (E1). So **erasure removes the defence and leaves the accusation
standing.** That is a real cost of rulings this project has already made, and it
is recorded here rather than left to be discovered.

### What changes it

A proof about a record committed to **before the claim existed**:

> *"My record contains no event of this kind between these two dates."*
> *"My sensor was awake continuously through this window."*

Nothing else is revealed — no content, no other events, no browsing. The
adversary can still say anything. They cannot make it stick.

---

## 4. R4 — the resolution dial cuts both ways

Volume and rhythm are not encrypted content; they are the existence and timing
of ciphertext. **No cipher hides them.** Not at-rest encryption, not per-event
keys, not computation over encrypted data. The blob exists, timestamped and
chained.

What they disclose is substantial: gaps are sleep; a shifted rhythm is travel; a
sustained drop is illness or absence; two lanes whose bursts coincide are one
person carrying two devices, or two people in one room. Over months at fine
resolution, coincidences accumulate faster than innocence can be demonstrated —
there is *always* an anomalous burst somewhere.

The only mitigation for traffic analysis is cover traffic, and **cover traffic is
lying.** A system whose entire value is that its record does not lie cannot add
noise to it. Metadata privacy and historical honesty point in opposite
directions, permanently. This is a boundary on what Orb can be, not a gap to
close later.

**So the control is collection resolution — and it cuts both ways.**

A 60-second heartbeat is a very high-resolution behavioural record. The probe
needs it because it is measuring the platform; production does not.

But the same dial sets the ceiling on R5. *"My sensor was awake continuously
through this window"* is only provable if the heartbeat is fine enough to
establish continuity. Coarsen it and the strongest provable statement coarsens
with it.

> **Resolution is one dial controlling both exposure and defensibility, and they
> want opposite settings.**

The right setting is therefore not *as low as possible*. It is whatever answers
the questions the owner might one day need to answer, and nothing finer.

---

## 5. Erasure and provable negatives are in conflict

Straight out of `ERASURE.md` §2b. An erased event has **no type at all** — the
type lived in the payload and went with it.

So if any erasure falls inside a window, *"no event of kind T occurred between
these dates"* becomes **unprovable**: one of those erased entries might have been
a T, and nothing can show otherwise.

Erasing protects the owner from a reader and costs them the ability to prove a
negative over that window. The same asymmetry as §3, arriving by another route,
and it means erasure is not a neutral safety action. It is a choice about which
adversary is being defended against.

---

## 6. Witnesses are what make a proof mean anything

A proof about "my record" requires committing to **which** record. Without that,
a favourable record is constructed after the fact and proofs are made about it.

The commitment is a head hash at a point in time — which is exactly what a
witness attestation is (`WITNESSES.md`).

| | Supplies |
| --- | --- |
| **Resolution** | How much shape exists to attack with, and to defend with |
| **Witnesses** | The anchor: *this* record, fixed at *that* time |
| **Proofs** | Answering one question without opening the rest |

So witnesses stop being only a tamper-detection mechanism. They are **what pins
a record to a past the owner could not have edited afterwards**, which is the
precondition for every proof in R5. That is the strongest argument for witnesses
in this project, and it arrived from a completely different direction than the
one that motivated them.

---

## 7. The limit: everything here protects the record *after* it exists

If an adversary gets **upstream of the sensor** — feeds the device a false
location, spoofs a reading, compromises it before anything is written — then Orb
faithfully records the lie, chains it, witnesses it, and will prove it forever.

> **Orb can prove what it recorded. It cannot prove that what it recorded was
> true.**

Art. XI §43 already says this in principle — an Observation owns confidence,
never truth. Under this threat model it has teeth: **every protection in §1
preserves a corruption introduced at the source, perfectly.**

Which makes sensor integrity a first-class part of *cannot do harm*, rather than
a detail of the sensing layer:

- **Where a reading came from**, recorded as a value, not assumed.
- **How sure the device is**, which `Observation.md` already requires.
- **Whether independent sensors agree.** A corroborated observation is worth
  more than a chained one.

**Corrected 2026-09-25.** An earlier draft of this section said corroboration
"has no contract" and that agreement between sources "is not expressible." That
was wrong. `EVIDENCE_GRAPH.md` §5 carries `corroborates` / `contradicts` edges
between signals, recorded as structure and deliberately not resolved into truth,
and `Evidence.md:134` states that Evidence may corroborate a wrong Observation.
The concept is present and it is already right.

**What is missing is independence, not corroboration.** Two readings from one
compromised sensor corroborate each other perfectly and mean nothing. That is
the same defect as counting devices where keys are meant, and counting keys
where unconnected groups are meant — now logged as one entry, AD-6, because
fixing them separately would encode one mistake three times.

The other genuinely absent piece is **hardware attestation** — see §7a, which
also corrects the sentence this one used to carry.

### 7a. Hardware attestation — what it proves, and what it must never be

**PROPOSAL, 2026-09-25.** Nothing built. Availability and behaviour are device
questions, not facts asserted here.

**What Android key attestation actually asserts.** A key generated in the TEE or
StrongBox yields a certificate chain stating that the key **lives in hardware
and cannot be exported**, the **verified boot state** (bootloader locked, boot
verified, OS version, patch level), and **which app owns it** (package name and
signing certificate).

**What it does not assert, and this is the part that gets assumed.** Nothing
about any sensor. Readings travel sensor → kernel → framework → app and no step
in that path is signed. Attestation cannot say a location fix came from a real
GPS.

What it gives instead is *transitive inference*: with verified boot and a locked
bootloader, the OS is unmodified, so injecting a false reading needs either
developer settings — themselves observable — or an actual compromise. That is a
meaningful raise in cost. **It is not a signed statement from the sensor and must
never be recorded as one.**

#### It is an Observation, never a root of trust

The attestation chain roots in a vendor certificate. Art. VIII §30 says the user
is the root of trust, never a server or provider, and `CLAUDE.md` forbids vendor
lock-in. The tension is real, and the resolution is to give attestation no
special status at all:

> An attestation is an **Observation like any other** — its own source identity,
> its own Confidence of Reality, weighed by a reader like any other signal. Orb
> records what the device asserted. It stakes nothing on that assertion being
> true.

The vendor dependency then belongs to whoever chooses to *verify* the chain, not
to Orb, and nothing in the architecture rests on it. Any design that promotes an
attestation above other evidence — treating it as settling a question rather
than informing one — has reintroduced a provider as root of trust by the back
door, and should be read as a defect.

**It is also a genuinely independent source.** The TEE is a different trust
domain from the process asking it, which is the scarce property AD-6 is about.
An attested claim corroborating an app-level one is worth more than two
app-level claims agreeing.

#### The strongest use is not sensor provenance

Put the **lane's signing key in StrongBox and attest it.**

A truncate-and-re-sign then requires physical possession of that device, because
the key cannot be lifted and used elsewhere. With a rollback-resistant counter
(`ERASURE.md` §2a) this narrows `CLAIMS.md` C2c without a witness at all.

More usefully: attestation is **what lets someone else believe the key is where
its owner says it is.** Unattested, *"my key is in secure hardware"* is a claim.
Attested, it is checkable — which is the step that makes §2a mean anything to
anyone but the owner.

#### Limits, so this is not oversold

- **Physical spoofing is untouched.** A camera pointed at a screen, or a GPS
  simulator beside the phone: attestation says *genuine sensor, genuine device*,
  and the genuine sensor faithfully reports a fake world. §7, again.
- **Verified boot green is not "uncompromised."** It means nothing was detected.
- **Attestation keys have been extracted from devices before.** This raises the
  cost of forgery; it does not remove it, and no claim here should imply it does.
- **Availability varies** by device, OEM and patch level. StrongBox is not
  universal.

---

### Why Orb should not try to prove truth

Asked directly by the operator, and worth answering in the document rather than
leaving implied.

It is not achievable by anything: every sensor is a transducer and every
transducer can be lied to. But the stronger reason is that **claiming it would
make Orb more dangerous.** A record everyone believes is true, which can be
spoofed at the source, hands any fabricator the system's whole credibility — a
perfect alibi or a perfect accusation, chained, witnessed, provable forever.

A record that says *this is what I believed, from this source, with this
confidence* cannot be used that way, because its limits travel with it. **The
refusal to claim truth is a safety property, not a shortfall** — the same move as
everywhere else here: state the boundary rather than hide it.

What Orb offers instead is the standard real evidence is held to. Nobody asks a
security camera to prove reality; they ask whether the footage is the original,
unedited, from that camera, at that time. Custody and integrity, which Orb can
demonstrate. Art. XI §43 already had this right.

Recorded here so that the five requirements are not read as assuming an honest
input. They do not.

---

## 8. What is open

1. **R5 is unbuilt and unspecified.** Which statements must be provable is a
   design question that has not been asked yet, and it determines the resolution
   floor in §4.
2. **The resolution setting itself.** Not decidable in the abstract: it depends
   on §8.1.
3. **Independence** (§7) — AD-6, now one entry spanning custody, witnesses and
   evidence. Corroboration itself is already modelled; whether the corroborating
   sources are independent is not. **Hardware attestation** has no contract at
   all.
4. **AD-6** still blocks witnesses, and therefore blocks the anchor in §6, and
   therefore blocks R5 having anything to commit against.
