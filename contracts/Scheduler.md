# Scheduler — Contract Specification

```
Contract:   Scheduler
Domain:     Execution
Kind:       Service
Version:    v1
Status:     Draft
Depends on: Agent, Policy
```

> The Scheduler owns *when*. It never owns *what*, and never owns *whether*. It is
> the component that makes Art. V §21 and §23 structural rather than aspirational.
> See `../docs/RUNTIME_LOOP.md` §5–§9 and `../docs/AGENT_RUNTIME.md`.

**Why a permanent kernel contract?** Because three constitutional properties are
otherwise unenforceable. *The runtime owns execution and agents do not wake randomly*
(§21), *the loop never skips a stage* (§23), and *deferred is not dropped* are all
claims about a **single arbiter**. Move scheduling into agents and each one decides
when its own work matters: priority becomes self-assertion, starvation becomes
invisible, and "nothing is live, yet nothing is lost" (§20) becomes a per-agent
promise instead of a property of the system. The *policies* of scheduling — which
stage, what cadence, what backoff — are replaceable. That one component owns
dispatch, and that it can defer but never discard, is not.

---

## 1. Semantics

A **Scheduler** is a Service that selects and dispatches runtime work to `Agent`s.

It answers one question — *what runs next* — and is forbidden the other two. It
does not decide what should be done (`Planner`), and it does not decide whether it
may be done (`Policy`). A scheduler that consulted the meaning of its work would be
interpreting; one that consulted permission would be a second gate, and a second gate
is a second place for authority to accumulate.

**Its queue is a projection, not a record.** This is the load-bearing property of the
contract. The scheduler owns no durable state: what is pending is *derived* from
history — events recorded, stages not yet advanced, cadences whose interval has
elapsed. A queue that were itself the source of truth would make losing the queue
mean losing the work, and Art. IX §33 forbids the second source that would be needed
to prevent it. The scheduler is therefore restartable for exactly the reason an
`Agent` is (§22): there was never anything in it that history did not already hold.

---

## 2. Lifecycle

1. **Start.** The scheduler derives pending work by reading history — never by
   restoring a saved queue.
2. **Selection.** Pending work is ordered by the priority classes of
   `RUNTIME_LOOP.md` §6. Ordering is total and deterministic for a given input set
   on a given device.
3. **Dispatch.** Work is handed to an `Agent`. The scheduler does not perform it.
4. **Completion or failure.** The agent's outcome enters history as Events. A
   transient failure is retried by the scheduler under backoff; a persistent one is
   recorded and surfaced.
5. **Continuity.** The scheduler runs for the life of the runtime and never
   terminates. Quiescence — nothing pending — is a normal state, not an end.

---

## 3. State transitions

```
        ┌───────────────── nothing pending ──────────────┐
        ▼                                                │
    quiescent ──work becomes pending──▶ dispatching ─────┤
                                            │            │
                                            ├─concurrency bound reached──▶ saturated
                                            │                                  │
                                            │◀───────capacity returns──────────┘
                                            │
                                            ├─device constraint──▶ constrained
                                            │                          │
                                            │◀──constraint lifts───────┘
                                            │
                                            └──stop──▶ stopped  (pending work survives in history)
```

Three distinctions the diagram exists to keep apart:

- **`saturated` is not failing.** A bounded concurrency is the scheduler working
  correctly. Bursty sensing must not starve understanding (`RUNTIME_LOOP.md` §5).
- **`constrained` is not `stopped`.** Battery, thermal and network limits defer work.
  Deferred work is still pending, still ordered, and still in history.
- **`stopped` loses nothing.** Because the queue is a projection, a scheduler that
  dies mid-dispatch resumes by re-deriving. What it cannot re-derive was never work.

---

## 4. Invariants

1. **The runtime owns scheduling.** No `Agent` wakes itself, schedules itself, or
   reorders its own work (Art. V §21).
2. **Priority orders; it never omits.** No stage is skipped, at any priority, for
   any reason (Art. V §23). A task the scheduler will never reach is a defect, and
   §7 requires it to be visible as one.
3. **Deferred is never dropped.** Work not run is work not run *yet*, and the
   distinction is recorded, not implied.
4. **Owns no durable state.** Pending work is derived from history and survives the
   scheduler's death because it was never only in the scheduler (Art. IX §33).
5. **Deterministic dispatch order** for a given input set on a given device, so
   behaviour is reproducible and debuggable. Two devices may legitimately differ —
   their constraints differ — and neither is wrong.
6. **Retries transport, never authorization.** A retry re-attempts a dispatch. It
   never re-authorizes, never widens a scope, and never converts a denial into an
   attempt. Permission belongs to `Policy` and to nothing else.
7. **Backpressure is capacity, not permission.** Refusing to dispatch *now* because
   a bound is reached is never recorded as, and never means, refusal.
