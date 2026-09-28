# Where Orb Is

**Standing overview plus a snapshot as of 2026-09-26**, written so that picking
this up does not require the conversation that produced it.

> **This document is not a source of truth.** Every claim here is decided
> somewhere else and cited; where this disagrees with the document it cites, the
> other one wins and this one is stale. Art. IX §33 forbids two sources for one
> fact, and a summary that started arbitrating would become the second.
>
> **§1 is the standing overview** — what Orb is, and what exists as code.
> **§§2–6 are the dated snapshot** — what was decided, measured, and neither, on
> the date above.
>
> It exists because a session was switched by accident today and the handoff that
> followed had to be audited rather than trusted. The audit found three
> structural errors in a written recap — wrong package names, a claimed test that
> had never run, and a proposed envelope that would have undone two rulings. This
> file is the fix: one place that says what is decided, what is measured, and
> what is neither.

---

## 1. What Orb is

**A personal runtime that continuously learns, reasons and acts alongside its
user.** Long-lived — years rather than conversations. Its intelligence comes from
*continuity* rather than from any single model; its foundation is evidence; its
architecture is local-first, model-independent, and built to evolve for decades.

`MASTER.md` sets seven principles — **local first, device native, event first,
evidence first, model independent, continuous understanding, human agency** —
and `CONSTITUTION.md` turns them into twelve articles: History, Truth and
Interpretation, Models and Reasoning, Distribution, The Runtime, The Three
Planes, Capabilities and Human Agency, Ownership and Trust, Engineering, The
Kernel, Reality and Confidence, Identity and Continuity.

One pipeline:

```
Sensors → Event Journal → Evidence Graph → Knowledge Engine → Digital Twin
   → Reasoning Pipeline → Agent Runtime → Capabilities → Actions → Reflection
```

`contracts/` now holds **all 30 kernel contracts** — every one has a written
specification as of 2026-09-28, `Encryption.md` last. **12 are Accepted** — Event,
Observation, Evidence, Fact, Belief, Entity, Prediction, Sensor, Attachment,
Capability, Action, Policy — and 18 are Draft. *Written is not the gate.* Phase 3b
closes when every specification is **accepted**, so the remaining 18 reviews are
the work, not the writing.
`docs/` is roughly 9,400 lines across 24 documents. By its own `ROADMAP.md`, Orb
is in **Phase 3, the Kernel and Contracts**, with two amendments running beside
it.

### What exists as code

Roughly 24,000 lines of TypeScript and 3,000 of Java. **627 tests, 0 failing**;
lint clean; every package compiles independently.

**The kernel.**

| | | |
| --- | --- | --- |
| `runtime/journal` | ~8,900 | the Event Journal: hash chains, HLC ordering, envelopes v1/v2, erasure, partial replication, sync, Attachments |
| `runtime/observation` | ~400 | occurrence, not truth — inv. 3, 5 and 7 enforced at the boundary |
| `packages/connector` | ~550 | connector Sensors: the call, the synthesis, the outcome ladder |
| `packages/device-watch` | ~700 | the first closed loop: import, projection, one rule, an alert, an answer |

**Amendment one — the Hyperliquid trade executor.** *Entry may come from the
signal provider; exit authority belongs to the executor.* Signal-agnostic: once a
position is open it never depends on the signal source to tell it when to leave.
This is the first real Capability — something Orb *does*, under a policy, with
every decision journaled.

| | | |
| --- | --- | --- |
| `packages/trade-executor` | ~7,700 | the execution engine |
| `packages/hyperliquid` | ~2,850 | signing, REST, WebSocket |
| `apps/executor` | ~2,950 | runtime host, production safety interlock, authenticated signal API |
| `tests/` | ~1,100 | acceptance scenarios |

**Amendment two — the device loop.** No Gradle and no libraries anywhere in it:
an instrument that pulled in a framework could not say whether a death was the
platform's or the framework's.

