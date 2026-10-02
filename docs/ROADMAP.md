# Roadmap

> Status: Phase 1 architecture. Reviewed before implementation.
> The phased delivery plan for Orb. Phases are sequential; none is skipped.

---

## Principle

> The architecture is permanent. The implementation is replaceable.

Each phase produces a reviewable artifact and a gate. We do not begin a phase
until the prior gate is accepted. We build the **smallest correct implementation**
that preserves the long-term architecture, and we never optimize prematurely.

---

## Phase 0 — Foundation  ✅ complete

Repository structure and governance, versioned from day one.

- Repository tree (`apps/`, `runtime/`, `platform/`, `packages/`, `docs/`,
  `tests/`, `scripts/`, `tools/`, `.github/`).
- Root documents: `MASTER.md`, `CLAUDE.md`, `README.md`, `.gitignore`.
- `CONSTITUTION.md` held as a deliberate placeholder; `LICENSE` since settled
  as Apache-2.0 (see `NOTICE` for the one package with a GPL toolchain).
- Git initialized; first commit recorded.

**Gate:** structure exists; no implementation. *Passed.*

---

## Phase 1 — Architectural Documents  ✅ complete

The `/docs` specifications that define the architecture, with the three frozen
decisions incorporated (HLC ordering, replay-vs-determinism; license since
settled as Apache-2.0).

- `SYSTEM_OVERVIEW`, `RUNTIME_LOOP`, `EVENT_MODEL`, `EVIDENCE_GRAPH`,
  `DIGITAL_TWIN`, `AGENT_RUNTIME`, `CAPABILITY_MODEL`, `STORAGE`,
  `SYNC_PROTOCOL`, `SECURITY`, `ROADMAP`.
- **Amendment:** `RUNTIME_LOOP.md` added to define the system's *dynamics* — the
  continuous Sense→…→Learn loop, the three planes (Reality / Knowledge /
  Execution), and "nothing is live." `SYSTEM_OVERVIEW` updated to reference them.

**Gate:** documents reviewed and accepted. *Passed.*

---

## Phase 2 — Constitution  ✅ complete

`CONSTITUTION.md` ratified: originally 36 laws across nine articles (History; Truth
and Interpretation; Models and Reasoning; Distribution; The Runtime; The Three
Planes; Capabilities and Human Agency; Ownership and Trust; Engineering). Since
extended additively (Article X — The Kernel; Article XI — Reality and Confidence;
Article XII — Identity and Continuity) to **47 laws across twelve articles** during
the Phase 3 kernel and domain reviews.
Includes the laws decided during Phase 1 framing and the continuous-observation /
three-planes invariants from the Phase 1 amendment.

**Gate:** constitution ratified. It changes rarely thereafter; everything follows
it. *Passed.*

---

## Phase 3 — The Kernel & Contracts  ◀ current

Expanded: rather than freeze loose interfaces, define the **Orb Kernel** — the
minimal, permanent contract surface every implementation must preserve.

**3a — `KERNEL.md` (current).** Six domains, 30 contracts, each with exactly four
sections (Purpose, Responsibilities, Invariants, Dependencies). No methods,
fields, or language. Governed by Article X (kernel evolves through addition,
never mutation; v1 contracts permanent). *(Count is post-review: the Intelligence
domain review removed `Memory` and `Reflector` and added `InferenceRecord`, net 31 → 30.)*

- Reality: `Sensor`, `Observation`, `Attachment`, `Event`
- Knowledge: `Evidence`, `Entity`, `Fact`, `Belief`, `Prediction`
- Identity: `DigitalTwin`, `Relationship`, `Project`, `Goal`, `ContextSnapshot`,
  `LiveContext`, `IdentityEvolution`
- Intelligence: `InferenceRecord`, `Retriever`, `Reasoner`, `Planner`
- Execution: `Capability`, `Action`, `Policy`, `Scheduler`, `Agent`
- Infrastructure: `Journal`, `Storage`, `Synchronization`, `ModelRouter`,
  `Encryption`

**Gate (3a):** kernel accepted.

