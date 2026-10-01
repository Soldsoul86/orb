# API (package `dev.orb.brain`)

- `Json.parse(text): Any?` — `Map<String,Any?>` / `List` / `String` / `Long` / `Boolean` / `null`; throws `JsonError`.
- `Translate.assist(payload)`, `Translate.share(payload)`, `Translate.of(type, payload)` → `Translation(data, attachments)` or null.
- `Observer.plan(lines): Plan(drafts, unreadable)`; `Draft(type, payload, causes)`. Pure and deterministic.
- Constants: `Translate.ASSIST_TYPE`, `SHARED_TYPE`, `ASSIST_SENSOR`, `SHARE_SENSOR`, `CONFIDENCE_PERCENT`; `Observer.OBSERVATION_TYPE`.

Called from Java as `dev.orb.brain.Observer.plan(...)` (`@JvmStatic`).
