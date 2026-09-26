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
from both sides (`runtime/journal/tests/vectors.test.ts`, and `tests/run.sh`
below). Two implementations that disagree would not produce a wrong answer; they
would produce two devices that can never agree they hold the same history.

Both envelope formats are implemented and both are pinned. **This build still
writes v1** — pass 1 is a measuring instrument, and a heartbeat's fine type
discloses that a heartbeat happened, so migrating mid-run would put a version
seam through a measurement for no gain in what it measures. `Journal`'s
`DEFAULT_ENVELOPE_VERSION` is the one line that changes it, and
`v1IsWhatThisBuildWrites` fails if it changes by accident.

## Tests

```sh
./tests/run.sh        # needs a JDK and python3; no Android SDK, no Gradle
```

Runs `src/` on a desktop JVM. `Journal` touches Android in exactly one place — a
`Context` asked for a directory — so a fake `Context` on the test classpath runs
the shipped sources unmodified. Nothing in `src/` is conditioned on being under
test, so what the tests exercise is what the phone runs. Nothing here is
compiled into the APK.

`Vectors.java` is generated from `tests/vectors.json` at test time rather than
transcribed, so the fixture stays one source of truth for both implementations.

What it covers, and why each is there:

| Test | Why |
| --- | --- |
| A restarted process continues the chain | The §5d regression. Verified by failing: reintroduce `extract` for `extractString` and the suite fails in under a second. Expect `chain verifies across 20 restarts` to fail every time, with 19 breaks in 20 events; the *other* checks that fail vary between runs (see below), so match on that line rather than on a total. |
| Deletion, reordering, an edited hash | What linkage evidence actually catches. |
| **An edited payload is NOT detected** | A recorded limit, asserted rather than assumed. `verify()` checks linkage only; it never re-derives a hash. |
| Every break is reported | An earlier break must not hide a later one. |
| Canonical JSON edge cases | The half of the cross-implementation agreement that runs on the device, executed for the first time. |
| Envelope v2, both branches | The `v2` and `v2Bookkeeping` vectors were computed by the **TypeScript** encoder, so Java agreeing is a real cross-implementation check and not one encoder agreeing with itself. The fixture states no coarse type — each side derives it — so one check pins the rule and the bytes together. Two sections because the rule has two branches, and bookkeeping keeping its real name is the one that would diverge unnoticed. |
| What `append` writes under v2 | Coarse type, no `causes`, `v: 2`, the real type and schema and a nonce inside the payload, `payloadHash` over the wrapper rather than the caller's object. The encoding tests call `Journal.wrapPayload` and `Journal.preimage` for the same reason: an earlier version canonicalised the fixture's own objects, and a negative control caught it — keeping `causes` in the v2 preimage failed nothing at all. |
| This build still writes v1 | A guard on the default, not a comment. |

### Why the negative control's failure count moves

Reintroducing the §5d defect does not fail the same set of checks twice running,
and a run that fails four is not a weaker reproduction than one that fails five.

`extract` scans digits only, so what it does to a head hash depends on the first
character of that hash — and hashes vary with the wall clock and the random
event id:

| Head hash starts with | `extract` returns | `head` | `discontinuous` |
| --- | --- | --- | --- |
| a digit (`0`–`9`) | that digit prefix — non-null garbage | wrong | **false**: nothing announces it |
| a letter (`a`–`f`) | `null`, so `restore()` walks further back | unset if nothing yields digits | **true** |

Only the second path is loud. So the `cycle N opens continuous` checks fail on
some runs and not others, while `chain verifies across 20 restarts` fails on
every run, because the chain forks either way.

The quiet path is the one that matters. It is what actually happened on the
device in §5d: the chain forked at every restart and the probe reported nothing
wrong, which is why `verify()` had to exist for the defect to be caught at all.
A defect that announced itself would not have needed a hash chain to find it.

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

### Get the journal out

**With a cable:**

```sh
adb pull /sdcard/Android/data/dev.orb.pass1/files/pixel.lane.jsonl
```

**Without one:** tap **Export and share journal**. It writes
`orb-pass1-<timestamp>.txt` to Downloads and opens the share sheet on it
immediately.

Written as `.txt` rather than `.jsonl` because upload and share targets filter
on extension, and a file nobody can attach is a file that never leaves the
phone. The contents are unchanged — one JSON object per line.

The second path exists because it is the only one on a phone with developer
mode off: since Android 11 the Files app cannot browse into another app's
`Android/data`, so without `adb` the journal would be unreachable and the probe
would produce no evidence at all.

The export appends a `probe.export` event *before* it copies, so the copy
contains the record of its own making. `SECURITY.md` §7 requires that data
leaving the device is recorded as history, and a copy into shared storage that
any app can read is exactly that — being convenient does not make it not a
disclosure.

The journal itself lives in external files rather than private storage so it is
readable without root. Wrong for a real runtime, right for an instrument whose
whole purpose is the evidence it produces.

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
| `probe.export` | the journal was copied to shared storage — a recorded disclosure |
| `probe.chain.discontinuity` | the lane's head could not be read on open, so what follows starts a new chain segment |

## A known break

A journal created before 2026-09-25 carries one chain break at the first process
restart: `restore()` read the head hash with a numeric extractor and got null,
so every restart began a new chain segment (`DEVICE_LOOP.md` §5d). Fixed, but
the break in an existing file stays — Art. I forbids rewriting history to make
it look tidy, and `verify()` reports every break rather than stopping at the
first, so anything new is still visible behind it.