| | | |
| --- | --- | --- |
| `apps/pixel/pass1` | ~1,650 | foreground-service and journal survival; the 21-hour run |
| `apps/pixel/pass2` | ~730 | the grants signal; recording since 2026-09-26 |
| `apps/pixel/probe-grants` | ~640 | the throwaway that answered P12–P14 |

### What is not built at all

**The whole middle of the pipeline.** Evidence Graph, Knowledge Engine, Digital
Twin, Reasoning Pipeline, Agent Runtime — contracts written, no code. That order
is the architecture's own and not an accident: everything above depends on a
journal that cannot lie about what it knows, so the journal is finished first and
the reasoning layers stay paper until it is.

---

## 2. The logic

One distinction decided most of the design, and it keeps arriving under new
names: **cannot check is not failed the check.** Every time it was collapsed,
something reported a fact nobody had observed.

| where | the two that must not merge |
| --- | --- |
| a setting read | `absent` (returned nothing) vs `empty` (returned none) |
| a call outcome | `threw` (the attempt failed) vs `denied` (the other side refused) |
| lineage | `ungrounded` (built on nothing) vs `unresolved` (not visible from here) vs **grounded, ground detached** |
| a payload gone | `unfetched` vs `pruned` vs `erased` |
| a prune | `prunedBecause` absent means nobody recorded why — never `space` |
| a policy | `none` (never recorded) vs `unreadable` (recorded, payload gone) |
| a count | omitted where it is not a fact, never `0` |

The operational corollary, paid for across five runs of a throwaway probe:
**ask the device before asking the person, and where the device can answer, do
not ask the person at all.** Four consecutive verdicts in that probe came from
the instrument rather than the platform — a claim with no corroborant was
believed, a label invited a wrong claim, a readout was allowed to be older than
the device it described, and a verdict rested on a checkbox the device could have
answered itself. A human claim is a legitimate input only where nothing on the
device speaks to the same fact.

### The journal

`contracts/Event.md`, `docs/EVENT_MODEL.md`, `runtime/journal/`.

An Event is an **envelope plus a payload**. Every device holds every envelope;
payloads are optional and their absence always carries a reason. Hash-chained per
lane; ordered by `(hlc, lane)`; wall clock is human-facing and never an ordering.

**Envelope v2** (`ERASURE.md` §2b, operator ruling): coarse type `orb.content`
outside, the real type inside the payload, a per-event nonce, and `causes` moved
into the payload — so an envelope alone cannot state lineage, and `undefined`
there means *cannot say* rather than *built on nothing*. Bookkeeping types stay
legible because machinery outside the device reads them and can never decrypt.

Encoding is canonical JSON, **safe integers only**. That came from a measured
divergence: Java's `Double.toString` and JavaScript's `JSON.stringify` disagree on
three of six test values. Agreement *by construction* beat reimplementing
ECMAScript number formatting. The rule then found a real bug — risk measurements
carrying binary floats in the same struct as string prices.

Two encoders, TypeScript and Java, pinned against one vector file
(`apps/pixel/pass1/tests/vectors.json`). The v1 hash `dce6c5bb…` has never moved;
v2 was added beside it rather than over it.

### Erasure

`docs/ERASURE.md`, `contracts/Attachment.md`.

**E1**: the payload goes, the envelope stays. **E2 and E3**: never possible — no
one decodes what happened, the owner included.

The cost, accepted with the deciding reason given by the operator: an erased
event becomes **completely uninterpretable**, because its type went into the
payload and died with it. *"Else someone will just try to erase and get the
summary"* — a record of what was erased is an oracle, and it turns coercion into
*compel an erasure, then read what it removed*.

Attachments keep the content hash as identity and **blind the address** (inv. 7);
a per-Attachment key **dies with the last reference** (inv. 8), which makes
erasure arithmetic rather than a promise, including on a relay still holding the
bytes.

### Partial replication

