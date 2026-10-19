# Contact preview verification

Only recorded completed runs count as PASS. Rendering UI inside a debuggable test app is not an OS screenshot bypass and does not prove encryption. No test removes FLAG_SECURE. Real Signal tests and the independent JOSE verifier remain separate.

## Required automation

- Original baseline: 9 Python provider tests, identity core and app JVM tests, 14 Android regressions; code at a606b85b933996aeb47003bd757d3a6b2ed656cb. Capture collection initially failed after Gradle uninstalled the target; a dedicated job now collects while installed.
- New provider cases: preview never reserves, idempotent create, non-owner denial, pending cancellation, accepted access independent of invitation cancellation/expiry, seven days from approval, old API cannot bypass invitation expiration.
- Same invitation tests on disposable PostgreSQL, restart persistence, existing v1 tables isolated from v3's `veil_portable` schema.
- Android: new navigation and temporary defaults; Work hours; malformed links; secure flag; capture actual Compose screens from in-process test rendering. Light/dark and large-font checks recorded separately.
- Two emulators: opaque link, repeated preview without local identity, explicit request, approval, native Signal message/reply, server cancellation and relationship revocation. Then rerun original two-provider portability sequence: stop A, remove its DB, restore backup, independent verifier, new conversation/reply through B.
- Signer and upgrade: restore the existing preview signing cache; compare pinned certificate, install v5 first, seed encrypted vault, install v6 with `adb install -r`, verify identity and vault contents. Never uninstall a user's installation or substitute another signer.

## Five-person usability study — NOT TESTED, people required

Recruit five first-time participants independently. Do not explain identity/provider concepts first. Give each the same clean app and a partner's phone. With consent, observe actions rather than collecting message content.

Tasks: (1) invite a temporary contact; (2) partner opens link, previews and requests; (3) accept and exchange a message; (4) explain when the invitation and approved access end; (5) end access; (6) find backup and explain what is needed to restore; (7) find migration and explain how a contact reconnects.

Record for P1–P5: taps from unlocked Chats to Android Sharesheet, elapsed time (report network wait separately), wrong turns, assistance, whether expiry was understood, success/failure, exact hesitation wording, text scaling needs. No results are filled until sessions occur. Desired outcome: four of five complete temporary sharing without help within 30 seconds excluding server startup. This is a target, not a claim.

## Physical phones — DEVICE REQUIRED

Install as an update to the existing *Veil Purposes Preview*, open via actual messaging apps and browsers, test Sharesheet return and biometric re-unlock; QR scan, verified Android link association; font sizes and TalkBack, rotation, offline retries and cold Render startup. Compare full safety numbers. Retest screenshots, recording/sharing, app switching, hold/release media and photograph the watermark with another camera. Emulator passes never substitute for these observations.
