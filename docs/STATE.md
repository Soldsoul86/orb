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

`contracts/` holds **all 30 kernel contracts, and as of 2026-09-29 all 30 are
Accepted** — the last eighteen reviewed or ratified in one day: Infrastructure (5),
Execution's `Scheduler` and `Agent`, Intelligence (4) and Identity (7). **The Phase 3b
gate condition — every specification accepted — is met.** **The operator accepted that gate the same day** (`DECISIONS.md` DR-13), so Phase 3c
(implementation interfaces) is open; the work is the Android personal runtime, one
step at a time. Two kernel edges were removed on the way (`Scheduler → Policy`;
the earlier `ModelRouter → Policy` under DR-9), and one deferral was recorded as debt
(AD-10, facets); the attachment store was folded into `Storage` without a new contract.
`docs/` is roughly 9,400 lines across 24 documents. By its own `ROADMAP.md`, Orb
is in **Phase 3, the Kernel and Contracts**, with two amendments running beside
it.

### What exists as code

Roughly 11,800 lines of TypeScript and 7,600 of Java (measured 2026-09-29, after the trade-executor experiment was removed as not part of Orb). **342 TypeScript tests, 0 failing** (plus 115 phone-side JVM checks for pass 1 and 60 for the assist probe);
lint clean; every package compiles independently.

**The kernel.**

| | | |
| --- | --- | --- |
| `runtime/journal` | ~8,900 | the Event Journal: hash chains, HLC ordering, envelopes v1/v2, erasure, partial replication, sync, Attachments |
| `runtime/observation` | ~400 | occurrence, not truth — inv. 3, 5 and 7 enforced at the boundary |
| `packages/connector` | ~550 | connector Sensors: the call, the synthesis, the outcome ladder |
| `packages/device-watch` | ~700 | the first closed loop: import, projection, one rule, an alert, an answer |

**The device loop.** No Gradle and no libraries anywhere in it:
an instrument that pulled in a framework could not say whether a death was the
platform's or the framework's.