`docs/PARTIAL_REPLICATION.md` §9. Seven invariants; the load-bearing ones here
are **known absence** (3), **proof before pruning** (4: K ≥ 2 other holders, one
of them owned), **journaled policy** (6) and **no retention authority** (7).

§11's two shortfalls are now closed: retention policy and sync payload policy are
both read back from history, and `horizon()` carries the policy that bounded it.

---

## 3. The policies

`docs/DECISIONS.md` holds these in full, with consequences. The companion is
`docs/ARCHITECTURAL_DEBT.md`, which holds what has deliberately **not** been
decided; nothing belongs in both.

| | decision | the consequence that matters |
| --- | --- | --- |
| **DR-1** | Orb is a **gateway, not a guard** | A6 stays not-refusable and stops being an embarrassment; the mediated set is exactly what the user starts in Orb |
| **DR-2** | the **accessibility approach is discarded** | an app that can read every screen cannot credibly report that capability as a risk while holding it |
| **DR-3** | **no feed re-ranking** | forced rather than chosen, which makes connector coverage the product risk |
| **DR-4** | confirm in Orb, **hand off prefilled**; email end to end | a hand-off and a send are **different evidence**, and the journal must not record the first as the second |
| **DR-5** | the **intent chain**, cancels included | a gate recording only what passed cannot show what it stopped; `intent_id` is `causes`, not a new field |
| **DR-6** | the pass-3 schema is a **payload** schema | `source`/`kind` in the envelope reopens the leak §2b closed; a timezone offset puts a location trail where witnesses replicate |
| **DR-7** | connectors: journal the call, keep the raw **seven days** | needed no new machinery, which is the test it passed |

### What is enforced in code, not only written

- **A device prunes under a policy from history or not at all.**
  `evaluatePruneFromHistory` fails closed on both unknowns, because a permissive
  default would drop payloads on the strength of a *missing* record.
- **A prune says what wanted the payload gone.** `prunedBecause` is required, so
  a retention window that expired is distinguishable from a device that ran short
  of room — opposite facts that `absence: "pruned"` alone reports identically.
- **A horizon says what bounded it.** `syncPolicyInForce` on `horizon()`.
- **Only a device's own records govern it** (inv. 7), and the newest record
  governs whether or not it is readable — an earlier readable one is a rule the
  device has already replaced.

---

## 4. The hardware

**Pixel 10a (`stallion`), Android 16 / API 36, security patch 2026-04-05, build
`CP1A.260405.005`.** `DEVICE_LOOP.md` §7 R3 stands over all of it: a finding is
recorded against *this* device at *this* build, never generalised.

### Pass 1 — 2303 events over 21.1 hours

Every hash re-derives. HLC monotonic across three reboots. **P4 holds with zero
unexplained gaps** — the beat counter never skips. `specialUse` ran **13.5 hours
continuous** after a reboot while `dataSync` never came back. 950 signals,
including 223 unlocks. The fixed-rate drift fix verified at a **median 60 ms**,
with no accumulation.

One §5d linkage break, explained and recorded rather than smoothed over.

### P12, P13, P14 — all confirmed, zero permissions

`apps/pixel/probe-grants`, five runs. A control held throughout: a direct read of
`/data/system/users/0/settings_secure.xml` failed with `EACCES`, so the successful
reads went through the framework rather than around a sandbox that was not there.

Two findings became code:

- **`getActiveAdmins()` returns `null` for none on this platform** — four
  readings with nothing active all returned `null`; the one with Find Hub's admin
  on returned a list. So `null` cannot be passed through as *unknown* (device
  admin would be unreadable on every ordinary phone for ever) nor read as *none*
  (a real stalkerware admin would be recorded as an empty set). `isAdminActive`
  per installed receiver settles it, and that branch is where the signal is
  either honest or blind.
- **A revocation was observed end to end**: five listeners, Pixel Stand switched
  off, four — with `dreamliner` the only name missing. `MOBILE_SENSING.md` §4.4's
  note that a revocation is itself evidence now has a measurement behind it.

