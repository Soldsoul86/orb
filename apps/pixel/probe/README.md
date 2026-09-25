# Orb device probe — P0

Tests one thing: **does a self-signed APK install on the device under test?**
`../../../docs/DEVICE_LOOP.md` prediction P0.

It declares no permissions, no services, no receivers and no network access. The
subject is the install gate, so anything else it did would be a second variable.
On launch it shows what the device says about itself, which makes a successful
install self-evidencing — the screen carries the model and API level the result
should be recorded against.

## Why not any third-party APK

The gate under test is *developer verification*, so the APK must be signed by a
key we generated. A downloaded open-source APK might install because its
developer is already registered, which would look like a pass and prove nothing
about our case.

## Build

```sh
ANDROID_HOME=/path/to/android-sdk ./build.sh
# → build/probe/probe.apk           (package dev.orb.probe)

ANDROID_HOME=/path/to/android-sdk \
  ORB_PROBE_PKG=dev.orb.probec ORB_PROBE_LABEL="Orb probe C" ./build.sh
# → build/probec/probec.apk         (package dev.orb.probec, fresh signing key)
```

**Every test of the install gate needs a new package name.** Play Protect gates
on novelty, not identity (`DEVICE_LOOP.md` §5a), so an app it has already scanned
proves nothing about the gate — and neither does a rebuild of the same package.
A new `ORB_PROBE_PKG` also generates a new signing key, so the artifact is novel
by both measures. The activity prints its own package, which keeps a screenshot
unambiguous about which probe it came from.

Needs only the SDK: `build-tools;36.0.0`, `platforms;android-36`. No Gradle, no
Android Studio, nothing resolved from a network at build time, so the artifact is
reproducible from the SDK alone.

The keystore in `build/` is generated on the spot and is **not** an identity to
keep. A real build needs a key you hold and back up — losing it means never
updating that package again.

## Run the test

Two install paths, and they may be gated differently. Test both: the difference
between them is the difference between "cannot distribute" and "cannot develop",
which have very different consequences for this project.

**Path A — tap the file.** The path a real sideload takes.

1. Copy `orb-probe.apk` to the phone.
2. Open Files, tap it. Android will ask whether to allow installs from that app.
3. It installs, or it is blocked.

**Path B — over USB.** The path development takes. Tests P0a: whether `adb`
bypasses the Play Protect scan, and so whether every development build has to be
disclosed to Google or only every distributed one.

1. Settings → About phone → tap **Build number** seven times.
2. Settings → System → Developer options → enable **USB debugging**.
3. Connect the cable; accept the RSA fingerprint prompt on the phone.
4. `adb devices` — the device should be listed as `device`, not `unauthorized`.
5. `adb install <probe>.apk`

Use a package the phone has not seen. Reinstalling one that was already scanned
answers nothing.

## Record

For each path: installed, or blocked. If blocked, the **exact wording** and what
is showing it — Play Protect, a "blocked by Android" screen, something naming an
unverified developer. A screenshot is the record.

An answer either way is a result. A block is not a failed test; it is P0
answered, and it decides whether the next step is Kotlin or a signing identity.