**3b — Contract specifications.** After the kernel is accepted, each contract
receives its own document under `contracts/` (e.g. `contracts/Event.md`) defining
Semantics, Lifecycle, State transitions, Invariants, Versioning rules,
Compatibility guarantees, Failure modes, and Examples.

**Gate (3b):** every contract specification accepted. **Accepted 2026-09-29** — 30 of 30, by the
operator (`DECISIONS.md` DR-13). Phase 3c is open.

**3c — Implementation interfaces.** Only after every contract spec is accepted are
implementation interfaces written in TypeScript or Kotlin. Each package carries
`README`, `DESIGN`, `API`, `TESTS`.

---

## Phase 4 — Runtime Skeleton

Only after contracts are accepted. The **first executable component is the Event
Journal** — the single source of truth that everything else depends on.

- Append-only, single-writer-per-lane journal.
- HLC stamping and `(hlc, lane)` derived ordering.
- Hash-chained integrity.
- Replay to a trivial projection (proof of reconstruction).
- Unit tests before integration tests; every module compiles independently.

**Gate:** the journal runs, replays deterministically, and everything else can be
built to depend on it. **Met** — `runtime/journal`, 26 tests.

---

## Beyond Phase 4 (indicative, not yet committed)

The order below follows the dependency direction of the architecture pipeline.
Details are settled at each phase's own gate, not now.

1. **Evidence Graph** projection over the journal.
2. **Storage** hardening (encryption at rest, projection rebuild).
3. **Sync** between two devices (anti-entropy lane replication).
4. **Knowledge Engine + Digital Twin** (first interpretation layer).
5. **Agent Runtime** with an injected local Reasoner (model-independent).
6. **Capabilities** with the permission-tier gate.
7. **Reflection + Continuous Learning** loop closure.
8. **Apps** (`mac`, `pixel`) as device-native runtime hosts.


---

## The personal runtime on Android — audit and proposed order (2026-09-29)

> Status: **proposed, for the operator's ordering.** It changes no architecture; it
> orders work the architecture already permits. `DECISIONS.md` DR-13 opened this
> work ("one step at a time, so no debts pile up"); DR-14 fixes what the assist
> overlay may capture. Where a step needs a decision, the decision is named and is
> the operator's.

### What Orb does for a person today

Two things, and only two. **It keeps what you deliberately share** — text, links,
photographs — sealed on the phone under a key that can be destroyed, with a record of
where it came from. **It tells you when something gains power over the phone** — an
accessibility service, a notification listener, a device admin, a new app — and records
your answer. It does not yet remember anything on its own, cannot be asked anything,
and does nothing on your behalf. Every step below exists to move one of those three
statements.

### Audit — what was open, and where it now stands

