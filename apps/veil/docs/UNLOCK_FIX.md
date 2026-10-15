# Unlock cover regression — 0.1.1-dev

## User-visible failure

Android accepts the fingerprint/PIN, but Veil still displays “Veil is locked / Tap to unlock.”

## Cause and change

Focus loss when opening authentication makes the native privacy cover visible. The old Compose root scheduled `contentCommitted()` in a `SideEffect`, while reading `unlocked` only in a child composition and inside the effect. State reads in an effect do not subscribe the root composition. The child could redraw the setup screen successfully without rerunning the root effect that removes the cover.

The root now reads `unlocked` during composition and passes that captured value to the commit callback. The callback additionally checks the current lock state, so a stale unlocked commit cannot uncover content after a lock. Immediate native concealment, clearing sensitive state, biometric/device credential authentication and FLAG_SECURE remain in place.

## Regression test

`UnlockRegressionTest` drives the real Activity, Compose rendering and native cover in Android instrumentation. It invokes the private accepted-authentication callback using test-only reflection; it does not bypass or certify Android’s biometric/PIN matcher. Tests check both Compose setup content and native cover visibility, because a semantics-only assertion could miss the obstructing native view. They also exercise focus loss, background/resume, repeated unlock and a stale commit after lock. No Intent or public authentication bypass is added.

All 4 selected instrumentation tests passed on an Android 15/API 35 x86_64 emulator in run 38707141433. Exact execution results and the signed 0.1.1 APK are recorded in STATUS.md. Physical biometric/device-credential behavior still requires a retest on the affected phone.

## Updating the development APK

Version 0.1.1-dev uses version code 2. Earlier CI builds generated temporary debug signing keys. The old and replacement APK certificates were compared and differ. Uninstall **Veil** and install the new APK. Uninstalling deletes Veil’s local identity/messages and requires pairing again; do not uninstall any unrelated Orb application. Preserve any data you need before doing this. CI now caches the Veil debug key for subsequent test builds, but cache eviction can still change it. Production signing remains separate release work.
