# The phone's brain — B2: Observations, then the Evidence Graph, on the phone

> Status: **approved by the operator 2026-10-01** ("Yes to all three, go ahead"). **B2a built
> and verified on the device** (`DEVICE_LOOP.md` §7b55, `orb-app-v19-observe.apk`). B2b and B2c are not started.
> Implements `ROADMAP.md` Track B step B2 under `DECISIONS.md` DR-16 (Kotlin for the phone's
> reasoning layers; rules before any model). Contracts: `Observation.md`, `Evidence.md`;
> `EVIDENCE_GRAPH.md` is the architecture. **No contract text changes here.**

## 1. Why this exists, in plain words

Orb can now *keep* things (a screen, a share). It cannot yet say **where a kept thing came
from** or **what was built from it**, because the middle of the system — the Observation and
the graph over it — only exists on a laptop, and only after an export has been imported. A
laptop can never be required. So the phone has to make its own Observations and answer those
two questions itself.

## 2. Two findings that shaped it

1. **The phone writes no Observations.** `import.ts` turns a phone's device events
   (`orb.assist.captured`, `orb.shared`) into Observations, in the laptop's journal. On the
   phone there are only device events.
2. **The phone's journal cannot cite a cause.** `Journal.append` hard-codes an empty `causes`
   list (v1 envelope; the field is already in the hash preimage and pinned by shared vectors).
   An Observation that cannot cite the event it came from is not an Observation by `Evidence`
   inv. 3 and `ERASURE.md` §3 (*no derivation without recorded lineage*).

A third is a limit, not a defect: **corroboration needs two sources** reporting on one fact
(AD-6). Today there is one family, so the first graph answers *provenance* only. `supports` /
`contradicts` edges are read if they exist and **no producer is built** (operator, 2026-10-01).

## 3. The slices, one at a time

### B2a — Observations on the phone *(first Kotlin on a device)*

- `Journal.append(type, payload, causes)`: the existing append gains a causes overload. The
  one-argument form is unchanged and still writes none.
- **`runtime/brain`** — a Kotlin module with no Android in it, compiled on its own:
  - `Json`: a strict reader for the journal's canonical subset (objects, arrays, strings,
    booleans, null, **safe integers only**). It refuses anything else, including trailing
    bytes and excess depth, rather than guessing.
  - `Translate`: `orb.assist.captured` and `orb.shared` → the Observation payload. The same
    rules as `assist.ts` / `share.ts`: a field of the wrong type is **left out, never coerced**;
    the attachment is carried **by identity** only.
  - `Observer.plan(lines)`: pure. From the lane's lines, the Observations that are missing:
    one per translatable device event that **no Observation yet cites**. If any line cannot be
    read it plans **nothing** and says so — *cannot check* is a reason to write nothing.
- **`Observe`** (Java shell, one file): reads the lines, asks the brain, appends each draft with
  its cause. Run at app start and after a capture or a share. It holds no state; running twice
  is harmless.
- **The importer learns to see them**: `observeReadings` currently looks for citing
  Observations only in the laptop's own lane. It must look across **every lane it holds**, or
  each phone Observation would be written a second time on import. Exports from older builds
  (no phone Observations) are translated on import exactly as before.
- **Held to the TypeScript by shared vectors**, computed by the TS translation over (a) hand-made
  edge cases and (b) the phone-written fixtures, and checked by the Kotlin one. A TS test fails
  if the committed vectors are stale.
- Device check: an export shows `orb.observation` events citing `orb.assist.captured` /
  `orb.shared` events, `verifyLane`-clean, and importing it creates **no duplicates**.

### B2b — The graph *(approved 2026-10-01 — "Yes to both"; TypeScript reference built, Kotlin port not started)*

**What exists, and what it means for this step.** `runtime/journal/src/lineage.ts` already
indexes `causes` and answers *what was built on this* (`descendantsOf`) and *what is this built on*
(`ancestorsOf`), safely (visited set, `closed` only when nothing cited was missing, "cannot say" for
an event whose lineage is unreadable). The graph is therefore **a typed view over that lineage, not a
second structure**: nothing new is stored and no traversal is rewritten in TypeScript.

**Shape.**
- **Nodes are events** (`EVIDENCE_GRAPH.md` inv. 1: every node is backed by exactly one event). A node
  is typed by what the event is: an *Observation*, a *device event* an Observation cites, or *other*.
- **One edge, `derivedFrom`, and it is exactly `causes`.** No edge exists that a `causes` entry does not
  ground (inv. 2).
- **Source and attachment are values on an Observation, not nodes** — `Observation.md`'s own attribution
  note says the source is *a value, not a kernel contract*. `attributedTo` and `holds` are therefore
  lookups (`fromSource`, `holding`), computed from the Observation's `source` and `attachments`.