| Open item | State | Disposition |
| --- | --- | --- |
| Assist steps 1–4 (share sensor, grants declared, probe, its results) | **Done**, verified on device | closed |
| Assist step 5 — declaration, retention, allow-list | **written 2026-10-01** (`SENSOR_ASSIST.md`; DR-14 rulings 7–9): empty allow-list edited from an Orb screen, text kept until deleted, a capture needs structure *and* screenshot. **Three proposals await a yes** (payments floor, descriptions excluded, 3 s timeout) | confirm §10 |
| Assist step 6 — erase one capture on the phone | **closed 2026-10-01** (`DEVICE_LOOP.md` §7b46–§7b49): all five predictions held on the device — kept while another item cites it, key destroyed with the last (`attachmentKeysHeld` 5→4, `attachmentsDestroyed` 1→2), the same bytes refused as `erased`. Boundary: AD-12 | closed |
| Shared text sealed and searchable (pending item 2) | **verified 2026-10-02** (`DEVICE_LOOP.md` §7b60, v25): shared words are sealed like a screen's, searchable and erasable in Recall, carried by backups; AD-12's first row narrowed to words shared before v25 | verified |
| Keep erased words again, by the person's confirmation (DR-17) | **verified 2026-10-02, bar the Not-now tap** (`DEVICE_LOOP.md` §7b61, v26): shared text and remembered screens; fresh key, cites the erasure; pictures/files and the desk are AD-16 | verified |
| Assist step 7 — invoke → card → *Remember* | **closed 2026-10-01** (§7b50–§7b51): part 1 P39–P44; part 2 P47–P50 held on the device (P46 and P51 are visible only on the phone; P51 not yet exercised on a login screen). Text only, sealed, erasable, refused when erased | closed |
| Probe leftovers: settings-off behaviour, a game (P29), recognition-stub necessity, flag bit 256 | **closed 2026-10-01** (`DEVICE_LOOP.md` §7b44–§7b45): the stub is **required** (P30 refuted); text off withholds structure and screenshot; flags are not a promise; a game gives no text; screenshot-off alone not measured and not needed; flag 256 unknown by design | closed |
| `Shares` extraction on device | **closed** 2026-09-29 | closed |
| An export cannot say which build wrote it | **closed 2026-10-01** — the v9 export's start event carries `versionCode: 29845625` (`DEVICE_LOOP.md` §7b44) | closed |
| AD-11 backup | **finished in the tree 2026-09-30:** `allowBackup="false"` alone does not stop device-to-device transfer on Android 12+ (Android's own wording), so both builds now carry `dataExtractionRules` excluding every domain from both sections, with a test. Retired builds keep the default | on device with v9 |
| Phone loss with backup off | the export in Downloads is the only copy until sync exists | needs a decision (below) |
| AD-7 whole-package-list read outside the Capability boundary | **deferred** by DR-13 to the general Capability mechanism | waits for Phase 3c |
| AD-6 source independence | reframed; revisit when two mobile sources report on one fact | **will bite** at the first second source |
| AD-9 pass 1's chain break | parked; pass 1 is retired | none |
| AD-1, AD-2, AD-3, AD-10 | open by design, **v2** | none for v1 |
| P21 — a change undone between two scans is invisible | recorded limit | small, real; see track D |
| 12-hour scan interval | a guess, now load-bearing (no prompt route exists) | a decision |
| **Nothing after the journal is built** — Evidence Graph, Entities, Twin, Reasoner, Agent | contracts Accepted, no code; Phase 3c open | the largest item — track B |
| **Where the brain runs on the phone** | the kernel is TypeScript; the phone runs Java capture code, and `DEVICE_LOOP.md` R2 names Kotlin as the production host. A laptop can never be required, so this cannot stay open | **decided 2026-10-01 (DR-16): Kotlin** |
| Whether the first reasoning step is local-only | **decided 2026-10-01 (DR-16): rules, no model, on the phone** | closed |
| Order of further senses | open since DR-13 | decision, track C |
| `STATE.md` counts stale (304 tests) | **fixed** in this change | closed |

### The order

**Track 0 — small closes (do first; each is under a day).**
Version code in `orb.process.start`; the remaining AD-11 check; one short probe round
for the untested rows. *Use:* an export you can trust to say what wrote it, a
promise about backup that has actually been checked, and an overlay that behaves
correctly when you have switched the screen-text setting off instead of pretending it
captured something.

**Track A — the assist overlay (agreed).**

| Step | What it is | How it makes Orb useful |
| --- | --- | --- |
| **A5** | The written declaration: what the overlay reads, the allow-list and how you edit it, how long text lives | Turns "Orb reads my screen" from a worry into a promise with limits, and a promise the tests can enforce |
| **A6** | Erase one capture on the phone — destroy its key | You can delete something Orb remembered and it is *actually* gone; without this, nothing may be stored from a screen |
| **A7** | Invoke → card → *Remember* (text only, allow-listed apps, per invocation) | **The first daily use:** one gesture from a message, a page, a ticket, a work document — Orb keeps it with where it came from |
| **A8** *(agreed 2026-10-01; built, not yet run on the device)* | **Recall** — list, search by words, filter by app, read and erase what you remembered; search by opening each item (DR-15, AD-13); the screen is secure (`DEVICE_LOOP.md` §7b52) | **A useful thing:** you can get back what you kept, which is what makes remembering worth doing |

**Track B — the missing middle (the brain).**

| Step | What it is | How it makes Orb useful |
| --- | --- | --- |
| **B1** | **Decided 2026-10-01 (DR-16): Kotlin on the phone, shared test vectors with the TypeScript reference, rules before any model; the toolchain is proved to build (AD-14).** Was: where the reasoning layers run on the phone and whether the first reasoning step is local-only | Everything below depends on it; without it the middle exists only on a laptop, which can never be required |
| **B2** | **B2a built 2026-10-01 (the phone writes its own Observations; `PHONE_BRAIN.md`), verified on the device; B2b graph: built in TypeScript and Kotlin, identical on real exports; B2c Recall provenance verified on the device — its first caller. Shared pictures can now be seen in Recall (verified on the device); reading words out of them (OCR) is a separate, undecided step.** Evidence Graph over Observations | Every captured thing becomes evidence with a source and lineage, so Orb can answer *where did I get this* — and it is where AD-6 is decided honestly |
| **B3** | **Slice 1 verified on the device 2026-10-02** (`ENTITIES_PHONE.md`, DR-19): handles — phones, sites, UPI ids, emails, amounts, dates — computed, never recorded; people/places/organisations wait for a model or B5. Entities and Relationships — people, places, organisations, dates | *Everything about Ravi*, *everything about this trip*; the step from a pile of notes to a memory |
| **B4** | **Two steps built: a reminder you set by hand (verified), and Orb proposing dates ahead as a computed view (Coming up, `COMING_UP_PHONE.md`, DR-21 — verified on the device bar the dot); next: relative days like "Friday", then names.** **The first workflow, chosen by you** — messaging, travel, content or work were named; a good first one is **commitments** ("I'll send it Friday") or **trips** (booking → dates → reminder) | **The first time Orb does something for you without being asked to remember it** |
| **B5** | **Built for the first action 2026-10-02, verified on the device** (`GATE_PHONE.md`, DR-20): a reminder you set, through a gate that records what it stops; the package scan and the assistant's reads are now declared beside it (DR-22, verified on the device) — AD-7 closed on the phone. The Capability → Policy → permission gate for anything that *acts* (this is what resolves AD-7) | Orb may notify, remind or draft only with your permission, recorded, revocable; also the moment the package scan gets its proper gate |

**Track C — more senses (order is yours to set).**
Candidates named so far: photographs, voice notes, calendar, notifications, device
context. Each is a source of *what happened* that needs no gesture from you. Two
consequences to weigh before ordering: **payments are excluded from screen capture on
the premise that they can be derived from text, and no text source exists yet** — so the
notification or message sensor is what makes that premise true; and a notification
listener is the very power the grants watch reports on, so Orb would be watching
for something it holds itself, which it must record openly. Adding a second source
for one fact is also when AD-6 stops being theoretical.

**Track D — the protection signal, sharpened.**
Decide the scan interval; record the blind window so *nothing happened* and *something
happened and was undone* differ (P21); give the package scan its gate (with B5). *Use:*
the alert you already have becomes one you can rely on, with a stated
latency.

**Track E — durability.**
With platform backup off, **the phone is the only copy** until sync exists, and sync
needs a second place to hold a journal. A laptop can never be required, so the
candidates are a second phone or a zero-knowledge relay (`Synchronization`,
`Encryption`). Until then, ~~*export* is the backup~~ — **corrected 2026-10-01: an export carries the journal only, never the sealed words, pictures or keys (`DURABILITY.md` §1)**, so it is a record for a laptop and not a way to get a phone's memory back; a passphrase-protected backup file is **built and restored on the device (Step 1)**; automatic backup into a chosen folder is Step 2. *Use:* losing a phone no longer loses the memory.

**Recommended order:** Track 0 → A5 → A6 → A7 → A8, with **B1 decided in parallel**
(it is a decision, not work) → B2 → one sensor from track C → B3 → B4 → B5. Tracks D
and E interleave when their decision is taken. Nothing in v1 needs AD-1, AD-2, AD-3 or
AD-10.

**What would change this order:** if you would rather Orb *do* something before it
remembers broadly, B4 can move forward using shares alone — at the cost of a narrower
first workflow.

---

## Standing Rules Across All Phases

- Local-first, model-independent, event-first, evidence-first — always.
- If an architectural concern is discovered, **stop and surface it** before
  proceeding.
- Do not revisit frozen decisions unless a fundamental flaw is found.
- Optimize for clarity, determinism, and decades-long maintainability over
  short-term convenience.
