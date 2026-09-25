# Orb pass-1 probe

Answers P1, P2, P3, P4 and P6 of `../../../docs/DEVICE_LOOP.md`. An instrument,
not a product: it records whether this runtime can stay alive on this phone, and
whether it knows when it didn't.

## What it is

Two foreground services that do nothing but say they are alive once a minute,
one typed `dataSync` and one typed `specialUse`. Neither needs a runtime
permission, so whatever they do is the platform's behaviour and not a
consequence of a grant. Running both in one session answers P1 and P3 together:
if `dataSync` stops at roughly six cumulative hours and `specialUse` keeps
going, the cap is type-specific and `MOBILE_SENSING.md` §2 G4 is right.

Around them:

- **A manifest receiver** for `BOOT_COMPLETED` and package install/removal —
  P6 and P2, the signals that should arrive with no service running.
- **A runtime receiver** for screen and power events, which the system will not
  deliver to a manifest receiver. It dies with the service, and that is the
  measurement rather than a defect.
- **Gap reconstruction** — P4, and the reason the probe exists.

## How P4 works, and why it is the one that matters

A process cannot always record its own death; Android may remove it without
warning. What it can do is record its own *liveness* on a cadence, and on the
next start notice the cadence broke.

So a silence longer than two heartbeats, ending in an event that is not a
recorded stop, becomes a `probe.gap.inferred` — carrying `confidence 0.6`
against the `1.0` of a stop the service saw coming. That distinction is
`contracts/Observation.md`'s confidence model doing real work: the gap certainly
happened, but its cause and exact boundaries came from nothing that saw them.

If that inference works, a partial history is distinguishable from a quiet one
and `PARTIAL_REPLICATION.md`'s declared horizon is enforceable on this device.
If it does not, the design needs rethinking rather than adjusting.

## No Gradle, no libraries, and Java rather than Kotlin

Deliberate, and against `CLAUDE.md`'s "Kotlin with coroutines" — which governs
the **production host**, not this. An instrument must not introduce variables:
if the probe pulled in a framework, a process that vanished would leave us
unable to say whether Android killed it or the framework did. Zero dependencies
means what it measures is the platform.

The encoding in `src/Json.java.in` is the one part that must match the
TypeScript runtime byte for byte, and `tests/vectors.json` pins that agreement
from both sides (`runtime/journal/tests/vectors.test.ts`). Two implementations
that disagree would not produce a wrong answer; they would produce two devices
that can never agree they hold the same history.

## Build

```sh
ANDROID_HOME=/path/to/android-sdk ./build.sh
# → build/pass1/pass1.apk
```

## Run

```sh
adb install build/pass1/pass1.apk
```

Open **Orb pass 1**, allow notifications, tap **Start recording**. Then leave
the phone alone and carry it normally. The screen shows the event count and
chain state; the journal is the actual output.

### Pull the journal

```sh
adb pull /sdcard/Android/data/dev.orb.pass1/files/pixel.lane.jsonl
```

Readable without root, which is why the journal is written to external files
rather than private storage. That is wrong for a real runtime and right for an
instrument whose whole purpose is the evidence it produces.

### Worth doing during the run

- **P1/P3:** leave it recording for more than six hours without opening the app.
  `probe.service.timeout` is the direct evidence the cap fired, and which
  service it names is the answer.
- **P2:** reboot. Does anything appear without you opening the app?
- **P6:** install or uninstall any app while the probe's services are stopped.
  A `probe.signal` with `"registration":"manifest"` means the cheapest sensor in
  `MOBILE_SENSING.md` §8 costs no service at all.
- **P4:** force-stop the app from Settings, then reopen it. A
  `probe.gap.inferred` should appear, naming the silence it could not see.

## Event types

| Type | Means |
| --- | --- |
| `probe.process.start` | the process came up; carries build and elapsed-realtime, so a reboot is distinguishable from a kill |
| `probe.service.start` | a foreground service entered the foreground |
| `probe.heartbeat` | still alive, once a minute, per service |
| `probe.service.timeout` | **Android enforced the time limit** — P1/P3 |
| `probe.service.stop` | an observed stop, `confidence 1.0` |
| `probe.service.taskRemoved` | the task was swiped away |
| `probe.gap.inferred` | **a silence nothing observed**, `confidence 0.6` — P4 |
| `probe.signal` | a broadcast, tagged `manifest` or `runtime` — P6 |
| `probe.boot.restart` | whether restarting services from boot was permitted — P2 |
| `probe.memory.trim` / `.low` | memory pressure, which may precede a kill |
