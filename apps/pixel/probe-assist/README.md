# Orb assist probe — P23–P29

A throwaway instrument with one job: measure **what Android hands an app that is
selected as the device's assistant**, for which target apps, how fast, and what it
withholds — recording *facts about* the screen and never the screen.

`docs/DEVICE_LOOP.md` §7b41 holds the predictions, the operator protocol and how
to revert the default assistant. This file is only the map.

## What it is

| File | Role |
| --- | --- |
| `src/Facts.java.in` | The only place a record is built. Takes numbers, booleans, a validated package name and a fixed vocabulary of invocation sources — **no parameter can carry text** |
| `src/PixelStats.java.in` | Pure: a 32×32 sample of the screenshot → colour count, dark %, `uniform`. Enough to tell a capture from a blanked one; not enough to rebuild it |
| `src/AssistService.java.in` | The `VoiceInteractionService`; records `ready` / `shutdown` / `show.failed` |
| `src/Session.java.in` | The session and its overlay card; walks `AssistStructure` counting lengths and presence only |
| `src/SessionService`, `RecognitionStub` | Platform plumbing. The stub recognises nothing; whether a phone assistant needs one is **unconfirmed** |
| `src/MainActivity.java.in` | Shows role/service status, opens the system chooser, exports the journal |
| `src/Probe.java.in` | Opens the journal once — one process, one writer |

Journal, JSON, clock and install identity are taken from `pass1/` and `orb/` at
build time, not copied.

## The guarantee, and how it is checked

The probe may **receive** a screen and may not **keep** any of it. `tests/run.sh`
(JDK only, 59 checks) includes `GuardTest`, which reads the platform glue's source
and fails if any file other than `Facts` builds a record, logs, writes a file or a
picture, keeps a second copy, reads a content accessor for more than its length or
presence, requests a permission, or gives a component its own process.

## Build and test

```
bash apps/pixel/probe-assist/tests/run.sh                          # desktop JVM
ANDROID_HOME=/path/to/sdk bash apps/pixel/probe-assist/build.sh    # APK
```

Its own package (`dev.orb.probea`) and its own throwaway key (`keys/`, ignored by
git), so it can be installed beside every other Orb app and removed without
touching them.