- **`supports` / `contradicts` are not read.** *Correction to the 2026-10-01 plan:* the Evidence
  contract defines their meaning but **no event shape exists in code**, so reading them would mean
  inventing one. The shape is defined by the first thing that produces Evidence (which needs a second
  source — AD-6); until then the graph has provenance edges only, and says so.

**Questions it answers** (each returns `closed`, and what it could not see):
1. `provenance(id)` — the chain back from an event to what it rests on, each step typed.
2. `observationsOf(eventId)` — the Observations that cite a device event (was it observed, and as what).
3. `dependentsOf(id)` — everything built on it, typed (the erase dialog's "what depended on this").
4. `fromSource(sensor, window)` — Observations by sensor, in a time window.
5. `holding(attachmentIdentity)` — which Observations hold this sealed content (two captures of one
   screen are two Observations, one attachment).

**Time means when it happened, not when it was written.** An Observation made at back-fill time carries
a recording time of *today*; the capture it cites happened weeks ago. A window query uses the
**earliest cited device event's** clock (the occurrence). An Observation with no readable cause falls
back to its own recording time and is **flagged** (`occurredAtKnown: false`), never silently mixed in.

**Built (TypeScript and Kotlin; verified by vectors and on real exports, not yet on a device — nothing in the app calls it yet):** `runtime/evidence` (28 checks) and `runtime/brain` `Graph.kt`, held together by 483 shared questions over 9 scenarios (`tests/vectors/graph.json`, computed by TypeScript). Forward questions
are stricter than `lineage.ts`: an event that cannot say what it cites is named in `unresolved`.

**Where.** TypeScript first, as the reference: a new package `runtime/evidence`
(`buildGraph(events)` over `indexLineage`, with README/DESIGN/API/TESTS). Then the Kotlin port in
`runtime/brain` reading the phone's lines, **held to the TypeScript by vectors** whose inputs are the
phone-written fixtures — and run over the operator's real export, as B2a was. **No new APK is needed for
B2b**: it is a library nothing in the app calls yet. The on-device check comes with B2c, which is its first
caller.

**Invariants.** A pure function of the journal; rebuilt per question, never stored (a stored graph would
outlive an erase); carries no payload content — an Observation's *recorded* clear body (app, counts,
flags) and identities only, never anything from inside a sealed attachment; a root the journal does not
hold comes back `closed: false` and **named**, never an empty answer that looks like "nothing was built on
it"; cycles cannot loop it.

**Risks.**

| Risk | Held by |
| --- | --- |
| A second lineage walk drifting from `lineage.ts` | TypeScript *delegates* to it; Kotlin's walk is held to TypeScript's by vectors over real journals |
| "When" answered with recording time | The occurrence rule above, with a test where the two differ by weeks |
| An empty answer read as "nothing depends on this" | `closed` and `unresolved` on every answer; a test with a missing cause |
| A v2 event whose payload is not held | Reported as *cannot say*, as `lineage.ts` already does |
| Cost grows with the journal | Linear per question; fine at hundreds of events; recorded as a debt to revisit with AD-13's reasoning (an in-memory index, never on disk) |
| The graph leaks | Output type has no field for content; a guard test, as for the translation |

### B2c — Where did this come from? *(design proposed 2026-10-01; awaiting approval)*

**What the operator sees.** In Recall, an item's detail has the words and **Erase**. It gains a third button,
**Where from?**, which opens a small secure window in plain English:

```
You asked Orb to remember this screen.
App:            com.whatsapp
It happened:    29 Sep 2026 14:02
Orb noted it:   1 Oct 2026 16:58        (shown only when it differs by more than a minute — a back-filled record)
Built on this:  nothing yet
Same words kept: 2 times
record 01M3…V2AD
```

- **"It happened"** is the capture's own clock, never the Observation's (the occurrence rule).
- **"Orb noted it"** is the Observation's recording time, shown only when it differs, so a back-filled item
  says so rather than looking as if it were new.
- **"Built on this"** counts what the graph says depends on the item beyond its own Observation, by kind;
  today that is nothing, and the line says *nothing yet* only when the answer is **closed** — otherwise
  *"Orb could not read part of its history, so this may be incomplete"* (and how many lines).
- **"Same words kept"** is the graph's `holding`, the number of items sharing the sealed text.
- **A short record id** at the foot so an item can be tied to a line of an export. No other id is shown.
- If the item has **no Observation yet** (a journal from before v19, before its first launch pass), it says
  *"Orb has not recorded this as an observation yet."* — never a guess.

