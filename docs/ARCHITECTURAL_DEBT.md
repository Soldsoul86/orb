# Architectural Debt Register

> Deliberately deferred architectural questions — decisions we have *chosen not to
> make yet*, recorded so they are not forgotten. Debt here is not a bug or a TODO;
> it is a known design tension whose resolution is scheduled for a later, explicit
> decision (typically a kernel version boundary). Nothing in this register blocks
> the current phase.
>
> Each item states the question, why it was deferred, the leading option, and the
> milestone at which it must be revisited. Items are resolved by an explicit
> decision recorded in version control — never silently.
>
> The companion register is `DECISIONS.md`, which records decisions that have been
> **made** and what follows from each. Nothing belongs in both: an item leaves
> this register by arriving there.

---

## AD-1 — A `Claim` layer between Evidence and Fact

- **Status:** Open · **Raised:** Phase 3b, Knowledge domain review · **Revisit at:**
  before Orb **v2** (not v1)
- **Domain:** Knowledge · **Kind (if adopted):** State

**Question.** Should the epistemic stack gain a `Claim` object between Evidence and
Fact?

```
Observation → Evidence → Claim → Fact → Belief
```

**Why it might be needed.** *Claims* are what people (and external sources) actually
assert — statements that are neither runtime Facts nor runtime Beliefs:

- "John likes Rust."
- "BTC will reach $250k."
- "The meeting was successful."