Also measured: Play Protect reported *"This app looks safe"* about a self-signed
sideload it had never seen.

---

## 5. The capability

**What Orb can see holding nothing:** which accessibility services are enabled,
which apps hold notification access, which device admins are active, and every
change to those. Names only, never content.

That is `MOBILE_SENSING.md` §4.4's *"classic stalkerware install: cheap,
high-value, low-noise"* made detectable at no permission cost. The baseline on an
untouched phone is five notification listeners, all Google — which is what makes
a sixth worth an event.

What runs it is in §1. The three Android packages are there too.

---

## 6. What is not proven

The section that matters most, and the one a summary is most tempted to shorten.

| | |
| --- | --- |
| **P17** | why `BOOT_COMPLETED` was delivered **four times** inside one boot session (2026-09-28) is **accounted for but not proven**: the operator force-stopped the app and reopened it, three deliveries land mid-launch, and the one launch following an ordinary process death carries none. The platform's queueing was not read, so the marker in P20 rests on one absence against three presences. What is settled: the action string cannot date a boot, only `elapsedRealtimeMs` can. P6, P16 and P18 are answered — a broadcast reached pass 2 with no service running, 32 minutes after a cold boot; grants changed while the process was dead were caught at the next process start, in **both** directions; and the settings watch caught a change with the process alive |
| ~~**P20**~~ | **HELD 2026-09-28** (`DEVICE_LOOP.md` §7b21) — the reading marks the package **leaving the stopped state**. Controlled inside one boot session with every precondition platform-attested: boot delivery at 131 s, `low.memory` death → no reading, force-stop with a live process → reading. First-sight refuted; queue-replay already refuted. Took four days, a purpose-built probe, one refutation of my own instrument and one withdrawal of my own refutation to get there |
| ~~**P19**~~ | **refuted 2026-09-28** (§7b10). An install taken with the process alive, launched three times and never force-stopped produced **no broadcast at all**, while the same receiver's `BOOT_COMPLETED` filter fired in the same export. There is no prompt route for packages and there never was; the scan is the whole mechanism. The failure's *mechanism* is unknown and recorded as unknown — manifest restrictions on implicit broadcasts, package visibility, or this build — and the filter is kept, relabelled, so a platform that starts delivering says so |
| **the scan interval, now load-bearing** | 12 h was chosen as a fallback behind a prompt broadcast. That broadcast does not exist, so 12 h **is** the detection latency for a new app on this device. Whether that is acceptable is a decision, not a default |
| **P21** | **a recorded limit, narrowed on 2026-09-28 and not closed.** Comparison reports on endpoints, not intervals: a grant given and withdrawn between two process starts reads `changed: false`, so *nothing happened* and *something happened and was undone* are the same record. The installed-package set is now carried and compared, so a **missed broadcast** is recoverable — an install *undone* before the next observation still is not. The second candidate, recording the blind window explicitly, is not implemented |
| ~~**P22**~~ | **held 2026-09-28 on the device** — `scope: "all"`, 484 packages, baseline on the first scan, the operator button recorded as `operator.scan`, and a second scan comparing `baseline: false` across an intervening observation. What remains of it is P19's half: a named entry in `installedPackageGained` after an actual install |
| **the signing key** | the keystore in the build environment does not match the pass 2 installed on the phone. That install can never be upgraded, only removed, and its journal goes with it. The new build runs beside it as `dev.orb.pass2b` on lane `grants-b` |
| **the scan interval** | 12 h is a guess, now tunable against a measurement: a scan costs **16.7 KB** (484 packages), 10.5× an observation, so at two scans a day the scans are 33 KB of the journal's 42 KB/day. Halving the interval roughly doubles the journal. Too long and an install sits unnoticed for half a day when the broadcast was silenced; too short and it costs battery and bytes for a set that rarely moves |
| **An answer's identity** | alert ids are minted at raise time, not derived from the change. Replaying the same device lane into a fresh journal mints new ids, so an existing answer's citation dangles. An answer is therefore replayable only alongside the lane that raised what it answers — a design change, recorded 2026-09-28 and not made |
| ~~**Attachment**~~ | **implemented 2026-09-26** — identity, blinded address, per-Attachment keys, the destruction guard. 20 tests, five controls |
| ~~**Observation**~~ | **implemented 2026-09-26** — `runtime/observation`, with inv. 3, 5 and 7 enforced at the boundary. DR-7 tier 2 is wired into the connector |
| ~~`Capability.md`, `Action.md`, `Policy.md`~~ | **Accepted 2026-09-28** (`reviews/EXECUTION.md`). Ruling 1 taken — standing authorization only where waiting would defeat the action's purpose; AD-5's two State→Service edges corrected in `KERNEL.md`; DR-5's chain folded in and discharged; the authorization record specified with a **derived** identity; Art. VII §29 vs XI §41 named rather than settled quietly |
| **`Synchronization`** | **Drafted 2026-09-28, unreviewed.** Written for something unbuilt — but `importExport` already implements its semantics with a human as the transport: group by lane, verify, skip what is held, adopt the tail. Finding: **the retention machinery is complete and currently unreachable.** `evaluatePrune` needs custody receipts from two *other* devices, receipts are events on the holder's own lane, and without sync no other lane ever arrives. Nothing is broken; it names exactly what sync unblocks |
| **`Journal`, `Storage`** | **Drafted 2026-09-28, unreviewed** (`reviews/INFRASTRUCTURE.md`). Written against the running implementation and four days of device evidence rather than the kernel entry alone, which surfaced three gaps: `Storage` is one kernel contract and **three ports** in the code; the projection half has **no implementation and may need none** (persisting is permitted, never required, and a persisted projection is a discardable cache); and the **envelope v2 migration is not a configuration change** — a rule the kernel entry does not carry and shipped code is already latent against |
| **`Scheduler`, `Agent`** | **Drafted 2026-09-28, unreviewed.** Scheduler's spine: its queue is a projection, not a record — no durable state, pending work derived from history. Agent's: four verbs, four owners, and it never routes around a denial. Four open questions for a reviewer are listed in `reviews/EXECUTION.md`, including what Scheduler's `Policy` dependency is actually for |
| **`ModelRouter`, `Encryption`** | **Drafted 2026-09-28, unreviewed** (`reviews/INFRASTRUCTURE.md` addendum). Opposite ends of one domain: the router is the only Infrastructure contract that may send the user's data *out*; Encryption is the only one that depends on nothing, because everything depends on it. ~~The open question is whether a remote model call is a `Capability`~~ — **settled the same day, DR-9: yes.** Resolving is not emitting: a remote route is a Capability at tier *Act (irreversible)*, declared per route; the router resolves and minimizes and never emits, so it **drops its `Policy` dependency** and the anomaly of an Infrastructure contract depending on a decision-maker turns out to have been the symptom rather than an exception. The price is charged immediately — remote reasoning now runs on a standing, per-scope authorization rather than on the absence of a gate. Also surfaced: `AttachmentKeyring`'s three load-bearing rules existed only in a docstring until `Encryption.md` stated them, and revocation still has no record type |
| **`orb.sensor.share`** | **Declared 2026-09-28, no code** (`SENSOR_SHARE.md`). The first sensor written declaration-first rather than decided in a manifest — which is the test AD-7 failed. Result of writing it: **receiving a share is not a `Capability` at all**, because Orb reaches for nothing; the Capability boundary falls on *resolving* the reference, and fetching a shared URL is egress at *Act (irreversible)* under DR-9's reasoning. Sharing a link is not authorization to visit it. Needs only Accepted contracts; everything it must not do needs Draft ones |
| **`CLAIMS.md` §5 Ruling 2** | **Proposal recorded and revised 2026-09-28, not adopted.** The laptop vantage is **rejected** — India-first and Android-first means a second machine can never be a requirement, and the same objection retires `SOVEREIGN_STACK.md`'s router, which cannot see a phone on mobile data. Replacement: **a second *channel*, not a second *device*.** A6 needs a path to the same fact the acting agent does not control — independence of *source*, which was misread as independence of *hardware*. The bank's SMS is not authored by the agent that made the payment. The bound improves too: a channel's latency (seconds) rather than a laptop's duty cycle (hours, unstated). Limit: an act with residue in no observed channel is undetectable, so the claim must **name its channels**. *(This row previously described Ruling 2 as the timing of consent; that is Ruling 1, ruled 2026-09-28.)* |
| **`grants.exits`** | **Built and installed 2026-09-28** (`DEVICE_LOOP.md` §7b14, §7b15), and it answered P20 on its first two records — four exits paired four for four with the presence or absence of the reading. It also settled §7b13 against the operator's own recollection, because the platform's history reached back seven hours past the probe's installation. Reads `ActivityManager.getHistoricalProcessExitReasons` at each process start and journals why the *previous* process died. Removes the dependency both halves of P20 had on human recall — a force-stopped app writes nothing, so this journal was structurally unable to record its own force-stop. Second *source*, not second *machine*, the same conclusion `CLAIMS.md` §5 reached for C1's vantage |
| **the pass2b signing key** | **`keys/pass2b.keystore` is gitignored, untracked, and exists only in the build container.** It is the only key that can upgrade the installed pass 2 B, so a container recycle means the app can never be updated again and `grants-b` dies at the forced reinstall — §7b8 by another route. Handed to the operator to keep off-container 2026-09-28; it cannot live in the repository. Signer SHA-256 `98093b72…4fb69019` |
| **P20** | **Refuted as written 2026-09-28** (`DEVICE_LOOP.md` §7b19). The reboot ran: a `low.memory` death was followed by the reading, so force-stop is not the cause, and the exit probe built that morning is what made the refutation checkable rather than another unverifiable positive. Two things did land: **P6 strengthened** — a genuine boot delivery at **131 s** with no foreground service, matching pass 1's 133 s — and the late readings **stop** after a real boot delivery, which is the negative control §7b18 asked for. The cause is open; first-sight fits better than force-stop and still does not predict three of the eight rows |
| **AD-7** | `device-watch` reads 484 installed packages outside the `Capability` boundary — no declaration, no tier, no Policy. Debt, not a defect: the contract it crosses was Draft until the day it was raised |
| `CLAIMS.md` §5 Ruling 2 | **how narrowly C1 is stated** — the mediated set only, or detection of out-of-band action within a stated bound. Unresolved, and a decision about what Orb promises. *(This row previously described it as the timing of consent; that is Ruling **1**, ruled 2026-09-28.)* |
| `AIRWALL.md` | an unapproved proposal |
| AD-6 | independence, open in the debt register |
| ~~the pass-1 self-test fix~~ | **installed 2026-09-28.** Eleven self-tests had read `ok: false` failing `chain.linksEndToEnd`; the twelfth is the first to pass — `chain.noNewBreaks: true`, `chainBaseline: true`, `chainBreaks: "4"`, so the §5d break is recorded as known rather than repaired or hidden |
| ~~**pass 1 will not open**~~ | **fixed and installed 2026-09-28** (§7b11, §7b12). An unbuffered `RandomAccessFile.readLine()` in `Journal.readLines`, one syscall per byte. Measured on the phone by the phone: `process.start` → `selftest`, one full pass over the lane, was **5,628 ms at 5,635 events** and is **51 ms at 5,748** — a 55–110× improvement matching the 60× measured off-device |
| **pass 2 inherits it** | `Journal.java.in` is shared at build time and `Pass2.observe` calls `lastOfType` on every wake. At the measured 42 KB/day, pass 2's lane reaches 3.3 MB in about eleven weeks and would become unopenable the same way. The fix is in source and a rebuilt `pass2b` was sent 2026-09-28; **the running pass 2 B does not have it until that install happens**, and the original `dev.orb.pass2` can never receive it (signature) |
| **an export path that needs a healthy app** | pass 1's journal can only leave the phone through pass 1's own Export button. An app that will not open therefore cannot surrender the evidence of why it will not open, and nothing else on the device can reach app-private storage. Recorded as a design fault the moment it cost something, not before |
| the device's security patch | roughly six months old |

