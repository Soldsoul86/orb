# Setup simplification — 0.1.2-dev

## Feedback

The user reports trying Veil on two phones and that it is working, with setup feeling cumbersome. This is a useful user-reported two-phone check. It does not specify device models, Android versions, text/photo/video coverage, capture attempts or optical watermark results; the individual A–J acceptance cases are not all marked PASS from this report.

## Behavior

New installations now offer **Get started**, using the existing hosted relay automatically. A different HTTPS relay remains available under **Use another server**. No network request is made until the user taps Get started. Existing vaults continue using their stored relay and identity.

Pairing has two labeled steps, **Send yours** and **Add theirs**. **Share my invitation** generates the existing invitation and opens Android's share chooser in one action. The user still chooses the recipient and app. Both people must share before importing; the text says this explicitly. The app does not claim the invitation was sent when the chooser opens, does not read the clipboard automatically, and still locks on leaving the app.

Identity comparison now shows one shared 60-digit number in twelve groups of five. Both people see the same number and must compare every group in person or over a trusted call before confirming. The app does not automatically verify identity, truncate the comparison, or send the number to the relay. Existing verified pairings are preserved. Under **Comparing with an older version?**, both original full SHA-256 identity codes remain available for cross-comparison with 0.1.1.

The number uses libsignal 0.105.0 `NumericFingerprintGenerator(5200).createFor(2, ...)`. Since Veil has no account name or phone number, each serialized public identity key also serves as that installation's stable identifier. Libsignal handles the fingerprint algorithm and symmetric display order. Public-key changes invalidate the controller's in-memory result cache. Generation runs in the existing serialized IO controller, not during Compose rendering. This is a display change using an established implementation, not a new encryption protocol.

Three shared JVM/Android native tests check symmetry, all 60 digits, stability after reloading key bytes, either identity changing, malformed inputs, and libsignal's published known-answer vector. Android CI also retains the four unlock/concealment regressions.

 Invitation format, Signal sessions, local vault format, deadlines and secure-window behavior are unchanged. This is an onboarding update, not a new pairing or cryptographic protocol.

## Installation and verification

Version code 3 / 0.1.2-dev. Intended as an in-place update to 0.1.1; retain existing identity and conversations. The new APK certificate is compared with the delivered 0.1.1 certificate before delivery. Do not uninstall or clear app data to test this update on an existing paired installation. If Android rejects the update, retain the existing installation and investigate the certificate/version error first.

The existing unlock regression checks now identify the Get started screen and still assert native cover removal, focus/background locking and repeated unlock. Exact CI, checksum and certificate results are recorded in STATUS.md after the build completes. Existing device data preservation is inferred from the unchanged storage paths/format and matching signing identity; an actual on-device upgrade test is still required.

The default relay remains a development service in Singapore; the free database expires November 14, 2026 and must be upgraded for continued use. See relay/HOSTING.md. Supplying a default address does not change those hosting limits.
