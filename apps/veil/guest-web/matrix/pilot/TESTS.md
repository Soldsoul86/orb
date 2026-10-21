# Pilot validation

`.github/workflows/veil-guest-pilot.yml` builds the real optional Veil guest adapter
and executes `GuestJourneyTest` through real Compose inbox actions. The browser
harness force-stops the Android app between two instrumentation processes and
restarts Chromium with its persistent profile. Only sanitized boolean outcomes,
versions, timings, APK hash and certificate metadata are uploaded.

`test-browser.mjs` tests pinned entry, response loss after acceptance, exact retry,
tab contention, refresh/reopen, signed approval/reply/block, cleared storage,
controller substitution and server plaintext-canary absence. Its owner is a
browser fixture: it is not evidence of Android integration.

Use disposable accounts only. Do not upload runtime, test credential assets,
raw browser profiles, traffic captures, SDK databases or server databases.
Physical camera scanning, cold mobile data, first-time human comprehension,
completion without coaching, TalkBack, background restrictions, original-certificate
upgrades and independent security review require separate evidence.
