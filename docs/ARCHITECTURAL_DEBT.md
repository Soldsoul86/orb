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

- **Status:** **Closed on the phone 2026-10-02, verified on the device (DR-22, `GATE_READS_PHONE.md`)** — the package scan, the assistant's screen read and the grants watch are declared at tier *Observe* beside the reminder, shown and withdrawable in one place, and held by tests; what remains is a Policy language and the desk (below). *(Earlier: the gate for the first *action* landed with DR-20.)* · **Deferred 2026-09-29 (DR-13):** no special-case fix; waits for the general
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
| Shared **text** shared **before v25** (`references` carries it) | written in the journal itself and cannot be unwritten. **From v25 on, shared text is sealed** (`DEVICE_LOOP.md` §7b60) and is erasable like a captured screen; only the old words remain |
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
2. **The library ships unshrunk** (a 2.2 MB dex; the APK went from 58 KB to 750 KB). A shrinker (R8) would cut it, at
   the cost of one more tool whose effect on a security-sensitive app has to be understood.
3. ~~Nothing Kotlin has run on the phone yet.~~ **Closed 2026-10-01**: the first Kotlin piece ran on the device (`DEVICE_LOOP.md` §7b55, P68–P69).

**Revisit when:** the first Kotlin piece is on the device (item 3 closes); the APK size matters (item 2); or
a second source for the compiler's checksum exists (item 1).


## AD-15 — the backup's limits, stated

**Opened 2026-10-01** (`DURABILITY.md`, `DEVICE_LOOP.md` §7b58). Debts, not defects; each is a choice with a cost.

1. **PBKDF2 is the weakest part.** The key is PBKDF2-HMAC-SHA256 at 600,000 iterations because the platform has it and nothing has to be added. A
   memory-hard function (Argon2, scrypt) resists a graphics-card attacker far better. **Revisit** when one can be added without a library the build
   cannot vouch for, and **at the latest before backups leave the phone automatically** (Step 2), because an automatic copy in a synced folder is a
   target that stays.