8. **Never interprets, never decides, never acts.** It reads no meaning from the
   work it carries.
9. **Failure is recorded.** A persistent failure becomes history and surfaces. It is
   never retried silently for ever and never swallowed.

Upholds Constitution Articles V (The Runtime), VI §26 (the Execution Plane holds no
truth), and IX §33 (no duplicate sources of truth).

---

## 5. Versioning rules

- **New priority classes** may be added. The **meaning and relative rank of an
  existing class never changes** — a task recorded as deferred under one ranking
  must still be explainable under it years later, and a silent reordering would
  rewrite why something waited.
- **New kinds of schedulable work** are added freely.
- The core obligation — *the runtime owns scheduling; priority orders, never omits;
  deferred is never dropped; no durable state* — is frozen at v1. Weakening any of
  it requires `Scheduler v2` alongside v1, never replacing it.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Everything scheduled is eventually dispatched, or recorded as not dispatched with
  a reason. There is no third outcome.
- Restarting the runtime loses no pending work.
- Dispatch order is reproducible for a given input set on a given device.
- A retry never doubles an effect and never re-authorizes one.

Not guaranteed:

- **When.** Nothing is live (Art. V §20). A task may wait indefinitely under
  sustained constraint; what is guaranteed is that the waiting is visible.
- **That two devices agree on order.** Constraints differ; ordering is per-device.
- **That a task ever runs** on a device that never has capacity for it — but see
  §7: that device's history says so.
- **Throughput.** Bounded concurrency is a guarantee against starvation, not a
  promise of speed.

---

## 7. Failure modes

- **Transient task failure.** Retried with backoff **by the runtime, not by the
  agent** (`RUNTIME_LOOP.md` §9). Retries are bounded.
- **Persistent task failure.** Recorded as a failure in history and surfaced for
  attention. The failure becomes evidence rather than a lost attempt.
- **The scheduler itself does not run.** No work is dispatched and **the gap is
  recorded at the next start**, derived from the distance between the last event and
  the restart. A scheduler that was absent must not be indistinguishable from one
  that had nothing to do — the same rule as an unreadable setting and an empty one,
  one layer up.
- **Sustained constraint, indefinitely.** Work stays pending and stays visible.
  **Starvation must be legible**: a reader must be able to tell *deferred for an
  hour* from *deferred for a month*, because the second is a finding about the
  device and the first is a Tuesday.
- **Queue lost.** Re-derived from history. Nothing is lost, because nothing was
  only in the queue. If re-derivation produces different pending work than before
  the loss, the difference is a defect in derivation, not in the queue.
- **Dispatch to a dead agent.** The dispatch did not happen; it is recorded as not
  dispatched and re-selected. An agent that died mid-work repeats from history
  (`Agent.md` §7), which is safe because every stage is idempotent with respect to
  its input events (`RUNTIME_LOOP.md` §10).

Never permitted: skipping a stage; dropping deferred work; retrying an
authorization; recording backpressure as denial; a queue that outlives the events
it was derived from.

---

## 8. Examples

- **Event-driven propagation.** An appended event schedules Extract → Link →
  Understand for that event, and then possibly Plan. Nothing polls; the record
  itself is the trigger (`RUNTIME_LOOP.md` §7).
- **A cadence with no state — measured.** `apps/pixel/pass2` scans the installed
  package set at most once per interval, and decides whether it is due by reading
  the timestamp of the **last scan event in the journal** — `lastOfType`, not a
  saved timer (`../docs/DEVICE_LOOP.md` §7b7). It is a degenerate scheduler, and it
  is the property of §1 demonstrated on a real device: the cadence survives process
  death because it was never held in the process.
- **Deferred, not dropped — measured.** Doze froze pass 1's heartbeat 47 times in
  one day, once for 9.6 minutes, and **every lost minute has a recorded gap beside
  it** (`../docs/DEVICE_LOOP.md` §0). That is invariant 3 with evidence: the work
  did not happen and the record says so, rather than the silence being left to mean
  whatever a reader assumes.
- **A scheduler that was absent.** Pass 1 records `probe.gap.inferred` when a
  process restart follows an unexplained last event, naming the duration, the
  detection method and a confidence. §7's "the gap is recorded at the next start"
  is that, generalised.
- **Backpressure that is not a denial.** A burst of sensing saturates the Extract
  stage. Understanding is not starved, no work is discarded, and nothing about the
  burst is recorded as a permission decision — because none was made.
- **An idempotent redispatch.** `raiseAlerts` in `packages/device-watch` folds the
  alerts it already raised out of the projection before raising more, so running it
  twice raises once (`../docs/DEVICE_LOOP.md` §7b2). That is what makes retry safe
  at the boundary where retry is most dangerous.
