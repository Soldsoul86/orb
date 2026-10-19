# Veil 0.3.1 contact preview

## What changed

- Chats, Reach me and Settings replace the infrastructure-first start screen.
- New contact → Temporary → Share invitation creates the local identity and a private URL, then opens Android's Sharesheet. No phone/email, server form or key-management step is required.
- Temporary invitations expire after seven days. Accepted access lasts at most seven days from the owner's acceptance; the exact end date is visible. Work and Personal default to 30 days of approved access.
- Link previews do not reserve access. Recipients send an introduction; owners Accept or Decline. End access takes a tap plus confirmation.
- Share again, Copy invitation, matching QR code and Cancel invitation are available. Pending cancellation and permission changes are labelled until acknowledged by the service.
- Work uses the device timezone and explains contact hours, queued delivery and silent in-app notifications. Rules sit behind Change rules.
- Back up my identity and Move my identity are in Settings. Moving preserves identity control and eligible relationships, not message history; contacts still need a new signed address through another channel.
- Native light/dark theme, larger readable labels and preserved Android capture restrictions.
- Invitation QR decoding accepts QR format only, fixing occasional false barcode-format detection.

## Preserved

Package `chat.veil.purposes.preview`; original preview signing certificate; Android Keystore alias and encrypted vault formats; Signal message/media encryption; identity JWS/JWE formats; user-held recovery secret; migration protocol. The existing personal media chat remains available for photos, videos and Eyes-Only.

## Installation

Use the APK inside this delivery as an **update to Veil Purposes Preview**. Do not uninstall or clear its data. Android will retain the installation's private data when the package and signer match. This is not a signing-compatible update to the separate original `chat.veil` application whose old signing key is unavailable.

On both phones: install, unlock, then one person chooses New contact → Temporary → Share invitation. The friend opens the link (or pastes it using Open an invitation), introduces themselves and requests contact. The sender opens the request and taps Accept. Compare the entire safety number under Contact details through a trusted channel before relying on the displayed name.

If a browser opens the landing page, tap Open in Veil. If the app is not installed, install it and tap the original invitation again; there is no automatic deferred-link recovery. Android's verified-link association depends on OS/browser behavior. Personal media chat uses the existing separate pairing flow.

## Limits

Portable contacts support text only. Invitations are approval-gated but not single-recipient; four initial channel slots and existing wallet/service quotas apply. A name is chosen by its owner and is not proof of a person's real identity. Ending access stops future service-authorized contact, not copies already made. Disappearing messages cannot guarantee deletion from a modified recipient device. The service sees routing/timing and signed access metadata, not message plaintext.

The hosted free relay can be slow to wake. No push notifications or background delivery guarantee. New contact addresses must be shared explicitly after moving services; old invitation capabilities are not part of portable backups. Capture protection cannot stop a second camera or a compromised device. This remains a development preview, not an independently audited production messenger.

Screenshots use synthetic data rendered by test code inside the actual app; FLAG_SECURE is never disabled. They illustrate UX, not proof of encryption. Physical-phone and five-person usability verification are recorded separately and must not be inferred from emulator tests.

Opaque invitation lookup still relies on the service to return the intended initial contact identity. A malicious resolver could substitute an unverified identity. Compare full safety numbers out-of-band; the app does not label an accepted request “verified.” The signing process is the preserved development-preview workflow, not a production key-management setup.