**DR-7 is complete.** Tier 3's ambiguity was ruled on 2026-09-26: the key is
destroyed at expiry, and the **newest** referencing event decides, so one recent
citation holds the whole Attachment however old the others are. `Attachment.md`
inv. 8 now names that second ground. A window must be asked for by name, and a
recent unreadable event still blocks it.

**The first loop exists** — DR-8, `packages/device-watch`: journal, Observation,
projection, one rule, an alert, an answer, and the answer back in the journal
where the next projection reads it. It records rather than learns, and a test
asserts that by running the loop twice with each answer and comparing.

**The transport exists.** `importExport` replicates a pass-2 export into this
journal — the phone's lane verbatim, chain and hashes intact — and turns each
reading into an Observation citing it. That import is also the first
cross-implementation verification on real data: `verifyLane` re-derives every
envelope and payload hash, which the phone cannot do for itself, since
re-derivation needs a JSON parser the probe deliberately does not have.

**The loop has now closed once, end to end, on a real device** (2026-09-28, §7b2
of `DEVICE_LOOP.md`). Two notification listeners were turned off while pass 2 was
not running; the next process start caught it from history (5 → 3, both named,
`baseline: false`); `project` folded it into one change, the rule raised one
alert, the operator answered *dismissed* — they had turned them off — and the
answer is in the journal citing the alert, where the next projection reads it and
still raises nothing. **P16 held.** **P6 held** on the single clean signal of
2026-09-27. **P17 is new and refuted:** `BOOT_COMPLETED` arrived twice in one
boot session, so the signal's name cannot date a boot — `elapsedRealtimeMs` can,
and it also confirmed the operator's account of the power-off to the
millisecond.

