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
# → build/orb-probe.apk
```

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

**Path B — over USB.** The path development takes.

1. Settings → About phone → tap **Build number** seven times.
2. Settings → System → Developer options → enable **USB debugging**.
3. `adb install orb-probe.apk`

## Record

For each path: installed, or blocked. If blocked, the **exact wording** and what
is showing it — Play Protect, a "blocked by Android" screen, something naming an
unverified developer. A screenshot is the record.

An answer either way is a result. A block is not a failed test; it is P0
answered, and it decides whether the next step is Kotlin or a signing identity.
