# Orb Contract Specifications

This directory holds one specification per kernel contract. The kernel
(`../docs/KERNEL.md`) names the 29 contracts and states their Purpose,
Responsibilities, Invariants, and Dependencies. **These specifications define
each contract in depth** — its behavior over time and its guarantees — without yet
committing to a programming language.

> Order of work (Phase 3): KERNEL.md accepted → **contract specifications
> (here)** → implementation interfaces (TypeScript / Kotlin). No implementation
> interface is written until every specification is accepted.

---

## Specification Format

Every contract specification is a single Markdown file named for the contract
(`Event.md`, `Observation.md`, …). It opens with a short header and then defines
**exactly these eight sections, in order**:

1. **Semantics** — what the contract *means*; the precise concept it represents.
2. **Lifecycle** — how an instance comes into being, persists, and ends (or why
   it never ends).
3. **State transitions** — the legal transitions of the contract over time. For
   **State** contracts, the transitions of the record (e.g. created → referenced →
   revised-by-append). For **Service** contracts, the operational states (e.g.
   idle → running → degraded) and legal moves between them.
4. **Invariants** — properties that must hold at all times; the laws this
   contract is responsible for upholding (consistent with `CONSTITUTION.md`).
5. **Versioning rules** — how this contract may evolve under Article X (addition,
   never mutation).
6. **Compatibility guarantees** — what consumers may permanently rely on; what is
   explicitly not guaranteed.
7. **Failure modes** — how the contract behaves when things go wrong, and what is
   never permitted even under failure.
8. **Examples** — concrete, plain-language scenarios illustrating the contract.

The header of each file records:

```
Contract:   <Name>
Domain:     <Reality | Knowledge | Identity | Intelligence | Execution | Infrastructure>
Kind:       <State | Service>
Version:    v1
Status:     <Draft | Accepted>
Depends on: <kernel contracts>
```

No methods, fields, data shapes, or language appear in these specifications —
those belong to the implementation interfaces written after acceptance.

---

## Contracts Index

State (15) and Service (14), grouped by domain. Status tracks Phase 3b review.

### 1. Reality
| Contract | Kind | Status |
| --- | --- | --- |
| [Event](Event.md) | State | Draft |
| [Observation](Observation.md) | State | Draft |
| [Attachment](Attachment.md) | State | Draft |
| [Sensor](Sensor.md) | Service | Draft |

### 2. Knowledge
| Contract | Kind | Status |
| --- | --- | --- |
| Evidence | State | _pending_ |
| Entity | State | _pending_ |
| Fact | State | _pending_ |
| Belief | State | _pending_ |
| Prediction | State | _pending_ |

### 3. Identity
| Contract | Kind | Status |
| --- | --- | --- |
| DigitalTwin | State | _pending_ |
| Relationship | State | _pending_ |
| Project | State | _pending_ |
| Goal | State | _pending_ |
| Context | State | _pending_ |

### 4. Intelligence
| Contract | Kind | Status |
| --- | --- | --- |
| Memory | Service | _pending_ |
| Retriever | Service | _pending_ |
| Reasoner | Service | _pending_ |
| Planner | Service | _pending_ |
| Reflector | Service | _pending_ |

### 5. Execution
| Contract | Kind | Status |
| --- | --- | --- |
| Capability | Service | _pending_ |
| Action | State | _pending_ |
| Policy | State | _pending_ |
| Scheduler | Service | _pending_ |
| Agent | Service | _pending_ |

### 6. Infrastructure
| Contract | Kind | Status |
| --- | --- | --- |
| Journal | Service | _pending_ |
| Storage | Service | _pending_ |
| Synchronization | Service | _pending_ |
| ModelRouter | Service | _pending_ |
| Encryption | Service | _pending_ |