| | | |
| --- | --- | --- |
| `apps/pixel/pass1` | ~1,650 | foreground-service and journal survival; the 21-hour run |
| `apps/pixel/pass2` | ~730 | the grants signal; recording since 2026-09-26 |
| `apps/pixel/probe-grants` | ~640 | the throwaway that answered P12–P14 |
| `apps/pixel/probe-assist` | ~970 | Step 4: what Android hands an assistant app, per target app, metadata only (`DEVICE_LOOP.md` §7b41–§7b42, P23–P29). Run 2026-09-29 |

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
| **P23–P29** | **run 2026-09-29** (`DEVICE_LOOP.md` §7b42, `apps/pixel/probe-assist`). **Held:** selectable and bound with no permission (P23); the gesture reaches it with structure and screenshot (P24, default settings); ordinary apps deliver text and are correctly attributed (P25); latency 5–268 ms (P28). **Half:** Chrome supplies the page URI but no per-node domain (P27). **Refuted, and it matters:** a payments screen delivered a real screenshot — *the app decides what is protected, not the platform* (P26). **Untested:** the text/screenshot settings toggled off, a self-drawing app (P29), whether the recognition stub is required. **Follow-up rounds 2026-09-30/10-01** (§7b43–§7b45): text off withholds structure and the screenshot (P31, held, switch recorded); a game that does not opt out delivers 7 nodes and no text (P29/P33 held); the flags never follow the switches; screenshot-off alone not measured; the stub-less build was never bound (reason unconfirmed, P30) |
| **the signing key** | the keystore in the build environment does not match the pass 2 installed on the phone. That install can never be upgraded, only removed, and its journal goes with it. The new build runs beside it as `dev.orb.pass2b` on lane `grants-b` |
| **the scan interval** | 12 h is a guess, now tunable against a measurement: a scan costs **16.7 KB** (484 packages), 10.5× an observation, so at two scans a day the scans are 33 KB of the journal's 42 KB/day. Halving the interval roughly doubles the journal. Too long and an install sits unnoticed for half a day when the broadcast was silenced; too short and it costs battery and bytes for a set that rarely moves |
| ~~**Attachment**~~ | **implemented 2026-09-26** — identity, blinded address, per-Attachment keys, the destruction guard. 20 tests, five controls |
| ~~**Observation**~~ | **implemented 2026-09-26** — `runtime/observation`, with inv. 3, 5 and 7 enforced at the boundary. DR-7 tier 2 is wired into the connector |
| ~~`Capability.md`, `Action.md`, `Policy.md`~~ | **Accepted 2026-09-28** (`reviews/EXECUTION.md`). Ruling 1 taken — standing authorization only where waiting would defeat the action's purpose; AD-5's two State→Service edges corrected in `KERNEL.md`; DR-5's chain folded in and discharged; the authorization record specified with a **derived** identity; Art. VII §29 vs XI §41 named rather than settled quietly |
| **`Synchronization`** | **Accepted 2026-09-29** (`reviews/INFRASTRUCTURE.md` verdict). Semantics demonstrated by `importExport` (group by lane, verify, skip held, adopt tail); the contract is ahead of an automated transport, not ahead of its meaning. Three edits on review: **inv. 12 (never self-initiating)** — sync is dispatched by the `Scheduler`, never self-waking (Art. V §21), gaining no dependency (`Scheduler → Sync`); the **unit of resumption is the lane**, from the last durably-adopted event; §7 names `orb.erasure` + `confirmationsFor` as the confirmation record (it always existed — `RECORDS.md` §1). `Encryption` edge kept (zero-knowledge relay + inert-ciphertext erasure both rest on it). **Owed to the `Scheduler` review:** `Scheduler.md` must list sync among dispatched work. Standing finding unchanged: retention machinery (`evaluatePrune`) is complete but unreachable until a peer lane arrives. **15 Accepted / 15 Draft** |
| **`Journal`, `Storage`** | **Accepted 2026-09-29** (`reviews/INFRASTRUCTURE.md` verdict). Reviewed against the running implementation (672 tests green) and adjudicated: Journal's direct `Encryption` edge kept and documented as **erasure key-destruction** (not at-rest, which is `Storage`'s); `detach` reclaims-bytes accepted as an absolute a non-erasure-capable store must *declare*; size/growth confirmed out of scope (managed by `detach` + projections). **Gap 1 ruled:** the attachment store is a **second store of the same `Storage` contract** (address-keyed shape), its keyring `Encryption`'s — kernel stays thirty. The **envelope v2 migration landmine** survives into the accepted `Journal.md` §5. Two Draft → Accepted: now **14 Accepted / 16 Draft** |
| **`Scheduler`, `Agent`** | **Accepted 2026-09-29** — with these the **whole Execution domain is Accepted** (5/5; `reviews/EXECUTION.md` verdict). Ruling: **`Scheduler → Policy` dropped** (operator) — Policy is State that never schedules, the scheduler never consults permission, the AD-5/DR-9 shape; `KERNEL.md` + `Scheduler.md` now read `Depends on: Agent`. Starvation legibility given its mechanism (a pending task's age = `now` − triggering-event timestamp, from the projection). Unbindable record resolved as its own type `orb.intent.unbindable` (`unbindable.ts`, `RECORDS.md` §3). Scheduler/Agent kept as two contracts (Art. V §21 is the who-wakes/who-works split). Sync reciprocal discharged: Scheduler names sync as maintenance work it times, carried through an Agent. **19 Accepted / 11 Draft** |
| **`ModelRouter`, `Encryption`** | **Accepted 2026-09-29** — with these two the **whole Infrastructure domain is Accepted** (`reviews/INFRASTRUCTURE.md`). Router built on DR-9 (resolving is not emitting; one egress; `Policy` edge dropped); on review its *rechecked-not-remembered* gained a bound (every interpretation records the capability established for it, none inherits a prior request's). Encryption's claims are backed by running code (three key states + re-mint refusal, blinded addressing); inv. 12 scoped to *no other Orb **Service*** (hardware keystore is a port, not an edge); the **confirmation oracle accepted as named** — salting is foreclosed because content-addressed agreement (`Attachment` inv. 8, `PARTIAL_REPLICATION.md` §3) already depends on the plaintext-committing hash. Revocation record resolved: `orb.device.revoked` (`revocation.ts`, `RECORDS.md` §2). **17 Accepted / 13 Draft** |
| **`InferenceRecord`, `Reasoner`, `Planner`, `Retriever`** | **Specs Accepted 2026-09-29** — the **Intelligence domain review** was already Accepted (decisions frozen: keep these four, remove `Memory` + `Reflector`, defer `Claim`/durable-`Plan`); the four spec files were verified against those frozen decisions and flipped. All four faithful: provenance-not-process, `InferenceRecord` as the only State contract (deps `Evidence`), the `LiveContext → Retriever → Reasoner → InferenceRecord → Planner → [Execution]` pipeline, `Planner` emits intent and never binds. Two disclosed open seams, neither a blocker: `Reasoner` §3 leaves the DR-9 carrier (Reasoner vs Agent) open; `InferenceRecord` inv. 7 lineage-in-`causes` is *followed, not enforced* (no payload-schema validation yet; `planErasure` catches breaches after the fact). Cross-domain deps on frozen-Draft Identity contracts (`Goal`, `DigitalTwin`, `LiveContext`) — the established pattern (`Agent` already depends on these while Draft). **23 Accepted / 7 Draft** |
| **Identity — `DigitalTwin`, `Relationship`, `Project`, `Goal`, `ContextSnapshot`, `LiveContext`, `IdentityEvolution`** | **Specs Accepted 2026-09-29 — Phase 3b gate condition met (30 / 0).** The domain review (round 2) was Accepted but held on three follow-ups. Q2 (LiveContext frames, Retriever ranks within) and Q3 (IdentityEvolution *references* `InferenceRecord`, audit not truth) were settled by the Intelligence review; **Q1 confirmed by the operator — facets stay a derived view inside the one Twin**, promotion tracked as **AD-10**. Verified: acyclic State graph with `DigitalTwin` as the single top aggregate, no State→Service edge (`LiveContext` is the only Service and depends on the Twin), a replay test in every spec, no stale `Memory`/`Reflector` references, Art. XII §44–47 in the Constitution. `LiveContext.md` now states its boundary with `Retriever` from its own side. **30 Accepted / 0 Draft** |
| **The review's open items** | **Worked through 2026-09-29.** **Decided:** DR-12 — the `Agent` carries a remote-model request to `Policy` (Intelligence stays powerless); consent is per provider, the exact version still recorded. **Gated:** a producer marks a conclusion with `derivation(…)` and the journal refuses one that cites nothing — an unmarked or incomplete one still passes, so it stays policy, not invariant. **Declared:** every store states its `ErasureGuarantee` (`key-destroyed` for `sealedStore`, `bytes-unlinked` for file and memory) and `planErasure` reports it under D7, bound into the plan digest. **Met:** the TypeScript journal already writes v2 safely; the phone's `lastOfType` now reads the real type from the line's structure and refuses an unreadable one, and both sides check one shared legible-types list (the phone was missing `orb.device.revoked`). **Unchanged by decision:** the confirmation oracle; AD-1, AD-2, AD-3, AD-10. **Blocked:** erasure confirmations, pruning and revocation reach need another device's lane — custody receipts are written only by sync, the phone has no inbound path, and pruning needs two *other* holders. Unblocked by a second Orb device plus an inbound path on the phone, not by more record types |
| **Follow-ups from step 2 (share → Observation)** | Both are recorded here so they are not found later. ~~**(1) The `Shares` extraction is not yet verified on a device.**~~ **Closed 2026-09-29 on the export after installing v8:** the new share (`orb-20260929-125724.txt`, 49 events, `verifyLane` clean) has exactly the field set of the two earlier stored-attachment shares, imports as the fifth `orb.sensor.share` Observation citing its attachment, and re-import is a no-op. **One caveat that stays:** an export does not record which build wrote it (`orb.process.start` carries no version code), so "this is v8" rests on the order of events and not on the file. Recording the version code in `orb.process.start` would close that; not done. ~~**(2) Grants readings from `dev.orb.app` are labelled `pass2@<install>`.**~~ **Closed 2026-09-29 (step 3):** the grants watch is now declared as a sensor (`docs/SENSOR_GRANTS.md`) and its readings are sourced `orb.sensor.grants@<install>`, the convention for every sensor. Verified on the real export: 9 readings from `dev.orb.app` and 44 from retired pass 2 B, none labelled `pass2`. Two retired pass-2 builds shared the handset name and so share a label, as they did before (AD-8's original problem). |
| **Step 6 — erasure on the phone** | **Closed 2026-10-01, verified on the device** (`DEVICE_LOOP.md` §7b46–§7b49). *Kept by Orb: erase* declares first, then destroys the key; content another readable item still cites stays until the last is erased; the same bytes arriving again are refused (`erased`, never `unfetched`). On a real phone: five declarations, each naming a real event, each confirmed by the phone; the store's own counts moved 5→4 keys and 1→2 destroyed. Mutation-checked off-device (45 checks) and cross-checked against a fixture the phone's code wrote. **AD-12:** only sealed attachments are erasable on the phone — shared text and every clear payload are not, and the desk does not yet act on a declaration |
| **Step 7, part 1 — Orb as the assistant** | **Closed 2026-10-01, verified on the device** (`DEVICE_LOOP.md` §7b50: P39–P44 held, P45 consistent; `orb-app-v12-assist.apk`). The service, session and recognition stub live in Orb; the five checks are one pure function (app checked *before* its screen is read); a payments floor refuses ten packages even if allowed; declines name a reason and never the app; the allow-list is a projection of events and starts empty; *Remember* is **simulated** — it records counts, keeps nothing. 99 off-device checks, with a source-scanning guard that was strengthened after a mutation slipped through it. **One difference from the ruling to confirm:** apps are allowed from the assistant card, not from a list of every app (that would flood the install alert; `SENSOR_ASSIST.md` §4) |
| **`orb.sensor.assist`** | **Declared 2026-10-01, before any code that stores** (`docs/SENSOR_ASSIST.md`, unreviewed). The assistant gesture on an allowed app, then a tap: Orb keeps the screen's **text** sealed, never a picture. Every claim about what the platform delivers is a probe measurement (§7b41–§7b45). The stub-less build was not offered by the chooser, so the recognition stub is required (P30 refuted) |
| **`orb.sensor.grants`** | **Declared 2026-09-29, after the fact** (`docs/SENSOR_GRANTS.md`, unreviewed). The grants watch has run since 2026-09-26 without a declaration; it now has one: *what holds power over this device* (accessibility services, notification listeners, device admins) plus the installed set as a comparison set gated by a recorded grant. **One sensor, not two** — the two event types differ in cost and cadence, not purpose, and what needs authorizing is the *read* (a Capability), not the sensor; the alternative is one extra id and no change to any phone record. §4 fixes the **naming convention for every sensor**: `orb.sensor.<name>`, and an Observation's source is `orb.sensor.<name>@<install>`. `grants.exits`, `grants.capability.*` and `grants.watch.failed` stay Events — about Orb itself, not the world. **Does not close AD-7**: the package scan's own declaration, tier and Policy rule wait for the permission code |
| **`orb.sensor.share`** | **Built, and turned into Observations 2026-09-29** (`SENSOR_SHARE.md` §4, §4a; `DECISIONS.md` DR-13). The phone's `orb.shared` device event now becomes an Observation with source `orb.sensor.share@<install>`, confidence 100 for the occurrence (never the content), and stored content referenced by identity. **The spec was changed to match the phone, not the reverse:** history is immutable, so the shipped field names stand, and the source is derived from the event's type and device (fixed at write time — what `AD-6` needs — with no new field). The phone's record-building moved into `Shares.java.in`, which touches no Android, so the test fixture is **generated by the code the phone runs**; a test reads that file and fails if the phone writes a field the importer has not decided about (proven to fail). **Checked on your real export:** 4 shares → 4 Observations, the two stored photos carry one attachment identity each, re-import is a no-op, and the grants readings are unaffected. Only occurrences in the world are Observations; the phone's process starts, exits, capability grants, resolve attempts and exports stay Events. **As declared:** The first sensor written declaration-first rather than decided in a manifest — which is the test AD-7 failed. Result of writing it: **receiving a share is not a `Capability` at all**, because Orb reaches for nothing; the Capability boundary falls on *resolving* the reference, and fetching a shared URL is egress at *Act (irreversible)* under DR-9's reasoning. Sharing a link is not authorization to visit it. Needs only Accepted contracts; everything it must not do needs Draft ones |
| **`CLAIMS.md` §5 Ruling 2** | **Proposal recorded and revised 2026-09-28, not adopted.** The laptop vantage is **rejected** — India-first and Android-first means a second machine can never be a requirement, and the same objection retires `SOVEREIGN_STACK.md`'s router, which cannot see a phone on mobile data. Replacement: **a second *channel*, not a second *device*.** A6 needs a path to the same fact the acting agent does not control — independence of *source*, which was misread as independence of *hardware*. The bank's SMS is not authored by the agent that made the payment. The bound improves too: a channel's latency (seconds) rather than a laptop's duty cycle (hours, unstated). Limit: an act with residue in no observed channel is undetectable, so the claim must **name its channels**. *(This row previously described Ruling 2 as the timing of consent; that is Ruling 1, ruled 2026-09-28.)* |
| **`grants.exits`** | **Built, installed, fixed and verified 2026-09-28** (`DEVICE_LOOP.md` §7b14, §7b22, §7b23). It settled P20 in a day and produced **two defects in its own first day of data**, both a field claiming more than the measurement supports — `exitsUserInitiated` removed for `lastExitReason`/`lastExitUserInitiated`, and `exitScope: "process"` now on every reading because a stop of an already-dead package records nothing. The upgrade verified itself: the new build read the old build's watermark (`baseline: false`) and the install's own `package.updated` exit exercised a reason code nobody planned to test, coming out named rather than `unmapped:16` |
| **`dev.orb.pass2` was never dead** | **Found on import, 2026-09-28** (`DEVICE_LOOP.md` §7b27). The signature-mismatched build from §7b8 — *"can never be upgraded, only removed"* — has been recording since 09-26 and its journal had **never been read**. It holds four notification-listener authority changes on 09-28 between 01:46 and 03:19, three caught by comparison at `process.start` and one by the live `settings.changed` watch — **P16 answered from one lane**. Six alerts now stand unanswered. The strongest argument yet for exporting before uninstalling: the app written off may be the one holding the signal |
| **AD-9** | **Parked 2026-09-29 (DR-13)** — pass 1 is retired; `dev.orb.app` and pass 2 B verify, pass 1 (5,877 events) is refused. Reopen only if pass 1's events are ever needed in a journal. *Original finding:* **The device and the import path disagree about a historical chain break** (`ARCHITECTURAL_DEBT.md` AD-9, `DEVICE_LOOP.md` §7b26). Found by running the import rather than reasoning about it: pass 2 B adopts cleanly, **pass 1 is refused outright** — `verifyLane` walks the whole lane and throws on §5d's permanent break at index 4, so none of its 5,757 events can be adopted. On device, §5j's `chain.noNewBreaks` tolerates the same break and passes. Consequence for consolidation: **the `.txt` exports are the durable artefact, not the imported journal** — which is also ephemeral in a session container |
| **DR-14 / AD-11** | **2026-09-29.** The assist overlay captures **no payments app**: **allow-list only**, **text only kept, no screenshot stored**, per invocation (DR-14). Found on the way: the Orb app allowed platform backup by default, so its keys and sealed blobs could leave the phone together (AD-11) — backup off since v8, and **finished 2026-09-30**: `allowBackup="false"` alone does not stop device-to-device transfer on Android 12+, so v9 also declares `dataExtractionRules` (`DEVICE_LOOP.md` §7b43). `orb.process.start` now carries `versionCode`. **Step 5 written 2026-10-01** (`docs/SENSOR_ASSIST.md`, DR-14 rulings 7–9): the allow-list starts empty and is edited from an Orb screen; text is kept until deleted; a capture needs structure **and** screenshot, the latter never stored; declined captures record a reason and never the app. **Remember stores nothing until step 6** (erase one capture on the phone) exists |
| ~~**An answer's identity**~~ | **Fixed 2026-09-28** (`DEVICE_LOOP.md` §7b28, §7b29; `Event.md` inv. 9). Derived from the **phone's own reading id** — not the local Observation, which is minted per journal and was the real source of the drift, found because the test failed one layer below the fix. Length-prefixed sha256; `gained`/`lost` excluded because they are the rule's conclusion, not its subject. An answer now crosses journals, and an alert this journal never raised can be answered. **672 tests passing** |
| ~~**Adding to an Accepted contract**~~ | **Ruled 2026-09-28, DR-11.** `Event.md` inv. 9 stays in v1; the `Event` v2 alternative was put and declined. The condition, which matters more than the instance: **an Accepted contract may gain an invariant if and only if no instance already in history becomes invalid** — checkable rather than rhetorical, because it asks for records rather than reasoning. Addition only: narrowing an existing invariant or rereading an old clause is still mutation under Art. X §37 |
| **`dev.orb.app`** | **v5 confirmed on the device** (`DEVICE_LOOP.md` §7b31–§7b38). AD-8 paid; the share sensor resolves into a sealed content-addressed Attachment; the grants watch is ported and the **capability gate works** — the refused scan, the grant with its tier and scope, and the 484-package scan are all on the record in that order. Pass 2 B now has nothing this does not do |
| **Play Protect blocks it** | **§7b38, 2026-09-28.** *Harmful app blocked*, declinable via *Install anyway* — which **answers P0b**, open since 09-25. The natural experiment: same package, same key, same day, v1–v4 with **no permissions** installed silently and v5 with `QUERY_ALL_PACKAGES` was blocked. Confounded by a new receiver and 21→33 KB, so a strong correlation across one controlled change rather than proof. **Google's heuristics independently reached the manifest's own judgement about that permission** — the first corroboration of AD-7's severity from outside this repository. **§7b39 stages the one-change follow-up** (`orb-app-v6-noquery.apk`): the same source built with `ORB_PACKAGE_SCAN=0` so `QUERY_ALL_PACKAGES` is the only variable removed — receiver and 33 KB size held. Two predictions recorded before install: a silent install (permission was the cause), and the package scan degrading to `installedPackageScope: "visible"` with a single re-baseline rather than ~200 false uninstalls — the honest-degradation claim `Watch` has argued but never run. **§7b40: both held on the device.** v6 (the permission the only change from blocked v5) installed to *"This app looks safe"* — retiring the reputation caveat and isolating `QUERY_ALL_PACKAGES` as the §7b38 cause. The scan degraded to `installedPackageScope: "visible"` (135 pkgs, one `baseline: true`, `changed: false`) — no phantom uninstalls. The experiment also caught the **grant over-claiming**: `grants.capability.granted` hardcoded `scope: "all…"` while its own scan read `visible`; fixed — `PackageAccess` now derives `manifestScope` from the APK's `requestedPermissions`. Confirmed on-device (`orb-20260928-231246.txt`, v7 installed): the grant now records `manifestScope: "visible"` matching its scan's `installedPackageScope: "visible"` — over-claim closed. A third consecutive visible scan stayed `baseline: false, changed: false`, so the single re-baseline was truly a one-time boundary |
| ~~**AD-8**~~ | **Paid 2026-09-28** (`DEVICE_LOOP.md` §7b31, `apps/pixel/orb/`). `dev.orb.app` mints **96 random bits at first run** and derives its lane from them; there is no `ORB_LANE` flag, because a flag still puts the lane's identity outside the install that writes it. Hardware fields moved from the envelope into the `orb.process.start` payload, so a W2 witness learns *that* someone wrote and nothing about the handset. `orb.export` carries `package`, following the precedent §7b30 found in probeg's own report |
| **seven installed packages, one lane name** | **Consolidating to `dev.orb.pass2b`, 2026-09-28 — and nothing is lost.** Revised order: **export each → import each into its own journal (`ORB_JOURNAL`) → then uninstall freely.** The irreversible step was never the uninstall, it was uninstalling *before* adopting; once imported, the APK holds nothing unique. Four writers get four stores, which AD-8 says is the honest representation rather than a workaround. *(Superseded plan:* (`DEVICE_LOOP.md` §7b24). Two things must happen first: **export every app before uninstalling any** — app-private storage goes with the package, and `probeg` alone holds 5,757 events including P4's whole record — and **label each export by package**, because pass 1 hardcodes lane `pixel` so four packages hold four different chains under one lane name and `replicate` will refuse them together. Renaming `pass2b` is not worth the `grants-b` discontinuity.)* |