**A third export answered both prompt routes** (2026-09-28, §7b3). P16 now holds
in the direction it was written in: two listeners turned **on** while the process
was dead, named in `notificationListenerGained` at the next process start, 3 → 5.
And **P18 is new and held** — the first `settings.changed` readings ever recorded,
the `ContentObserver` catching a re-enabled listener with the process already
alive, 4 → 5, no wake and no launch. P17 is refuted harder: four
`BOOT_COMPLETED` deliveries, one boot instant, to the millisecond. **P19 left no
trace at all:** no package-broadcast reading exists, and the journal cannot say
whether the install happened or the route is silent.

**P17's mechanism came from the operator** (§7b4): they force-stopped Orb and
reopened it. Grouped by process, three of the five launches in that export carry a
re-delivered `BOOT_COMPLETED` between `process.start` and `app.opened`, and the one
launch that followed an ordinary process death carries **none** — so re-delivery is
a property of how the app last stopped, not of launching. **P20** is written from
that: the reading may be a **force-stop marker**, which would be the first thing in
the record able to say *the watch was stopped* rather than *the watch saw nothing*.
It is a platform side effect, not an API, and the control half is untested.

**Then the operator named the other action: an app was uninstalled, after the
force-stop** (§7b5). That explains P19's silence — a stopped package is excluded
from broadcasts until launched, so the route was switched off by the platform while
it was being tested, and the test was null by construction. It also **withdraws
§7b4's guess at P20's mechanism**: a launch followed that stopped window and
released a `BOOT_COMPLETED` but no `PACKAGE_REMOVED`, so it is not a queue of missed
broadcasts being replayed. P20's correlation is untouched; only the explanation was
wrong.

