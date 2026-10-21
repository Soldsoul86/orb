# Veil discovery V0.1 — development preview

**Public launch: BLOCKED. Secure browser messaging is not available yet.** This is working local discovery, signed publication, and an authenticated contact-address preview. It is not a working browser chat or a publicly populated professional directory. Do not deploy it or distribute an APK from this branch.

Branch: `feat/veil-discovery-v01`. Integration base: `codex/veil-guest-gate` at `53eee234b03fb731b434662f2bd041d3755ca843`. At audit, PR [#7](https://github.com/Soldsoul86/orb/pull/7) and [#8](https://github.com/Soldsoul86/orb/pull/8) were open drafts. PR #8 contains PR #7's head `f3d07102f08b16ee635e9971395212f7bec53b00` plus 24 guest foundation files. No repository/workspace `AGENTS.md` was found. No unrelated branch was merged.

## What works

- Exactly four categories; deterministic task/constraint parsing, PostgreSQL full-text candidate retrieval, stable ranking and explained zero results. No external model or paid API.
- Existing purpose owners review and sign public fields using their existing Android vault/controller. A small **Reach me → Be found** entry point handles the signed-file/text handoff. No private keys or recovery packages enter the browser.
- Private browser drafts by default, local category suggestions, explicit preview and publish consent. Signed public/link-only/private/deletion changes use monotonic revisions. Link-only means an owner-held signed export in this preview; no unlisted directory HTTP page is hosted.
- A replaceable PostgreSQL read model, signed export/import, an offline Python verifier, a browser verifier and a Kotlin/Nimbus signer using the existing `pi/1` ES256/JWK-thumbprint identity suite.
- Public profile and contact-address views verify the controller pinned in the profile URL and the signed route. The existing guest address verifier and fail-closed gate are reused. No plaintext contact form, guest-send adapter, arbitrary portfolio fetch, tracker, account, phone or email collection.
- Reporting, operator hosting refusal, owner pause/unpublish, and minimal removal tombstones. Original provider approvals/revocations remain authoritative for contacts.

See [API and trust contract](API.md), [setup and owner handoff](RUNBOOK.md), [search evaluation](SEARCH.md), [security and release scorecard](REVIEW.md).

## Scope and compatibility

`discovery/` contains the isolated directory, web assets, migration, verifier and tests. The migration creates **only** `veil_discovery`; it does not alter relay or `veil_portable` tables. It requires PostgreSQL with `tsvector`/GIN (tested locally with the disposable PostgreSQL bundled by pgserver; CI specifies PostgreSQL 17). No SQLite search emulation.

`DiscoveryPublication.kt` adds a canonical signed publication format to identity-core without changing `IdentityCore.kt`. `DiscoveryOwner.kt`, two lines in `ContactHome.kt`, and additive `PortableSession` methods provide the existing-owner handoff. Signal/session implementations, package IDs, signing configuration, encrypted vault envelope and original guest gate files are unchanged. Optional `discovery_*` metadata is stored inside the existing encrypted purpose record. Older app builds ignore it; existing backup exports do not carry that new revision metadata. After restoring an old backup, do not blindly republish: a directory correctly rejects stale discovery revisions. Recovery/reconciliation of the publication counter is a remaining limitation.

No APK was installed, no app was reset, and no live provider, relay, key or recovery material was accessed. Existing Chats / Reach me / Settings remain intact. Android UI screenshots and physical-device usability are not claimed.

## Actual browser captures

These are screenshots of functioning mobile Chromium screens using labelled **TEST** identities, not image-generated mockups or real supply.

- [Private owner draft](evidence/mobile-owner-private.png)
- [Search results](evidence/mobile-search.png)
- [Signed public profile](evidence/mobile-profile.png)
- [Authenticated contact / send disabled](evidence/mobile-contact-disabled.png)
- [Empty results](evidence/mobile-empty.png)
- [200% text](evidence/mobile-large-text.png)
- [Network error](evidence/mobile-network-error.png)

Two minutes to publish and 30 seconds to send an encrypted request are unmeasured usability targets. The current manual Android/browser handoff needs user testing, and the second target cannot be tested until the E2EE gate passes. No professionals were recruited or invented for public launch.
