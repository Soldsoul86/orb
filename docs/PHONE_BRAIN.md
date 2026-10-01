# The phone's brain — B2: Observations, then the Evidence Graph, on the phone

> Status: **approved by the operator 2026-10-01** ("Yes to all three, go ahead"). **B2a built,
> not yet run on the device** (`DEVICE_LOOP.md` §7b55, `orb-app-v19-observe.apk`). B2b and B2c are not started.
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

### B2b — The graph *(after B2a is verified on the phone)*

A projection, never stored: nodes (Observation, Source, device event), edges (`derivedFrom`,
`attributedTo`; `supports`/`contradicts` read-only), and three questions — *provenance walk*,
*everything from this source in a time window*, and *forward lineage* (what cites this) for
erasure. A reference implementation in TS beside it, joined by vectors the same way. A root that
is not held comes back **not closed**, never an empty answer that looks like "nothing was built on it"
(`ERASURE.md` §3).

### B2c — Visible in Recall *(after B2b)*

Recall's detail view gains *Where did this come from?* — the app, when, and the chain — and an
erase dialog that says what depended on the item. Nothing about the text is shown outside the
secure Recall window.

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
