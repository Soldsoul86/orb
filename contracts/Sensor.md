# Sensor — Contract Specification

```
Contract:   Sensor
Domain:     Reality
Kind:       Service
Version:    v1
Status:     Accepted
Depends on: Observation, Attachment
```

> A Sensor is the boundary through which the world enters Orb. It is the first
> Service of the Runtime Loop's **Sense** stage. See `../docs/RUNTIME_LOOP.md` and
> `EVIDENCE_GRAPH.md`.

**Why a permanent kernel contract?** Because it is the *only* ingress through
which the external world becomes history, and that boundary must be source- and
model-independent and runtime-scheduled **by contract**. Fixing "how the world
enters Orb" as a narrow, permanent obligation — emit attributed observations,
never interpret, never self-schedule — is precisely what stops ingestion from
smuggling interpretation or authority into history. The *implementations*
(calendar, location, browser, …) are replaceable; the boundary is not.

---

## 1. Semantics

A **Sensor** is a Service that perceives a defined class of external signals from
the Reality Plane and emits them into history as Observations (and Attachments).
It is Orb's sensory organ: files, messages, calendar, location, audio, browser
activity, and the outcomes of Orb's own Actions all enter through Sensors.

A Sensor **perceives and records; it does not interpret**. It turns "a signal
exists in the world" into "an Observation exists in history," attributed to
itself. What that observation *means* is decided elsewhere, later.

A Sensor is a Service (not State and not a Transition): it provides the capability
to observe, runs under the runtime's schedule, and owns no truth of its own.

---

## 2. Lifecycle

1. **Registration.** A Sensor is registered with the runtime, declaring its source
   identity and the class of signals it observes.
2. **Scheduling.** The runtime — never the Sensor itself — schedules when the
   Sensor runs (continuously, on a cadence, or on a trigger). *Sensors do not wake
   randomly.*
3. **Perception → emission.** When run, the Sensor perceives available signals and
   emits Observations (plus Attachments for raw content), attributed to itself.
4. **Continuity.** The Sensor operates over the life of the runtime, contributing
   to the never-ending Sense stage. It may be paused, resumed, or retired; its
   past emissions remain permanent history regardless.

---

## 3. State transitions

As a Service, a Sensor has operational states governed by the runtime:

```
registered ──schedule──▶ active ──run──▶ emitting ──▶ idle ──▶ active …
     │                       │
     │                       └──(constraint: battery/thermal/offline)──▶ deferred ──▶ active
     │
     └──retire──▶ retired   (past observations persist; no new emissions)
```

- `deferred` is the device-constraint state: work is **postponed, never dropped**.
- A Sensor never transitions to a state in which it emits interpretation; the only
  thing it emits, in any state, is Observations and Attachments.

---

## 4. Invariants

1. **Emits only Observations and Attachments** — never Evidence, Beliefs, or any
   interpretation.
2. **Always attributes** every emission to its declared source identity.
3. **Runtime-scheduled.** The Sensor does not schedule itself; the runtime owns
   when it runs.
4. **Owns no truth.** A Sensor holds no source-of-truth state; everything it
   produces lives in the journal.
5. **Eventually-complete.** Sensing is not "live": signals are eventually
   observed, and deferral under constraint never silently discards them.
6. **Faithful.** A Sensor records what it perceives, including uncertainty; it
   never fabricates or upgrades certainty.

Upholds Constitution Articles V (The Runtime), VI (The Three Planes), and II
(Truth and Interpretation).

---

## 5. Versioning rules

- **New Sensor types** (new signal classes) are added freely; they are new
  Services, never changes to existing ones.
- The Sensor obligation — *attributed, observation-only, runtime-scheduled* — is
  frozen at v1. A Sensor that needed to emit something other than
  Observations/Attachments would be a different, versioned contract, not a mutation
  of this one.
- A Sensor implementation may be rewritten or replaced at any time without
  affecting the contract or the history it has already produced.