**P21's first fix is built, rebuilt as a scan, and has now run for real** (§7b6, §7b7, §7b9). On 2026-09-28 an uninstall performed while the app was force-stopped reached no broadcast at all, and the next scan reported it: 484 → 482, both packages named, one alert under `device-watch.packages-changed`. The scenario that exposed the gap is the scenario that closed it. **The package rule's loop then closed end to end** — the operator answered that both removals were theirs, the answer is in the journal citing the alert, and a second `raiseAlerts` returns zero because the alert was already raised rather than because the answer taught the rule anything (DR-8). The
**installed-package set** is compared against history like the three grants, so a
package *broadcast* that never arrives is recoverable — which demotes
`signal:…PACKAGE_*` from load-bearing to prompt — and **P19's refutation
(§7b10) then showed that route never delivered at all**, so the scan is the whole
mechanism and the interval is the detection latency for a new app. It rides its **own event type on its own cadence**, `grants.packages`,
rather than a field on every observation: enumerating every package is hundreds of
`PackageInfo` objects over a binder transaction, and the three grant reads are two
settings lookups and a service call, so one cadence was being forced on two things
that do not share one. Three triggers, none needing a service: a package broadcast
(always), any wake where the last scan is older than 12 h, and a button. It had to
be a separate *type* because the comparison finds the last **scan** by
`lastOfType` — looking up the last observation would find one with no package
fields, read that as no history, and re-baseline for ever — and because an
observation that skipped the read would have had to record it as `Readable: false`,
which is *could not* where the truth is *did not*. It is deliberately **not** a fourth grant:
`installedPackage` is outside `Grants.GRANT_KINDS` and `ruleFor` routes it to a
second rule, `device-watch.packages-changed`, because an app appearing is not an app
being given power and the rule name is what a person reads first. It cost a second
permission, `QUERY_ALL_PACKAGES` — stated plainly, since it is the permission a
surveillance app would want — and every reading records the **scope** it was taken
under, with a refusal to compare across a change in it, so dropping the permission
re-baselines once instead of reporting two hundred uninstalls that never happened.
**P22** is that, untested on the device. P21 stays open and its window is now
**wider by choice**: an install undone between two *scans* is invisible, where a
per-observation field would have needed only two wakes. The scan interval is the
resolution of this signal, 12 h is a guess labelled as one, and the journal will say
how often it actually fires.

