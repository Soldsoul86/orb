# Veil private guest pilot (work in progress)

This directory connects signed owner enrollment and automatic guest claims to the
exclusive Unix-only Matrix boundary. `app/src/guest` is compiled into the actual
Veil app with `-PveilGuestPilot=true`; the normal app build does not enable this
pilot. Signal contacts, controller identity, vault encryption and application
signing remain separate and unchanged. Public Discovery Send is still disabled.

Run the pinned dependency setup in `../integration/README.md`, then start fresh
**disposable** infrastructure with `python ../integration/start.py --pilot` and
`node serve.mjs`. Both ports bind exclusively to loopback (8765 service, 8766 web).
For the automated browser test only, select `node serve.mjs --test` then
`node test-browser.mjs`. Never publish the test fixture or runtime directory.

Build the official pinned Kotlin/JNI SDK using the existing interop workflow,
then build the real app from `apps/veil` with
`gradle -PveilPurposePreview=true -PveilGuestPilot=true :app:assembleDebug`.
The guest pilot application ID is `chat.veil.guest.pilot`, separate from existing
`chat.veil.purposes.preview` and production `chat.veil`. This preserves the user’s
installed preview and vault. The debug pilot does not establish upgrade/signing
continuity. CI builds x86_64 for the emulator and arm64 for the Pixel; use only
the artifact associated with a passing tested commit. See [Mac + Pixel setup](MAC-PILOT.md).

Configure an existing purpose in Browser messages using operator-supplied private
service origin, browser origin and a pre-provisioned disposable technical owner
account. Visitors never enter an account/password; the service creates their
technical routing account after a signed, nonce-bound bootstrap. The controller
and SDK keys are generated on the client and never uploaded privately. The QR
contains an independent owner pin and random invitation ID. A substituted initial
QR/link or malicious browser-delivered code remains a trust risk.

Pilot invitations expire after one hour and admit at most 20 browser identities.
A block applies to that identity, not a real person who can create another one.
The single gateway is the only Matrix ingress. Do not expose Synapse directly,
add workers, or enable rooms/registration/federation on a separate route.

No background/browser push notifications are implemented. The owner must open
and unlock the guest inbox; the visitor must keep their browser open or return
to the saved conversation URL in the same browser. “Received by service” is not
an owner-device acknowledgement. Browser-data deletion loses access; a saved
conversation URL cannot silently create a replacement identity.

This implementation is not pilot-accepted or launch-ready. The acceptance record
will distinguish tested commits and builds from remaining device/security gates.
Independent security review and explicit release authorization are required.