These are not Facts (the runtime has not settled them on evidence) and not Beliefs
(they are not the runtime's own contextual interpretation). They are **asserted by
someone**, and over time become **supported**, **contradicted**, or **unresolved**.
A `Claim` would let Orb *ingest the world's statements* without prematurely
classifying them as Fact or Belief — a cleaner intake path for second-hand or
disputed assertions.

**Why deferred.** v1 can represent an external assertion as an Observation (someone
said X) plus Evidence, and let interpretation form Facts/Beliefs from there. The
`Claim` abstraction is a clarity and ergonomics gain, not a correctness gap, so it
does not justify expanding the v1 kernel. Adding it later is purely additive under
Constitution Article X (v1 contracts remain valid forever).

**Leading option.** Introduce `Claim` as a Knowledge-domain State contract in v2,
depending on `Evidence` (and naming the asserting source identity, as Observation
does). It would carry a resolution status (`supported | contradicted | unresolved`)
and be referenced by Facts/Beliefs that adopt or reject it. To be evaluated against
the simpler "external assertion = Observation + Evidence" baseline before adoption.

**Decision owner:** reviewer (architecture). **Resolution:** record an explicit
accept/reject with rationale at the v2 kernel boundary.

---

## AD-2 — A durable `PlanRecord` State contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  when multi-step plan tracking becomes concrete (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** State

**Question.** Should a plan be a first-class durable State contract, or is it
sufficiently captured by composition?

**Why it might be needed.** A plan that spans many steps, days, or revisions may need a
durable identity to be tracked, resumed, and compared against outcomes — something a
single inference record does not obviously provide.

**Why deferred.** In v1 a plan is fully composed from existing contracts: its
**provenance** is an `InferenceRecord` (the recorded planning run) and its **executable
residue**, once acted, is `Action`s in Execution. The `Planner` produces *intent*; the
`Agent` binds and records it. No durable `Plan`/`PlanRecord` object is needed until
plan-tracking across time proves that composition insufficient. Adding it later is purely
additive under Article X.

**Leading option.** Introduce `PlanRecord` as an Intelligence-domain State contract in a
later version, referencing the `InferenceRecord`(s) that produced it and the `Goal`(s) it
serves, and linked to the `Action`s that execute it — *only if* `InferenceRecord` +
`Action` prove unable to reconstruct or track plans.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject when
a concrete plan-tracking need appears.

---

## AD-3 — Re-promotion of `Reflector` to a contract

- **Status:** Open · **Raised:** Phase 3b, Intelligence domain review · **Revisit at:**
  if reflection ever needs durable first-class state (no earlier than **v2**)
- **Domain:** Intelligence · **Kind (if adopted):** Service (and possibly a companion State)

**Question.** Should reflection be a kernel contract (`Reflector`), or remain composed
behavior?

**Why it might be needed.** If reflection grows to need durable, first-class state — for
example a persistent backlog of "open questions" or "unresolved expectation gaps" that is
neither a Belief nor a Prediction — a dedicated contract may earn its place.

**Why deferred / current decision.** The Intelligence review **removed** `Reflector`:
reflection is composed behavior, not a new kind of thinking. The `Scheduler` triggers the
`Reasoner` over a `Prediction`↔`Observation` gap, producing belief revisions and an
`InferenceRecord` like any other reasoning (`RUNTIME_LOOP.md` §11). It owned no unique
state and was a leaf in the dependency graph, so removal cost nothing structurally.

**Leading option.** Keep reflection as composed behavior. Re-promote `Reflector` (and any
companion State) only when a concrete durable-reflection-state need appears that cannot be
modelled as a Belief/Prediction.

**Decision owner:** reviewer (architecture). **Resolution:** explicit accept/reject if a
durable reflection-state need materializes.


---

## AD-7 — `device-watch` reads a person's whole package list outside the Capability boundary

- **Status:** Open · **Deferred 2026-09-29 (DR-13):** no special-case fix; waits for the general
  Capability → Policy → permission → Action/read → Journal mechanism in Phase 3c ·
  **Raised:** 2026-09-28, at the Execution contracts' acceptance
- **Domain:** Execution / Reality · **Kind (if adopted):** bring an existing read
  under `Capability`, not a new contract

**The finding.** `apps/pixel/pass2` holds `QUERY_ALL_PACKAGES` and reads all 484
installed packages on a scan (`DEVICE_LOOP.md` §7b6–§7b8). The permission was added
in a manifest at build time. There is no declaration, no tier, no Policy evaluation
and no `Action` — none of which existed for it to use, because `device-watch`
predates the Execution contracts accepted on 2026-09-28.

`Capability.md` §1 is explicit that this is in scope: *"Reads are capabilities too:
they leave the device's boundary and carry real privacy cost, and pretending
otherwise is how read access becomes invisible."* The package set does not leave the
device, but it describes a life in 484 lines, and the argument in §1 is about
visibility rather than about the network.

**Why it is debt and not a defect.** The implementation was correct for the
architecture that existed when it was written, and the contract it violates was
Draft until the day this was raised. Recording it as debt keeps both facts: the
boundary is right, and something crossed it before the boundary was ratified.

**What adopting it would mean.** A declared Capability at tier *Observe*, its
privacy cost stated in the declaration, invoked through the runtime rather than
read inline — and, under `Policy`, a rule the operator can actually see and revoke.
Not urgent: the read is local, the operator installed it knowingly, and the manifest
comment says what it is and how to remove it. It becomes urgent the moment a second
reader of this kind is added without anyone noticing the first was never declared.

---

## AD-5 — `KERNEL.md` lists two State→Service dependency edges

- **Status:** **Closed 2026-09-28** · **Raised:** Phase 3b, Execution domain review
- **Domain:** Execution · **Kind:** correction to `KERNEL.md`, not a new contract

**Resolution.** `KERNEL.md`'s two edges were corrected at the Phase 3b gate, as this
entry said they should be. `Action` now depends on **Event, Policy**; `Policy` on
**Event**. Both corrections carry the reason inline so the old edges cannot return
by looking like a simplification. The `Capability` → `Action` → `Capability` cycle
is gone, the section's DAG claim is true again, and the three Execution contracts
were accepted the same day against the corrected kernel.

**The finding.** `KERNEL.md` states as ratified kernel-wide law (Constitution
Art. X §40):

> A State contract depends only on other State (or on nothing); it never depends
> on a Service.

Two of the Execution domain's dependency lines contradict it:

| Contract | Kind | `KERNEL.md` says it depends on | Problem |
| --- | --- | --- | --- |
| `Action` | **State** | Capability (Service), Policy | State → Service |
| `Policy` | **State** | Capability (Service) | State → Service |

Those same two edges also close a cycle — `Capability` → `Action` → `Capability`
— against the section's own claim that the rule "keeps the kernel a directed
acyclic graph".

**Why it is a finding and not a bug in the contracts.** The resolution is
already prescribed by the law that the edges violate, and by existing precedent
in this repository. `Observation.md` met exactly this shape with `Sensor` and
resolved it by attribution rather than dependency:

> An Observation is attributed to a **source identity** — a stable value naming
> whatever produced it… The source is a *value*, not a kernel contract. This is
> deliberate: it keeps the kernel smaller, avoids a circular dependency with
> `Sensor`.

`Action` names its Capability by **identity and declaration version**, and
`Policy` names Capabilities by **identity and tier** — values in both cases. The
specifications as drafted therefore declare:

- `Action` — depends on `Event`, `Policy`
- `Policy` — depends on `Event`
- `Capability` — depends on `Action`, `Policy` (Service → State, which is legal)

This is acyclic, satisfies Art. X §40, and has the additional merit of being
correct on its own terms: an Action must stay explainable after the Capability
that produced it has been retired, which a live dependency could not guarantee.

**What is owed.** `KERNEL.md`'s three dependency lines should be corrected to
match. That file records the *accepted* Phase 3a gate, so the correction is not
made unilaterally here; it is recorded for the reviewer. Nothing else in the
kernel is affected — no contract is added, removed or renamed.

**Decision owner:** reviewer (architecture). **Resolution:** accept the
attribution-by-value reading and correct `KERNEL.md`, or reject it and say how
the DAG is otherwise preserved.

---

## AD-6 — Independence is counted but never expressed

- **Status:** Open · **Reframed 2026-09-29 (DR-13):** the primitive is *source* independence, not device
  independence; design thread, revisit when two mobile sources first report on one fact ·
  **Raised:** 2026-09-25, while turning the product promise
  into testable claims (`CLAIMS.md` C2c). **Widened the same day** when the same
  defect appeared a third time, in the Evidence Graph · **Revisit at:** before
  any multi-device custody claim is made publicly, before C2c is run, and before
  a corroborated Observation is treated as stronger than an uncorroborated one
- **Domain:** History / Distribution / Knowledge · **Kind (if adopted):** an
  independence concept — expressed once, used in three places

**One defect, three appearances.** Orb repeatedly counts things whose value
depends entirely on their being independent, while having no way to say whether
they are:

| | What is counted | What actually matters | Where |
| --- | --- | --- | --- |
| **Custody** | Devices holding a payload | Distinct **keys** | `retention.ts:93` |
| **Witnesses** | Keys, once the above is fixed | Unconnected **groups** — six keys in two buildings is two | `WITNESSES.md` §6a |
| **Evidence** | Signals that corroborate | Whether the sources are **independent** — two readings from one compromised sensor corroborate perfectly and mean nothing | `EVIDENCE_GRAPH.md` §5 |

In every case the count is an honest number and a misleading one, because the
property it is standing in for is not the property being measured. Fixing them
separately would encode the same mistake three times in three vocabularies.

**The finding.** `evaluatePrune` requires K≥2 holders before a payload may be
pruned, and at least one of them owned. `holders` are **device identifiers**
(`runtime/journal/src/retention.ts:93`). There is no key concept anywhere in
`runtime/` or `contracts/`: a search for signature, signing key, public key or
key id across both returns one hit, and it is the word "signature" used
metaphorically about a torn line in a file.

K≥2 is asked to carry two different properties, and counting devices is right
for one and wrong for the other:

| Property | What K≥2 is protecting against | Do shared-key devices count separately? |
| --- | --- | --- |
| **Durability** | Losing the last copy of a payload | **Yes.** Two copies are two copies. |
| **Tamper-evidence** | The key holder truncating the tail and re-signing | **No.** One key is one witness. |

A device restored from a backup, or a second install provisioned from the same
material, satisfies the quorum while adding nothing against the failure C2c
describes: whoever holds the key can make every device holding it tell the same
false story.

**Why it is debt and not a bug.** Nothing shipped is wrong for its stated
purpose — the retention rule is a durability rule, and for durability it is
correct. What is missing is the *vocabulary*: Orb cannot currently express
"independent key", so it cannot state the tamper-evidence property at all, let
alone test it. That is why `CLAIMS.md` C2c is marked not runnable rather than
unproven.

**Raised by the operator**, reviewing C2's wording: a witness only counts if it
does not hold the same signing key.

**The use case that makes it urgent** is also the operator's: *can my mother's
phone be the second device?* It can, and it is a better witness than any machine
the user owns — different key, different person, different place. But Orb cannot
currently tell that arrangement apart from one person holding two phones, and
for tamper-evidence those are opposite things. See `WITNESSES.md`, which is
blocked on this entry.

**And keys are not the last step.** `WITNESSES.md` §6a: six keys in two
buildings is two. What resists collusion is *unconnected groups*, which no
software can observe — it can count devices, and it can count keys once this
entry is paid down, but it cannot know whether two people share a home, an
employer or a jurisdiction. Whatever shape this takes must therefore leave room
for a count the **user declares**, carrying the user's confidence rather than
presented as something the system established (Art. XI §43).

**The third appearance, and it is not in this domain at all.**
`EVIDENCE_GRAPH.md` §5 records `corroborates` / `contradicts` between signals,
deliberately as structure rather than resolved truth, and `Evidence.md:134`
states plainly that Evidence may corroborate a wrong Observation. That part is
right and needs no change.

What is missing is the same thing: **two signals from one compromised source
corroborate each other perfectly.** A corroboration count without independence
is worth no more than a witness count without keys. `EVIDENCE_GRAPH.md` uses the
phrase *"independent signals"* descriptively; nothing in the model can hold or
check it.

This matters most under `THREAT_MODEL.md` §7, where an adversary upstream of a
sensor produces readings that Orb faithfully records, chains and will prove
forever. Corroboration is the main defence against that — and it only defends if
the corroborating sources could not both have been fed by the same hand.

**A likely shape, not a decision.** Independence is a claim *about* sources, and
software cannot establish it any more than it can establish that two witnesses
do not share a kitchen. It is probably one concept — an independence assertion
carrying the asserter and a confidence — applied to keys, to witness groups and
to evidence sources alike, rather than three mechanisms that happen to rhyme.

**What adopting it would touch.** A key identity as a *value* attributed to a
custody receipt — following the `Observation.md` source-identity precedent that
AD-5 also leans on, rather than a new kernel contract with a dependency edge.
`RetentionPolicy` would then distinguish a durability quorum from a witness
quorum instead of conflating them under one K.

---

> **Half paid 2026-09-28** (`DEVICE_LOOP.md` §7b36). In `dev.orb.app` the package
> scan no longer runs on a manifest permission alone: it requires an explicit
> grant, and the grant, the revocation and a **refused scan** are all events. That
> is the Capability shape at its smallest — declared, authorized, recorded, then
> acted on.
>
> **It does not close.** There is no `Policy` on the device to consult and no
> `Capability` registry to declare into, so what moved is the *decision*, out of
> the manifest and into history. The rest waits on the runtime those contracts
> describe.

## AD-8 — `device` identifies the handset, so two Orbs on one phone are one peer contradicting itself

**Opened 2026-09-28** (`DEVICE_LOOP.md` §7b25). **Debt, not a defect**: nothing
misbehaves today, and the condition was created by testing rather than by design.

**The finding.** `apps/pixel/pass1/src/Probe.java.in:48` opens its journal with
`device = Build.MODEL + "/" + Build.DEVICE` and the lane as the literal
`"pixel"`. Four packages — `dev.orb.pass1`, `.probe`, `.probeb`, `.probeg` — are
installed on one handset, so **four independent chains claim one lane name and
one device identity**, in four private stores that can never see each other.

**Why it is debt rather than a bug.** Every layer above assumes **one writer per
`device` value**:

- Art. IV §14 — devices are equal peers, none authoritative.
- `SECURITY.md` §4 — a device writes only its own lane, and lane authorship is
  cryptographic.
- `custody.ts` — the holder is `event.device` precisely so it is not a forgeable
  field, and `evaluatePrune` counts distinct holders.
- `contracts/Encryption.md` inv. 7 — the same assumption, stated as an invariant.

None of those is violated *on the device*, because a journal never sees another
app's store. They are violated the moment two of those exports meet, and then
correctly: `replicate` refuses two chains under one lane name.

**Why it cannot be patched where it was found.** `lane` is inside
`eventPreimage` in both envelope versions, so relabelling an existing export
invalidates every hash behind it. The four histories are permanently unmergeable,
and three of them will stay archive files.

**What it requires of the consolidated app**, which is where it gets paid:

1. `device` identifies the **install**, minted at first run — not the handset.
2. The lane derives from that identity and is never a literal. Pass 2 already
   parameterised it via `ORB_LANE`; pass 1 never did, and that asymmetry is the
   whole cause.
3. The export names its own source, so a file can say which writer produced it
   (`Observation.md` inv. 3 at the file boundary). **The precedent already
   exists**: `dev.orb.probeg`'s capability report opens with
   `package: dev.orb.probeg`, so the artifact that needed it least already does
   it and the journal export can simply follow (`DEVICE_LOOP.md` §7b30).

**Discharged when** one Orb install on one phone is one peer with an identity of
its own, and two installs are two peers rather than a collision.

---

## AD-9 — the device and the replication path disagree about a historical chain break

**Opened 2026-09-28** (`DEVICE_LOOP.md` §7b26). **Debt, not a defect**: both
behaviours are defensible, and nothing is silently wrong.

**Parked 2026-09-29 (DR-13).** Pass 1 is retired; the current app and pass 2 B verify.
Accepting an asserted break would weaken the property the journal exists to have.
Reopen only if pass 1's events are ever needed inside a journal, or a live lane
acquires a break.

**The finding.** Pass 1's lane carries §5d's permanent break at index 4
(`previous: "35"`). Two parts of Orb treat it differently:

| | Policy | Where |
| --- | --- | --- |
| On device | **Tolerate and record.** `chain.noNewBreaks` compares break *positions* against the previous self-test and fails only on a **new** break; the lane is reported as `chainBreaks: 4` and passes | §5j, `SelfTest.java.in` |
| On import | **Refuse everything.** `verifyLane` walks the whole lane and throws on the first break, so `replicate` adopts none of the 5,757 events | `integrity.ts`, `journal.ts` |

**Why it is not obviously a bug.** `verifyLane` cannot distinguish a historical
defect from tampering — a break is a break, and if a declared break were
accepted, declaring one would be the attack. Refusing is the conservative
reading of Art. I.

**Why it is not obviously right either.** The break is recorded, dated,
explained, and the device has appended past it for four days. Refusing means a
real device's honest history **can never be replicated**, which sits badly with an
architecture whose claim is that history is replayable and that peers converge by
union. The device already implements the more careful policy; the replication
path simply never learned it.

**The shape of a resolution, not chosen here.** §5j's mechanism — compare break
*positions* against a previously attested baseline — is exactly what would let
`replicate` accept *this* break and refuse a new one. That needs a place to
attest the baseline from, which is the hard part: a peer must not be able to
assert its own breaks into legitimacy.

**Discharged when** one policy governs both, or the two are deliberately
different with the reason written down.


---

## AD-10 — Promotion of Twin facets to a contract

- **Status:** Open · **Raised:** Phase 3b, Identity domain review (follow-up Q1) ·
  **Decided:** 2026-09-29, operator — keep derived for v1 · **Revisit at:** if facets need
  their own creation events or evolution history (no earlier than **v2**)
- **Domain:** Identity · **Kind (if adopted):** State

**Question.** Should a facet of the one `DigitalTwin` — the professional self, the parent,
the investor — be its own State contract, or remain a derived view?

**Why it might be needed.** A derived facet has no lifecycle of its own. Nothing can record
*the day the investor facet began*, and an `IdentityEvolution` can only ever be about the
Twin's constituents, never about a facet as such. If "when did this side of me appear, and
why" becomes a question Orb must answer, a derived view cannot answer it.

**Why deferred / current decision.** A facet is a recomputed, role-scoped projection — a
filter over the Twin's shared constituents (`DigitalTwin.md` §1, inv. 6). It holds nothing
the constituents do not, so it replays for free and adds no source of truth. Promoting it
now would grow the kernel to 31 for a need no one has yet had. Modelling personas as
**separate twins** remains forbidden either way — it makes replay intractable.

**Leading option.** Keep facets derived. Promote only when a concrete need for
facet-level history appears, and then as a State contract that `DigitalTwin` depends on —
never as a second Twin.

**Decision owner:** operator (architecture). **Resolution:** explicit accept/reject when a
facet-history need materializes.

---

## AD-11 — the Orb app's private storage is eligible for platform backup

**Opened 2026-09-29. Fixed in the tree the same day (DR-14 ruling 6):** the `orb` and
`probe-assist` manifests set `android:allowBackup="false"`, and `manifests.test.ts` fails if
they stop. **On the device once `orb-app-v8-nobackup.apk` is installed.** **Device-to-device transfer
was checked 2026-09-30 and the attribute alone is not enough:** Android documents that on
Android 12+ `allowBackup="false"` may stop cloud backup and not transfer. Both builds now
declare `dataExtractionRules` excluding every domain from both sections, with a test
(`DEVICE_LOOP.md` §7b43). Still open: the retired builds (`pass1`, `pass2b`, `probeg`) keep the
default — they hold readings, not keys, and are being replaced by the app.

Found while answering *what does Orb keep of a screenshot*.
**Not verified to occur** — the exposure is a consequence of a manifest default, not
something observed in a backup.

**The finding.** `apps/pixel/orb/AndroidManifest.xml` does not set
`android:allowBackup`, and its default is **true**. The app keeps three things in
private storage (`getFilesDir()`): the journal, the sealed attachment blobs, **and
the per-attachment keys** (`Attachments.java.in`, `attachment-keys/`). If the
device's backup is on, Android's Auto Backup may copy all three off the phone
together. That would put key and ciphertext side by side on a service the person
does not control, which defeats two things at once: **local-first**, and the
erasure guarantee — `ERASURE.md` §2a makes erasure *destroy the key*, and a
backed-up copy of the key is a copy that destruction does not reach.

**Why it is a debt and not fixed on the spot.** The fix is one manifest attribute
and the choice it forces is real: `allowBackup="false"` also means a lost phone loses
the journal, because Orb's own export to Downloads is then the only copy. That is
consistent with the architecture (*the export is the durable artefact*, AD-9's
note in `SETTLED.md`) but it is the operator's to accept.

**Leading option.** `android:allowBackup="false"` and empty
`dataExtractionRules`/`fullBackupContent` on every Orb build. **Revisit:** before any
capture beyond what a person explicitly shares — i.e. before step 7's prototype
stores a screen.

---

## AD-12 — the phone can erase a sealed attachment and nothing else

**Opened 2026-10-01** (`DEVICE_LOOP.md` §7b46). **A boundary, stated so it is not
discovered later.** Step 6 gave the phone the one erasure it can honestly perform:
destroying an Attachment's key. `ERASURE.md`'s ruling — *"all these proofs are mine, I
should be able to erase it"* — is met for sealed attachments and **not** for anything the
journal holds in the clear.

**What is out of reach.**

| | Why |
| --- | --- |
| Shared **text** (`references` carries it) | the phone has no sealed payloads; the text is written in the journal itself and cannot be unwritten |
| Any event payload | the phone writes payloads in the clear; payload-key sealing exists in `runtime/journal` (`sealedStore`) and not in `Journal.java` |
| The desk's replica | nothing applies a received `orb.erasure`; `erasedHashes` is a projection only, so a replicated event keeps its clear payload |

**Why it is not worse.** The assist capture (`SENSOR_ASSIST.md` §6) was designed so only
numbers and the package are in the clear and the text is a sealed attachment; photograph
shares keep only a content-source URI and size in the clear. What cannot be erased is what
was never sealed.

**Leading option.** Port payload sealing to the phone's journal (the `v2` envelope is already
written; the keyring is not), then honour declarations on the desk. **Revisit:** before
Orb stores anything beyond sealed attachments, or when plain-text shares matter — and
before any claim that Orb can "forget everything" is made to a person.

