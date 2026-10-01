# brain — the phone's reasoning layers (Kotlin)

Pure Kotlin, no Android, compiled on its own. First layer: **`Observer`**, which finds the
Observations a lane is missing (`docs/PHONE_BRAIN.md` B2a). Decided in `docs/DECISIONS.md` DR-16:
Kotlin on the phone, held to the TypeScript reference by shared vectors, rules before any model.

```
scripts/fetch-kotlin.sh        # once: the pinned compiler (never during a build)
runtime/brain/build.sh         # -> runtime/brain/build/classes
runtime/brain/tests/run.sh     # 135 checks on a desktop JVM
```

The Java shell that writes what the brain plans is `apps/pixel/orb/src/Observe.java.in`.