2. **A backup keeps what was erased after it.** Until the person deletes the file. Orb says so where the backup is made; the *Erase* dialog does not claim
   to reach backups. (`ERASURE.md` §2a: *a backed-up key is an un-erased payload* — the limit is stated, scoped and in the person's hands.)
3. **A forgotten passphrase is unrecoverable, and no hint is kept.** A hint is a weakened passphrase; the cost is a lost phone *and* a lost passphrase
   losing everything.
4. **Restore makes this phone the old install**, and refuses unless the install is fresh. Two live phones on one lane would fork history; the fresh guard and the
   warning stop the honest case, and the laptop importer refuses two chains under one lane for the rest. A restore as a *new lane that imports the old* is the
   cleaner model and a much larger change (multi-lane reading across Recall, Erasure and Provenance).
5. **The process is closed after a restore**, because it still holds the old identity and journal; a background append in the moment between the swap and the
   close would write a stray file under the old lane name. Harmless, but real.
6. **A restore grants nothing** — the package-scan permission is not restored. Conservative on purpose; it costs the person one tap.
7. **Not testable off the phone:** the file picker, `MediaStore` Downloads, and the swap across the real filesystems. The device check is one real restore.

---

## AD-16 — keeping erased content again is a phone-only act, for text

**Opened 2026-10-01** (`DECISIONS.md` DR-17, `REKEEP.md`). Debts, stated.

1. **Shared pictures and files are not covered.** The sender's read grant is short-lived and the question would have to be asked while it lives;
   they keep the plain refusal (*erased*). **Revisit** if a person hits it.
2. **The desk's keyring still refuses** (`runtime/journal/src/attachment-keyring.ts`, keyed by event id). There is no owner at the desk to ask, and the
   desk does not yet act on an erasure declaration at all (AD-12), so there is nothing to reverse there yet. Revisit when the desk honours declarations.
3. **A person who wants even the *fact* of an erasure gone is asking for something else.** The declaration is history and stays; the prompt shows its date.
4. **A process killed while the share dialog is showing records nothing for that share.** Same exposure as a kill during sealing.

---

## AD-17 — the phone's entities are handles only, and not remembered between openings

**Opened 2026-10-02** (`DECISIONS.md` DR-19, `ENTITIES_PHONE.md`). Debts, stated.

1. **Handles, not people — partly closed (DR-24, 2026-10-02).** A phone number, site, UPI id, email, amount or date names itself; "Ravi" does not. **The People screen now resolves names through the contacts, opt-in** (see AD-21); **places and organisations still need a model** and are not read.
   Mentions itself is still handles only.
2. **No merge or split — partly closed (DR-24, DR-29).** Contacts sharing a number or an address are one person **on the People screen, computed, with nothing recorded**. **An item↔person decision is now recorded** (DR-29: a sealed link you make). Mentions still treats two numbers as two entities, and a person's own *"these two are the same"* (a merge) or *"these are not"* (a split) is not built.
3. **Linear cost, bounded to the newest 500 kept items** (AD-13), and every lookup reopens every item in memory. An index would have to be sealed and kept in step with every erase; revisit if the lookup
   becomes slow (thousands of items).
4. **Format limits are the rules' limits**: no landlines, no two-digit years, no relative dates, a ten-digit order id starting 6–9 reads as a mobile, other countries' numbers only as `+country…`.
5. **The list is a sensitive index** of what a person's words mention. It lives behind the same secure window as Recall and is never exported or logged; a person who screenshots around the protection
   (another device pointed at the screen) is outside what the app can prevent.


---

## AD-21 — what People reads, and what it cannot know

**Opened 2026-10-02** (`DECISIONS.md` DR-24, `PEOPLE_PHONE.md`). Debts, stated.

1. **A name is a word — and in a real book, often noise (DR-25).** *Mark*, *May*, *Will*, *Home* are contacts and words; Orb cannot tell which was meant. A person tied only by a name is **possible**, listed apart and collapsed; only a number or an email makes a person *sure*. A first name shared by two contacts is not matched at all (the screen says how many are shared), and a first name is not read at the start of a sentence — which misses a real *Priya said hello* and *Mr. Anil called*. A one-word contact name can still be noise inside a sentence, in the *possible* list.
2. **Only the contacts the words mention are shown.** A person who is in your kept words under a nickname, an initial or a different script from the contact's is not found; the contact's name is matched as written (case-insensitive, accents and Devanagari as given).
3. **Grouping trusts the book.** Two contacts sharing a number or address become one person, even if the book is wrong; an address book that shares one number between family members would group them. Nothing is recorded, so it is corrected by fixing the book, not Orb.
4. **Numbers are matched as the kept words write them** (`+91…` / `+country…`, ten-digit mobiles); a landline or a number with a trunk prefix the reader does not know is not found (AD-17 point 4).
5. **Read at every opening, linear cost.** Contacts are read once per opening and matched against the newest 500 kept items (AD-13); a very large book will be slow, and the screen says what it did not look at.
6. **The screen is as sensitive as the Contacts app and Recall together** — a list of the people your words are about. It is behind the secure window and is never exported, logged or recorded; a person pointing another camera at the screen is outside what the app can prevent.
7. **The grant's two halves can disagree.** Revoking in Android's settings leaves Orb's grant recorded; the People screen then says *Android's permission is off, nothing was read* and offers to ask again. Revoking in Orb removes the flag first and then says so.
8. **Not built:** contact photos, groups, birthdays, a typed list (option C), turning *"call Ravi"* into an action (a gated, later step), other languages' name rules.


---

## AD-22 — a reminder about a person is your words and a date, nothing more

**Opened 2026-10-02** (`DECISIONS.md` DR-26). Debts, stated.

1. **No lineage to a kept item.** It cites none by design (so erasing an old note cannot cancel it); the cost is that nothing ties it to *why* you set it. The note is the only memory of that.
2. **The name is a snapshot.** The note holds the contact's name as spelled when you set it; renaming or deleting the contact later changes nothing. Orb does not follow a person.
3. **Offered on possible people too.** A *Might be* match (a word that matches a contact's name) can be reminded about; the note is yours to edit, and nothing asserts the match is a person.
4. **Two contacts grouped as one person** start the note with the first contact's name.
5. **No call, no message.** The reminder shows words; reaching the person is yours. Handing a number to the dialer or another app is a separate capability and decision.

**Search (DR-27):** the search finds contacts by name only (not by number); it shows at most 25, best first; a contact that is a group or a shop is found like any other; a contact with the same name as another is listed separately, and Orb does not choose between them. Not built: pinned or recent people, starred contacts, search by number.


---

## AD-23 — what a person's context and a hand-off do not know

**Opened 2026-10-02** (`DECISIONS.md` DR-28). Debts, stated.

1. **The context is what you gave Orb.** It does not read chats or the other apps; a person you talk to daily in an app you never shared from has an empty context. It says so.
2. **No reminders listed by person.** A reminder cites no kept item and never records the person (DR-26), so a person's window cannot say *you have a reminder about them*.
3. **A hand-off is an intent, not a result.** `released` says Orb issued it; whether the other app opened, whether you pressed send or call, and what was said are not seen and not recorded. Orb never learns the outcome.
4. **The app decides what it does with the number.** WhatsApp, the messaging app and the dialer receive it by design; once handed over, what they do with it is theirs.
5. **A bad contact number is refused, not fixed.** Only `+` and 8–15 digits is accepted; a contact whose number the reader could not normalise has no button enabled.
6. **No text, no drafts.** The other app opens empty. Writing a message from the context is a separate step (and, if a model writes it, a separate decision about what leaves the phone).
7. **Dates ahead cost a second pass** over the newest 500 kept items each time People opens (AD-13).
8. **Whether `whatsapp://` opens from an app with no `<queries>` entry** is expected, not yet seen on a device.


---

## AD-24 — what a link you make does and does not do

**Opened 2026-10-02** (`DECISIONS.md` DR-29). Debts, stated.

1. **One item at a time.** Linking is a tap per item; Orb does not learn that *the next chat from the same screen is Sasi's too*. Offering the link at the moment of keeping (from the screen capture or the share) is a later step.
2. **A chat kept again is a new item.** The same conversation shared on two days is two items; each is linked once.
3. **The link names the contact as it was.** If the contact is deleted, or its number, address *and* name all change, the link is dormant — safe, but you would link again. A restore on a phone with different contacts behaves the same way.
4. **Two people with the same name and no shared number** can be confused by the name fallback; the note carries the numbers and addresses, which match first.
5. **The nonce means an erased link can be made again.** That is intended (it is a decision, not content to be kept out), but it also means *Unlink* cannot stop you from linking the same pair a minute later.
6. **The cascade has two paths.** Erasing in Recall erases the links at once; erasing from *Everything Orb keeps* is finished at the next start (`reconcile`) — until then a link to a gone item exists but shows nothing.
7. **A link is not a merge.** Two contacts for one person, or one contact for two, are still as the contacts book has them.
8. **Cost:** each opening of People opens every live link's note (one decrypt each) with the newest 500 kept items (AD-13).


---

## AD-25 — what commitments and Today do not know

**Opened 2026-10-02** (`DECISIONS.md` DR-30). Debts, stated.

1. **Only what you confirm.** Orb finds no commitment by itself; a promise made in a chat you never track is invisible. Proposing them needs language understanding (a model), which is its own decision (DR-9).
2. **"Done" is your word.** Orb cannot see that you sent the document or that the refund arrived, so *still open* can be stale: you did it and did not say. *Overdue* is only ever *the date passed and nothing was closed*.
3. **No person after the fact.** A commitment made from an item has no person; to add one you delete it and make it again from the person's page.
4. **A date is a day, not a time.** No time of day, no timezone beyond *today in your zone*; a reminder gives the time.
5. **No duplicates check.** The same thing tracked twice is two commitments; drop or delete one.
6. **No recurring commitments, no projects, no goals.** Each is a single line with a state; grouping them is a later step.
7. **Dates in what you kept are offered only for the next seven days** and only if not already tracked on that item and date; further ahead is in Coming up.
8. **The newest 500 kept items and the first 500 commitments** are read each time Today opens (AD-13).
9. **A restore on a phone with other contacts** may show a commitment's person under a different contact, matched by number, address or name as for a link (AD-24).
10. **A closed commitment is reopenable for 14 days from Today**, and after that only from a person's page if it was reopened there — it is not deleted, just no longer listed (a *Closed* list for everything is not built).
11. **An unexplained tap defect** (an overdue row ignored touches on the device, v38) was worked around, not root-caused: rows now have explicit buttons. If a bare row tap is still unreliable somewhere, other screens that rely on one (People rows, Recall rows) share the risk.


---

## AD-26 — what a nudge does not do

**Opened 2026-10-02** (`DECISIONS.md` DR-31). Debts, stated.

1. **Templates, not understanding.** Four fixed sentences in English. A commitment written in Hindi or Tamil is quoted unchanged inside an English sentence; the card is where it is fixed. A model writing the message would be better and is its own decision (DR-9).
2. **No memory of nudging.** Orb does not record *which* commitment you nudged, so it cannot say *last nudged Tuesday* or stop you nudging the same person every hour. A mark would cite the commitment in the hand-off record (a link between a commitment and a person's contact being used) — a later decision.
3. **The words leave Orb's control by design.** Once the other app opens with them they are that app's: its draft box, its keyboard suggestions, its backup. Orb sees none of it and records none of it.
4. **Messaging apps differ.** Some ignore the pre-filled text (`sms_body`) and open an empty message; WhatsApp takes it in its link. Neither is detected.
5. **Only the numbers the commitment held when it was made.** A contact whose number changed since is not reached by *Nudge*; the person's page shows the current number, and a hand-off from there opens empty.
6. **A nudge is a prompt to chase, not a measure of delay.** *It was due Thu 1 Oct* is the commitment's date, not evidence that they are late — Orb does not know whether they replied.

---

## AD-18 — the first action's limits, stated

**Opened 2026-10-02** (`DECISIONS.md` DR-20, `GATE_PHONE.md`). Debts, not defects.

1. **The result is not recorded.** `released` says Orb *issued* the reminder, not that you saw it (`Capability.md` inv. 7). Seeing it would need a sensor observing the notification being shown or opened; not built.
2. **A reminder can be minutes late** while the phone dozes (no exact-alarm permission, on purpose). It is recorded as late (`lateMs`), never dropped. A battery saver that kills Orb's alarms is outside what the app can prevent; Orb sets them again at every start and boot.
3. **Once shown, the notification's words live in Android**, like any app's, until dismissed — beyond Orb's reach. The lock screen shows only *a reminder you set*.
4. **A process killed between recording a release and posting the notification** leaves it recorded as issued and not shown (fails toward doing less, and says so).
5. **Two confirmations of exactly the same reminder** (same item, time and note) are one decision: the second is refused `alreadyReleased`.
6. **Only Orb's own gate decides.** There is no second device and no remote path; a desk that later acts on the phone's behalf will need its own declaration.

---

## AD-19 — Coming up proposes dates that name themselves, and nothing else

**Opened 2026-10-02** (`DECISIONS.md` DR-21, `COMING_UP_PHONE.md`). Debts, stated.

1. **Relative days: partly done (DR-23, 2026-10-02).** *Tomorrow*, *day after tomorrow*, *in N days/weeks* and a spelled-out weekday are read as marked guesses from when the item was kept. **Still not read:** *next Friday*, *every Friday*, *next week*, *this weekend*, *end of the month*, abbreviations, times of day, and Hindi/Hinglish (*kal*, *parso*).
2. **No names.** *"Call Ravi"* has no date and no name the phone can resolve (AD-17).
3. **The context line is the start of the item's words**, not the sentence around the date (`Handles` gives a normalised value, not where it was). Good enough to recognise the item; not a quote of the date's sentence.
4. **A past date is never shown**, so something you meant to be reminded of that has passed is silent — by design (a stale proposal is noise), but a reminder you wanted for yesterday is yours to set by hand.
5. **Linear cost, newest 500** (AD-13), computed again each time the screen or the main screen opens (the dot, on a background thread).
6. **No memory of declining.** Ignoring a proposal leaves no trace, so it is offered again each time it is still ahead. A "don't suggest this" would be recorded behaviour about you — a separate decision.

---

## AD-27 — what the Safety check does not know

**Opened 2026-10-02** (`DECISIONS.md` DR-32). Debts, stated.

1. **A blind spot, by design.** Without `QUERY_ALL_PACKAGES` Orb sees apps that have a launcher icon or a powerful service (accessibility, notification access, keyboard, device admin) — not every package. An app with none of these and a risky permission is not seen. The screen says so every time; it is the price of not being blocked by Play Protect.
2. **Heuristics, not detection.** The rules say what an app **can do**, not what it **intends**. A genuine accessibility tool and a stalkerware app look the same to it. It will flag legitimate apps (a password manager, a screen reader) and will miss malware that asks for nothing unusual. No reputation database, because that needs the network.
3. **The added `<queries>` entries may themselves meet Play Protect.** Three intent filters were added to the manifest; the device is the test (`DEVICE_LOOP.md` §7b77, P204) — **on the operator's Pixel 10a the install was not blocked.**
8. **Two levels were too coarse for a real phone.** 299 apps gave 42 in *Worth a look*. **Grouped by severity since v44** (`SAFETY_CHECK_PHONE.md` §11) — but the order is a judgement written as a table: a keyboard ranks above a texts-reader, an installer above both, and a person may disagree. The groups also still say nothing about *which app you trust*; there is no *I know this app* yet.
4. **"Outside a known app store" is a short list** (Play, Galaxy, Amazon, Xiaomi, F-Droid). A store not on it reads as sideloaded.
5. **Settings can be unreadable.** If Android refuses a read (screen lock, USB debugging, patch date), Orb does not claim the setting is bad.
6. **Findings are not remembered.** *I know this app* is not built, so a legitimate flagged app appears at every check.
7. **One-time.** No background re-check; the grants watch is the only thing that notices a later change.

---

## AD-28 — what the Documents source does not know

**Opened 2026-10-02** (`DECISIONS.md` DR-33). Debts, stated.

1. **PDF text is whatever Android's reader returns.** Columns can come out in the wrong order, odd fonts can come out as nothing, and a table can read as a stream of numbers. The preview shows what Orb read before anything is kept; if it is poor, the slice has not earned its keep. Not testable off the phone.
2. **A phone without the reader cannot do this at all.** Reading text needs Android 15+ (SDK extension 13); elsewhere every file reads *this phone could not read this file's text*. Orb's minimum is Android 14.
3. **Scans are not kept.** No text recognition, and no PDF viewer to keep the picture; both are their own decisions.
4. **Only the words are kept, not the file.** A kept document cannot be shown as it looked, its layout is gone, and the original stays wherever it was.
5. **A folder is a standing read grant** until switched off; every look is recorded, the grant is on **What Orb may do**, and what is kept is only what is ticked.
6. **Sensitive documents are not recognised.** A bank statement or an identity document is a PDF like any other; the protection is *nothing without a tick*, a secure screen and per-item erase — not a guess.
7. **Erased content is not kept again from here.** The Share path asks the question (`REKEEP.md`); this path does not yet.
8. **One folder level, forty files, ten megabytes, sixty pages, two hundred thousand characters.** Chosen to be safe, not measured; a real phone may want them moved.
9. **The picked-files path holds Android's temporary access** only while the screen is alive; leaving it and coming back means picking again.
10. **The chosen folder's address is kept in a small file** beside the grant flag (not in the journal). It is not restored with a backup; after a restore the source reads as switched off and says so.

---

## AD-29 — what dates in documents do not know

**Opened 2026-10-03** (`DECISIONS.md` DR-34). Debts, stated.

1. **A line is whatever the PDF reader returned.** Columns can interleave, so the line a date is on may be a fragment, or two things joined (AD-28 item 1). The line is editable on the commitment card; the first device round decides whether it is good enough.
2. **The cue list is a guess at what matters, in English.** A deadline in Hindi or Tamil, or one worded outside the list (*settle by*, *no later than*), is listed second, not missed. The list is short on purpose and held by tests.
3. **Long lines are cut at 140 characters by sentence and word.** A date near a cut keeps its own piece, but a cue in the neighbouring piece is not seen with it.
4. **Date forms are those Orb reads everywhere** (day-first numeric; *12 Oct 2026*). Others, such as *October 12th* or ISO dates written without separators, may be missed.
5. **One line per date.** A date that appears on several lines shows its deadline-looking line, else the first; the other lines are not shown.
6. **Twelve per document.** A long statement's later dates are counted, not shown.
7. **The fold lives in memory.** Leaving Coming up closes every fold.
8. **A document is a document only by its clear record.** An item kept before Sources existed, or shared by hand, takes the old road with the guesses.

---

## AD-30 — what *People in a document* does not know

**Opened 2026-10-03** (`DECISIONS.md` DR-35). Debts, stated.

1. **A name is a name only if the contact is saved that way.** A contact saved as *Mom*, *Dr Rao Dentist* or a nickname is not named by a PDF that writes *Sunita Rao*. Organisations that are not in the contacts are not offered at all.
2. **A coincidence is possible.** A ten-digit order or account number can equal a contact's number; a contact called *Delta* can be a word in boilerplate. The line says how it matched; Cancel is the default; Unlink undoes it.
3. **Whole-name matching is the name matcher's, with its rules** (whole words, the sentence-start rule of DR-25). Misspellings, initials (*R. Kumar*) and transliterations are not matched.
4. **Documents only.** A shared note or a screen gets the search alone, though its names are *possible* people on People's own page.
5. **One list per item.** If a document names forty people, ten are offered and the rest found by search.
6. **The suggestions are not remembered.** Decline one and it is offered again next time; there is no *not this one*.
7. **Linking is still one person per tap.** Two parties to an invoice are two taps.

---

## AD-31 — what the call-history line does not know

**Opened 2026-10-03** (`DECISIONS.md` DR-36). Debts, stated.

1. **Only the phone's own calls.** WhatsApp, Telegram, Meet and other apps' calls are not in the system log; *last spoke* will say Tuesday when you spoke on WhatsApp on Friday. The line says *phone calls only* so it never claims more.
2. **The permission is in the whole calls build.** A user of the calls build holds `READ_CALL_LOG` in the app that also holds their vault. A companion app would separate them (least privilege) at the cost of two apps and a protocol; not built.
3. **Play Protect's verdict on the whole of Orb with this permission is unmeasured.** The probe (a 13 KB app) installed silently; the full app is the first device round's question, and v45 is the rollback.
4. **Numbers that cannot be matched** (a short code, a hidden number, a number saved in a form that cannot be normalised) never match a person.
5. **Two people sharing a number** (a family landline) see the same calls.
6. **A year, 5,000 calls.** A busier log is cut at the newest 5,000 and the line says so.
7. **"Spoken" is a duration over zero.** A call answered by voicemail that lasted is counted; a very short real call is too. No attempt is made to read intent.
8. **Time zone.** The day is the phone's current zone; a call made abroad in another zone is shown in today's.
9. **The reader cannot be run off the phone.** `CallsReader` talks to Android's call-log provider, which the test shim does not have; v46's first read failed on a provider rule (no SQL in the sort order) that no off-phone test could see, though the probe's simpler query had worked. The failure is now named on the screen and a source guard forbids the known cause; the first device round of any new provider query is still the real test.

---

## AD-32 — what the Messages source does not know

**Opened 2026-10-03** (`DECISIONS.md` DR-37). Debts, stated.

1. **The file's shape is a guess until a real one is read.** The reader is written to the common *SMS Backup & Restore* XML. Another app's XML, a JSON backup, or a newer version of that app may not be recognised; the screen then says the tag and attribute names it found (never a value).
2. **The export is every message in the clear, in Downloads.** Orb cannot delete it for the person and says so. Until it is deleted it is readable by anything with storage access.
3. **A third-party backup app needs the SMS permission itself.** Orb names none as endorsed; the person chooses whom to trust.
4. **No index and a 500-item window.** A year of many conversations is many items; screens read the newest 500, so old PDFs and shares can fall out of view of People and Coming up. The tally says so; an index is a design of its own (and must be proven against erasure).
5. **Codes are matched by a short English word list.** A code worded another way (or in another language) can be sealed in an item the person ticked — erasable, never sent. Service senders, where most codes come from, are not offered at all, so bank messages are not kept by this slice.
6. **Months are in the phone's current time zone,** so travelling or changing zone can move a message across a month boundary and change a month's words (an *earlier version*, not kept again).
7. **A number with no country code** is read as an Indian number by People's rules; the same person's two spellings can appear as two conversations.
8. **No relative-day guesses** from messages: *Friday* in a text is not read, though the message's own day would make it exact. A later step.
9. **One conversation is one number.** Group messages (MMS) and conversations with several numbers are not read.
10. **Looking reads the whole file once; keeping reads it again.** A large export takes a while (it is streamed and capped at 200 MB and 200,000 messages), and the second pass is the price of holding almost nothing in memory.
11. **Not testable off the phone:** the real file, the picker's grant for a large file, and how the screens feel with hundreds of items.

---

## AD-20 — what closing AD-7 did not build

**Opened 2026-10-02** (`DECISIONS.md` DR-22). Debts, stated.

1. **No Policy language.** *You* are the policy — each read is allowed by a recorded decision of yours (a grant, an allow-list entry, a confirmation) or is always on — which `Policy.md` allows. Rules as data (scoped, expiring, evaluated deterministically) wait for a second person or device that needs them.
2. **The grants watch cannot be switched off.** Declared and shown as exactly that. A switch (with a recorded grant and revoke, as the package scan has) is a small addition if wanted.
3. **The registry does not stop a determined edit.** It is held by source tests that fail the build; a person who edits both a read and its guard has changed the architecture on purpose, which is what the pinned words and the review are for.
4. **The assistant's read is gated by the existing allow-list and your invoking it**, as before — the registry declares and displays it; `AssistGuardTest` still holds the code path.
5. **The desk's reads** (an importer reading an export, the connector) are not declared here; they are the laptop's side and have their own boundary.