---

## AD-13 — Recall's search does not scale past a few hundred items

**Opened 2026-10-01** (`DECISIONS.md` DR-15). **Debt, not a defect:** search opens each remembered item
in memory, which is deliberately simple and keeps one copy of the words; it is also linear in the number
of items, and it stops looking after the newest 500 (and says so).

**Revisit when:** a search is noticeably slow (about a second), or a person has more than a few hundred
items and wants the older ones searched.

**The options and what each costs.**

| | Cost |
| --- | --- |
| **A. An in-memory index**, built when Recall opens and never written down | fast; costs memory and a rebuild each time; **no second copy on disk**, so erasure is untouched. *Leading option* |
| **B. Per-item sealed search terms**, stored beside each item under the **same key** | erases with the item; but search must still open each item's terms, so it only shortens the work |
| **C. One sealed index** | fastest to search; **a second copy of the words** that erasing one item cannot reach — the residue DR-15 refuses |
| **D. Nothing** (today's rule) | exact and simple; slow at scale |

C is the one to refuse unless a way to erase *within* an index is found.


## AD-14 — The Kotlin toolchain is fetched once, trusted on first use, and its library ships whole

**Opened 2026-10-01** (`DECISIONS.md` DR-16). **Debt, not a defect.**

1. **The compiler's hash is trust-on-first-use.** `scripts/fetch-kotlin.sh` pins Kotlin 2.0.21 and the
   SHA-256 of the compiler zip *as first downloaded from the project's own release page*. Maven Central
   publishes no checksum for that zip, so it is not checked against a second source. The **runtime library
   that ships in the APK is** (its SHA-1 matches Maven Central's).
2. **The library ships unshrunk** (a 2.2 MB dex against a 58 KB app today). A shrinker (R8) would cut it, at
   the cost of one more tool whose effect on a security-sensitive app has to be understood.
3. **Nothing Kotlin has run on the phone yet.** It compiles and dexes; whether it behaves on the device is
   shown only when the first piece ships.

**Revisit when:** the first Kotlin piece is on the device (item 3 closes); the APK size matters (item 2); or
a second source for the compiler's checksum exists (item 1).
