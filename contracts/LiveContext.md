# LiveContext — Contract Specification

```
Contract:   LiveContext
Domain:     Identity
Kind:       Service
Version:    v1
Status:     Draft
Depends on: DigitalTwin
```

> LiveContext is the *process* that assembles the current situational frame — what is
> salient now (time, place, activity, attention) — from the Digital Twin. It is the
> live counterpart of `ContextSnapshot`: where the snapshot is history, LiveContext is
> the running computation that produces it. See `../docs/DIGITAL_TWIN.md` and
> `RUNTIME_LOOP.md`.

**Why a permanent kernel contract?** Because situated reasoning is a permanent need:
the runtime must always be able to ask "given everything I know, what matters *right
now*?" — and that is a *computation over the model*, not a stored fact. Separating it
from `ContextSnapshot` enforces the kernel's deepest discipline: **a process and a
record must never share a contract.** A momentary frame is a process; a retained frame
is history; conflating them was the original `Context` design flaw. *Can it exist for
twenty years?* The *capability* — assembling the salient frame on demand — is permanent;
any individual frame it computes lasts seconds. The contract is the durable promise of
that capability, never the momentary output, which is why it is a Service that owns no
state.

---

## 1. Semantics

A **LiveContext** is a read-only Service that computes the **salient slice** of the
Digital Twin for the present moment or task — the Entities, active Goals, and facets
most relevant now — and offers it to retrieval and planning. It answers *"what should
influence the decision in front of us right now?"* It holds no durable state: every
frame is recomputed; nothing it produces is truth.

When a frame must be preserved (for example, to explain a decision later), LiveContext
**emits a `ContextSnapshot`** — the immutable record. The Service performs the
computation; the State contract holds the history. LiveContext itself is never edited
and never persisted.

### Operational states (Service)

A Service has *operational states*, not Immutable/Derived/Ephemeral composition. For
completeness against the Identity decomposition: **everything LiveContext holds is
ephemeral** — the current frame, attention, and assembly buffers are runtime-only and
lost on restart; **nothing is derived-and-stored**; the only **immutable** artefacts in
play are the `ContextSnapshot`s it emits, which belong to that contract, not this one.

*Replay test:* LiveContext holds nothing that must survive replay. Its frames are
recomputed from the durable Twin; its durable output (snapshots) survives as the
`ContextSnapshot` State. Losing LiveContext loses nothing of value.

---

## 2. Lifecycle (operational)

1. **Idle** — no frame requested; the Service holds nothing.
2. **Assembling** — a situation (a task, an observation, a query) triggers
   recomputation of the salient slice from the Twin.
3. **Serving** — the assembled frame is offered to Retriever/Planner for the moment.
4. **Snapshotting** — on demand (e.g. a decision is framed), the current frame is
   emitted as an immutable `ContextSnapshot`.
5. **Dissolving** — the moment passes; the frame is discarded; the Service returns to
   Idle holding nothing.
6. **Degraded** — if the Twin is unavailable, LiveContext yields a reduced or
   empty frame rather than inventing one; it never fabricates salience.

---

## 3. State transitions

```
(idle) ──▶ (assembling) ──▶ (serving) ──▶ (dissolving) ──▶ (idle)
                              │
                              └── snapshotting ──▶ emits ContextSnapshot (immutable State)
       degraded ◀── Twin unavailable ──▶ reduced/empty frame, never fabricated
```

Operational moves only — LiveContext stores no record that transitions over time.

---

## 4. Invariants

1. **Owns no durable state.** Every frame is recomputed; the Service holds nothing that
   must survive a restart (Constitution Art. V §22).
2. **Read-only over the model.** It reads the Twin; it never writes identity and
   introduces no truth.
3. **Process, not history.** Its only durable output is the `ContextSnapshot` it emits;
   the live frame is never persisted as truth (Art. XII §44, §46).
4. **Never fabricates salience.** Under degradation it yields a reduced or empty frame,
   never an invented one.
5. **Never depended upon by State.** No State contract may depend on LiveContext (it is
   a running process); durable references point at the `ContextSnapshot` instead
   (Art. X §40).

Upholds Constitution Articles V (The Runtime), XII (Identity and Continuity), and
X §40 (persistent state never depends on a running process).

---

## 5. Versioning rules

- New **salience strategies / context dimensions** (temporal, spatial, social, task,
  device, …) are added and versioned; existing behaviour never changes meaning.
- The core obligation — *a read-only, stateless assembler of the salient frame that
  emits immutable snapshots* — is frozen at v1.
- Ranking and assembly heuristics are implementation; they may evolve freely, but never
  grant LiveContext durable truth.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- LiveContext is always recomputable and side-effect-free with respect to identity.
- Any frame worth keeping is available as an immutable `ContextSnapshot`.
- Losing or restarting LiveContext loses nothing of value.

Not guaranteed:

- That a given frame persists — it is momentary and dissolves by design.
- That the frame is *complete* or *correct* — it is the best current assembly,
  revisable as the Twin and relevance change.

---

## 7. Failure modes

- **Crash mid-frame.** The current frame and attention are lost; they are recomputed
  from the durable Twin — by design, nothing of value is lost.
- **Twin unavailable.** LiveContext degrades to a reduced or empty frame rather
  than fabricating salience.
- **Retriever overlap.** LiveContext and `Retriever` both sit between the model and
  reasoning; if their responsibilities blur, the kernel risks two services doing one
  job. The boundary — LiveContext assembles the *frame* ("what matters now"); Retriever
  ranks *history within it* ("given that, what is relevant") — is drawn explicitly in
  the Intelligence review and frozen there.
- **Snapshot pressure.** Emitting a snapshot for every frame would bloat history;
  snapshots are emitted only when explainability requires it.

Never permitted: persisting a live frame as truth; a State contract depending on
LiveContext; fabricating salience under failure.

---

## 8. Examples

- **Morning frame.** The user asks "what should I prep for?"; LiveContext assembles
  today's meeting entities and the goals they serve, serves the frame, and lets it
  dissolve — recomputed fresh tomorrow.
- **Decision capture.** Orb is about to send an email on the user's behalf; LiveContext
  emits a `ContextSnapshot` of the frame so the decision stays explainable for years.
- **Context shift.** Walking into the office re-weights the social and task dimensions;
  LiveContext recomputes the slice without any record being written.
- **Degraded start.** Right after a restart, before the Twin is warm, LiveContext
  serves a minimal frame rather than guessing — and fills in as the model rebuilds.