**The erase confirmations say what stays — which they did not before.** Erasing destroys the words' key; the
**Observation stays** (v19's export proved it: the Observation of an erased capture remained). So both erase
dialogs (Recall and *Kept by Orb*) gain: *"Orb keeps its record that this happened — when, from which app, how
much text — but not the words."* and, if the graph finds things built on the item, *"N things Orb worked out
from it will also be listed for you to review."* — no: **nothing is worked out yet**, so only the first sentence
is written now; the second is added when something derives from an item, and a test fails if the dependents
list is non-empty and the dialog does not say so.

**Shape.** One new Java file, `Provenance.java.in`: **the only caller of `dev.orb.brain.Evidence`**, as `Observe`
is the only caller of the Observer. It builds the graph from the journal's lines when a dialog opens (never to
draw a list), asks, and returns plain facts; `RecallActivity` / `ItemsActivity` draw them. The graph is
dropped when the dialog closes — nothing is stored. `Erasure.Item` and `Recall.Entry` gain the event `id` (the
graph is keyed by id, Erasure by hash).

**One source of truth for "kept by others".** The erase confirmation keeps deciding from `Erasure.plan` (tested,
verified on the device). The graph's `holding` is shown beside it, and **a test asserts the two agree** on every
fixture — two paths to one number is a drift, and a test is how it is caught.

**Invariants.** The window shows the app, times, counts and a short id — **no words, no address, no attachment
identity**; it is `FLAG_SECURE` like the screen it opens from (guard test, as for the other dialogs). Only
`Provenance` calls the graph (guard test). It cannot reach Attachments.

**Risks.**

| Risk | Held by |
| --- | --- |
| The wrong time shown (writing time as occurrence) | Phone-side test with a back-filled Observation weeks after its capture; the P-check on a real back-filled item (your 31) |
| *Nothing built on this* read as complete when it is not | The line is written only when `closed`; a test with an unreadable line |
| Two numbers for "kept by others" drifting | A test asserting `Erasure.plan` and `holding` agree on every fixture |
| First run of the Kotlin graph on the device | It is the first caller; P-checks below, and a `orb.provenance.failed`-style visible failure message in the window, never a blank |
| Leaking | Only app, times, counts, short id; guard test on the file and on the dialog flag |
| Cost | Built once per dialog open, ~hundreds of events; not per row |

**Predictions for the device.**

| | Prediction | If false |
| --- | --- | --- |
| **P74** | *Where from?* on a back-filled item shows **"It happened"** weeks before **"Orb noted it"** | the occurrence time is not being used |
| **P75** | On an item kept after v19, the two times are within a minute and only one is shown | the differs-rule is wrong |
| **P76** | *Same words kept* equals the count the erase dialog gives (*kept by N other items* = that number − 1) | the two sources disagree |
| **P77** | The erase dialog now says Orb keeps its record that this happened, but not the words — and after erasing, the next export still holds that Observation | the sentence is untrue (it must never be) |
| **P78** | *Built on this* says **nothing yet** | the graph found a dependent that should not exist |
| **P79** | The window is secure (no screenshot) and shows no word of the item | a leak |

**Needs a new APK** (v20); the first on-device run of the Kotlin graph.

## 4. Invariants this must keep

- **Nothing stored beside the journal.** The graph is rebuilt, so it cannot outlive an erase.
- **No content.** An Observation carries what the device event carried in the clear (app, counts,
  yes/no flags) and an attachment *identity*. The brain never opens an Attachment; a guard test
  enforces it by file.
- **Every Observation cites its cause** and is attributed (`orb.sensor.<name>@<install>`).
- **Nothing is mutated, ever.** Observations are new events; device events stay as written.
- **Deterministic**: the same lines give the same plan, in the same order.
- **One writer.** `Observe` uses the app's single `Journal`; the brain returns data and writes nothing.
- **Confidence is in the occurrence** (100): a person asked, Orb kept. It says nothing about the text.

## 5. Risks and how each is held

| Risk | Held by |
| --- | --- |
| First Kotlin on the device has never run there (AD-14) | B2a is small and its effect is visible in an export; the device check is the first thing it must show |
| Kotlin and TypeScript translations drift | Vectors from TS checked by Kotlin, over hand cases **and** real phone-written lines; a TS test fails on stale vectors |
| Duplicate Observations on import | The importer's cited-set spans all lanes; tested with a phone-written Observation in the fixture |
| The reader misreads a hostile or damaged line | Strict reader; refusal tested; whole pass declines on any unreadable line |
| Observations leak content | Output keys checked against the TS `*_FIELDS_MAPPED` lists; attachment is an identity or nothing |
| Second writer | `Observe` is the only caller of the causes append; guard test |

## 6. Not here

Package-scan (`grants.*`) Observations stay translated on the laptop (**not ported**; nothing on
the phone needs them yet). No `Evidence` events are produced. No model, no entities, no workflow
(B3, B4). No change to capture, Recall, or erasure code except the call sites that run the pass.
