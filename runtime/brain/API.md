# API (package `dev.orb.brain`)

- `Json.parse(text): Any?` — `Map<String,Any?>` / `List` / `String` / `Long` / `Boolean` / `null`; throws `JsonError`.
- `Translate.assist(payload)`, `Translate.share(payload)`, `Translate.of(type, payload)` → `Translation(data, attachments)` or null.
- `Observer.plan(lines): Plan(drafts, unreadable)`; `Draft(type, payload, causes)`. Pure and deterministic.
- Constants: `Translate.ASSIST_TYPE`, `SHARED_TYPE`, `ASSIST_SENSOR`, `SHARE_SENSOR`, `CONFIDENCE_PERCENT`; `Observer.OBSERVATION_TYPE`.

- `Lines.read(text)` (internal): one journal line opened as the journal presents it — v1, stored v2 (wrapper recognised by shape) or presented v2. Shared by the Observer and the graph.
- `Evidence.build(lines): EvidenceGraph` — `node(id)`, `nodes()`, `provenance(id)`, `observationsOf(id)`, `dependentsOf(id)`, `fromSource(sensor, from?, to?)`, `holding(identity)`, `unreadableLines`; each answer is `Answer(value, closed, unresolved, scope)`. `GraphNode` has no field for content. The twin of `@orb/evidence`.

Called from Java as `dev.orb.brain.Observer.plan(...)` (`@JvmStatic`).
