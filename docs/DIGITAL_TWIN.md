# Digital Twin

> Status: Phase 1 architecture. Reviewed before implementation.
> Defines the **Interpretation** plane: the recomputable model of the user and
> their world. See `SYSTEM_OVERVIEW.md` for the History/Interpretation split.

---

## 1. Purpose

The Digital Twin is Orb's current best understanding of the user and their world:
the people, places, projects, habits, preferences, and relationships it has
inferred. It is the **interpretation** layer — and therefore explicitly **not
truth**. It is a living projection that improves as evidence accumulates and as
models evolve.

> Constitutional law: *Understanding is always recomputable.* The Digital Twin
> holds nothing that cannot be rebuilt from history.

---

## 2. Position in the Stack

```
Evidence Graph  →  Knowledge Engine  →  Digital Twin  →  Reasoning Pipeline
  (history)          (derivation)        (interpretation)
```

The **Knowledge Engine** is the process that derives interpretation from
evidence. The **Digital Twin** is the materialized current state of that
interpretation. Both live **above the determinism boundary**.

---

## 3. What It Holds

### Fact

A `Fact` is an interpretation that is currently treated as settled given the
evidence, e.g. _"John's birthday is March 4."_ A Fact still references evidence
and can still be revised — it is "settled until contradicted," not eternal truth.

### Belief

A `Belief` is an interpretation held with **uncertainty**, e.g. _"John is an
important contact (confidence 0.8)."_ A Belief carries:

- a claim,
- a **confidence**,
- **supporting evidence** (links into the Evidence Graph),
- the **derivation** that produced it (including any `model_output` provenance),
- its **history** of prior values (beliefs change; the change is itself history).

### Entity

An `Entity` is a resolved subject of interpretation — a person, place,
organisation, device, project. Entities are inferred by linking observations
(identity resolution). _"These 14 observations are all about the same 'John'."_
Entity resolution is interpretation and may be revised (a merge or split is a new
interpretation, never a rewrite of the underlying events).

### Relationships

Edges between entities and to evidence: `relatesTo`, `knows`, `worksOn`,
`locatedAt`, each itself a Belief with confidence and grounding.

---

## 4. Everything References Evidence

No Fact, Belief, or Entity exists without a path back to the Evidence Graph and,
through it, to immutable events.

```
Belief ── supportedBy ──▶ Evidence node ── supports ──▶ Observation ──▶ Event
       └─ derivedBy ────▶ model_output / rule provenance
```

This makes the Twin **fully explainable**: select any belief and walk its
grounding to raw signals and to the exact model run (provider, version, prompt
template, parameters) that produced it.

---

## 5. Recomputation

The Twin is a projection. It is **continuously recomputed** as new evidence
arrives and may be **fully rebuilt** from the journal at any time.

- New evidence → the Knowledge Engine revises affected Facts/Beliefs/Entities.
- A model upgrade → future recomputation may yield different beliefs. This is
  expected and permitted. Prior beliefs remain in history with their original
  provenance.
- A corrupted or stale Twin can be discarded and rebuilt from events. Nothing of
  value is lost because the Twin holds no source-of-truth state.

> Replay reconstructs the **structure and lineage** of interpretation. It does
> not guarantee the **same conclusions**, because the models that produce
> conclusions are replaceable. Orb reproduces history; it does not freeze
> intelligence.

---

## 6. Belief Revision (without rewriting history)

When evidence changes a belief:

1. The new belief value is computed with its new grounding.
2. The change is recorded (the Twin keeps the prior value and why it changed).
3. The underlying **events are never touched**.

A belief going from "John is a casual contact (0.4)" to "important contact (0.8)"
is a forward step in interpretation, fully traceable, with the old interpretation
preserved. Orb improves by re-interpreting an unchanging past.

---

## 7. Determinism Boundary

The Digital Twin is the canonical example of the non-deterministic plane:

- Its **inputs** (Evidence Graph) are deterministic.
- Its **contents** (Beliefs) are not — they depend on replaceable reasoning.
- Its **grounding and lineage** are always deterministic and reconstructible.

This is the architecture's central trade managed deliberately: deterministic
history, evolving understanding, with a permanent audit trail between them.

---

## 8. Invariants

1. The Twin holds interpretations, never truth.
2. Every Fact/Belief/Entity references evidence and records its derivation.
3. The Twin is fully recomputable from the journal.
4. Belief revision never mutates underlying events; prior interpretations are
   retained as history.
5. Every belief is explainable by traversal to raw signals and model provenance.
6. The Twin is never a source of truth and may be discarded and rebuilt.

---

## 9. Out of Scope

- The reasoning that *acts* on the Twin → `AGENT_RUNTIME.md`.
- Decisions and their execution → `AGENT_RUNTIME.md`, `CAPABILITY_MODEL.md`.
- Persistence of the Twin projection → `STORAGE.md`.
