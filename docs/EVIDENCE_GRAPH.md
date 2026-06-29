# Evidence Graph

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines how observations link to the evidence that grounds them. Operates
> entirely on the **History** plane. See `SYSTEM_OVERVIEW.md` and `EVENT_MODEL.md`.

---

## 1. Purpose

The Evidence Graph is the bridge between raw events and reasoning. It is the
structured, queryable view of **what was observed and what corroborates it**. It
is a deterministic projection of the Event Journal — it adds linkage, never new
truth.

> Constitutional law: *Every belief must reference evidence.* The Evidence Graph
> is where that reference becomes navigable.

---

## 2. Position in the Stack

```
Event Journal  →  Evidence Graph  →  Knowledge Engine (interpretation)
   (history)        (history)            (interpretation)
```

The Evidence Graph sits **below the determinism boundary**. It contains no
beliefs, no conclusions, no model outputs interpreted as truth — only
observations, evidence, and the immutable links between them. It is fully and
exactly reconstructible by replay.

---

## 3. The Graph

A directed graph derived from events.

### Nodes

- **Observation** — a recorded statement that something occurred.
  _"Met John at 3:02 PM."_ Projected from an `observation` event.
- **Evidence** — a corroborating signal. _A GPS fix, a calendar entry, a
  Bluetooth proximity reading, a photo reference._ Projected from `evidence`
  events.
- **Source** — the origin of a signal (a specific sensor, an imported account, a
  recorded model output acting as a signal-about-a-signal).

Every node is backed by exactly one immutable event and carries that event's
`id`, `hlc`, and originating `device`.

### Edges

- `supports` — Evidence → Observation. "This GPS fix supports the observation
  that you were at the cafe."
- `derivedFrom` — Observation → Observation/Evidence. Provenance of a composed
  observation.
- `corroborates` / `contradicts` — Evidence ↔ Evidence. Agreement or tension
  between independent signals (recorded as structure, not resolved as truth).
- `attributedTo` — Observation/Evidence → Source.

Edges are themselves derived from event payloads and `causes` links. The graph
**never** invents an edge that isn't grounded in an event.

---

## 4. Provenance Is First-Class

Every node answers, by construction:

- **What** is the claim or signal?
- **Where** did it come from? (`Source`, `device`, `lane`)
- **When**, in causal time? (`hlc`)
- **On what** does it rest? (`supports` / `derivedFrom` edges)

This is the substrate that makes *every decision explainable*: any downstream
belief can be walked back through the Evidence Graph to the immutable events that
ground it. Explanation is graph traversal, not reconstruction from memory.

---

## 5. Corroboration, Not Resolution

The Evidence Graph records that signals agree or conflict; it does **not** decide
who is right. Resolving contradictions is **interpretation**, and belongs to the
Knowledge Engine / Digital Twin, above the boundary.

Example: a calendar entry says "Lunch with John, 1 PM" but GPS + Bluetooth place
you with John at 3:02 PM. The graph records:

- Observation: "Met John at 3:02 PM."
- Evidence: calendar entry (1 PM), GPS fix (3:02 PM), BT proximity (3:02 PM).
- Edges: GPS `supports` 3:02; calendar `contradicts` GPS on time.

The graph stores the tension immutably. Whether "John is met at 3 not 1" becomes
a belief is decided later, and may change.

---

## 6. Determinism & Replay

- The Evidence Graph is a **pure function of the journal**. Same events → same
  graph, on every device, forever.
- It is rebuildable by replay and is never itself a source of truth.
- Because it is below the determinism boundary, it contains **no model-derived
  conclusions**. (A `model_output` event can appear as a `Source`/`Evidence`
  node — "the model said X" is a fact about history — but the *content* of what
  the model concluded is consumed as interpretation upstream, not asserted as
  truth here.)

---

## 7. Querying

The graph is the primary read interface for reasoning. Expected query classes:

- **Grounding:** "What evidence supports observation O?"
- **Provenance walk:** "Trace O back to raw signals."
- **Temporal:** "What was observed about entity E between t1 and t2?" (HLC order)
- **Conflict:** "Where do my signals about E contradict each other?"

Queries are read-only and side-effect-free.

---

## 8. Invariants

1. Every node is backed by exactly one immutable event.
2. Every edge is grounded in event payload/causality; none are invented.
3. The graph contains observations and evidence only — never resolved truth.
4. Provenance (source, device, HLC, support) is always reconstructible.
5. The graph is a deterministic projection, rebuildable by replay.
6. Contradictions are recorded, never silently resolved.

---

## 9. Out of Scope

- Turning evidence into Facts/Beliefs → `DIGITAL_TWIN.md`.
- Storage/indexing of the graph projection → `STORAGE.md`.
- Entity identity resolution → `DIGITAL_TWIN.md`.