**The asymmetry those two accounts expose is the more important finding** and is
recorded as **P21**. Routes that compare a set against history self-heal — the next
process start catches what was missed, whenever it comes. A route that reports an
*event* has no state behind it, so what it misses is gone, and nothing records that
it was missed. The same gap exists with no force-stop anywhere: an app installed,
granted a listener and uninstalled between two process starts leaves the grant set
where it began, and the reading says `changed: false`.

The same import exposed a limit of the loop rather than a defect in it. A fresh
container replayed the 28 device events into an empty journal and re-derived
every Observation and alert from the events alone — but the operator's earlier
`dismissed` answer did not return, and could not: answers live in the machine
lane, which no export carries, and the replay mints **new** alert ids, so even a
surviving answer would cite an id the journal does not hold. Deriving an alert's
identity from the change it describes is the fix, and it is a design change.

**The loop has a home and a command.** `scripts/device-import.mjs` imports an
export, raises what the rule finds and records an answer, against a journal at
`~/.orb/journal` — outside the repository, never committed, on the machine that
made it. **Outside meant outside the repo, not outside the container:** a home
directory in an ephemeral session dies with it, which is how the replay above came
to be run from empty.

**What remains is the device.** The connector has no driver. Sync does not exist,
so the export is a file the operator carries. And `Capability.md`, `Action.md` and `Policy.md` are still Draft, which is
where DR-5's intent chain and DR-7's seven days belong.