---

## 6. Compatibility guarantees

Consumers may permanently rely on:

- Anything a Sensor produces is an attributed Observation (or Attachment),
  recorded in history like any other.
- The runtime, not the Sensor, controls execution and pacing.
- Retiring or replacing a Sensor never alters or invalidates its past emissions.

Not guaranteed:

- **Timeliness.** A Sensor may observe a signal long after it occurred; ordering
  is by HLC, and "nothing is live."
- **Completeness at any instant.** Some signals may not yet be observed.
- **Accuracy.** A Sensor can be wrong; corroboration happens in the Evidence
  Graph, not in the Sensor.

---

## 6a. Connector Sensors — external calls

A connector (Gmail, Calendar, Drive) is a Sensor whose source is reached over the
network rather than read from the device. It perceives the same way and records
the same way, with three additions ruled on 2026-09-26 (`docs/DECISIONS.md` DR-7).

**The call is history, whether or not its content is.** Every fetch emits an
event naming the connector, the scope or query shape, the time, the count
returned, and the outcome — `value | empty | absent | threw | denied`. It carries
no fetched content. Two reasons: an access the runtime does not record is an
access nobody can audit, and the query is an *outbound* disclosure, because it
tells the provider what was asked. §7's *source unavailable* is the `absent` case
of this same ladder, and `denied` is distinct from `threw` — a refusal is a
different fact from a failure.

**What the connector yields is an Observation, never a Fact.** It carries
`confidencePercent` and cites the call event in `causes`. A model's summary of
fetched content is interpretation over external grounding, which is
`Evidence.md`'s distinction, and it does not become a Fact by being convenient.

**Raw content is an Attachment with a seven-day life.** Frozen and
content-addressed at fetch — never a reference into the provider, because a
mutable store is not evidence. It is held by `holdSince` for seven days from the
fetch (the Attachment event's `wallClock` *is* the fetch time), after which the
payload is released with `absence: "pruned"` and, under `Attachment.md` inv. 8,
becomes unreadable everywhere rather than merely deleted here.

After that the Observation is **grounded with its ground detached**: it still
cites the call event, which is permanent, so a lineage walk resolves and reports
that the content was released on a stated policy — which is a different fact from
evidence that never existed. Its `confidencePercent` does not change; what it was
worth when made is not edited by what can be verified later.

**Credentials are never journaled.**

---

## 7. Failure modes

- **Source unavailable.** If the external source cannot be reached, the Sensor
  emits nothing (or a recorded "source unavailable" observation where useful) and
  is retried later; it never fabricates data.
- **Device constraint.** Under low battery, thermal, or offline conditions the
  Sensor is `deferred` by the runtime; pending perception resumes later. Deferred
  is never dropped.
- **Duplicate perception.** Re-observing the same signal must be idempotent: a
  Sensor identifies signals such that re-emission does not create spurious
  duplicate history (and the journal dedupes by Event identity regardless).
- **Permission revoked.** If the user revokes the Sensor's access to its source,
  it stops emitting; prior history is untouched; the revocation itself may be
  recorded.

Never permitted: emitting interpretation; emitting unattributed Observations;
self-scheduling around runtime constraints; discarding perceived signals silently.

---

## 8. Examples

- **Calendar sensor.** Runs on a cadence, emits an Observation for each new or
  changed calendar entry, attributed to "calendar." It does not decide whether a
  meeting "matters."
- **Location sensor.** Emits periodic position Observations; under low battery the
  runtime defers it, and it resumes — back-dated by HLC — when power allows.
- **Action-outcome sensor.** After a Capability sends a message, this Sensor
  records the outcome as an Observation, closing the loop so Reflection can compare
  expectation to result.
- **Browser sensor, offline.** The laptop is offline; the sensor defers. On
  reconnect it emits the Observations it could not before; they slot into causal
  order by HLC without any device acting as authority.
