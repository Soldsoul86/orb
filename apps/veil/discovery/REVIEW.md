# Review and launch-readiness scorecard

**Overall: BLOCKED for public launch.** Draft only. No production deployment, APK distribution, key rotation, live relay modification or installed-app update was performed.

## Evidence from this branch

| Gate | Status and evidence |
|---|---|
| T1 private default | PASS: browser draft is local, local suggestions, private records absent from directory reads; real owner operation tested with existing vault/provider |
| T2 signed opt-in | PASS: explicit preview/consent; Kotlin/Nimbus and PortableSession outputs verified independently in Python and Chromium |
| T3 four-category search | PASS with explicitly labelled synthetic TEST fixtures; genuine professional supply NOT POPULATED |
| T4 constraints / zero results | PASS: 80-case PostgreSQL evaluation, 16 hard negatives, no hard-constraint or relevance violations in this development set |
| T5 authorization / replay | PASS: wrong key, forgery, tamper, duplicate/noncanonical JSON, unsigned/stale revisions and stale route/policy rejection |
| T6 privacy/index leaks | PASS: private, link-only, removed, expired, blocked excluded from direct public reads and FTS; sitemap empty; no autocomplete; noindex/no-store preview |
| T7 purpose separation | PASS in signed documents/HTTP; existing independent controller/device keys reused, no root ID or cross-purpose analytics; IP/names/timing remain possible correlation channels |
| T8 provenance | PASS in browser: owner-stated claims, budgets, evidence, hours; key control is not credentials; no ratings or invented real supply |
| T9 policy bypass | PASS for disabled contact surface and existing provider tests; actual guest-policy enforcement remains BLOCKED with the guest adapter |
| T10 existing Android/identity/Signal/portability | PASS: 5 identity-core tests, 26 app JVM tests, lint 0 errors / 29 warnings; 20 provider and 32 relay PostgreSQL tests. Instrumented regression CI configured separately; local emulator/physical upgrade NOT RUN |
| T11 browser E2EE | **BLOCKED**: unchanged guest gate, send adapter throws, mutation paths refuse every send before body parsing; no plaintext fallback |
| T12 browser accessibility/states | PASS: real mobile Chromium, keyboard focus, 200% text without horizontal overflow, network errors and empty results; physical TalkBack NOT TESTED |
| T13 independent portability | PASS: exact Kotlin and actual owner exports verify offline without private keys or Veil lookup; second operators can consume the same envelope/API contract |

Local results: 18 discovery tests; 80/80 expected search sets; independent Python/Chromium checks of two Kotlin public fixtures; 11 original guest Node tests and 4 original guest Python gate tests. Screenshots are actual browser captures with TEST supply. Android compilation/JVM/lint succeeded using a temporary JDK/SDK; nothing was installed on a device. The new instrumented owner-consent screen test and the existing native regression classes are wired into the draft's CI. Do not interpret configured or pending CI as a pass.

Search fixed-denominator Precision@3 is **0.4635**. Returned-result Precision@3, Recall@5 and zero-result precision are **1.0** on this small, in-sample fixture set. See [limitations and measurements](SEARCH.md) and [machine-readable results](evidence/search-evaluation.json). No real-market relevance, availability, reply-rate, or usability measurement is claimed.

## Security/privacy review performed

- [x] Reused existing per-purpose controller and independently signed route. No wallet key, root ID, recovery secret or Signal session enters the document or web form.
- [x] Kept `IdentityCore.kt`, original guest gate, Signal/session code, Android package/signing configuration, relay and provider implementations unchanged.
- [x] Exact signed schema/typed fields, bounded bodies, canonical payload, strict JSON, public-key-only JWS header, controller/state binding, publication and state/policy replay checks.
- [x] Cross-process PostgreSQL advisory transaction lock around competing updates; equal semantic retry permitted, changed equal revision rejected. Removal retains minimal replay counters/digests rather than old profile content.
- [x] Every public read filters visibility/expiry/operator refusal and re-verifies the signed document. No unpublished fields in public metadata/sitemap/autocomplete. Link-only exports have no directory fetch path.
- [x] Same-origin/Host checks, parameterized SQL, finite candidate/result quotas, ephemeral IP rate limits, request timeout/body cap, no raw query/body logging, no third-party assets or analytics.
- [x] Text-only rendering of user strings, HTTPS external link validation, noreferrer, no server-side URL crawling, restrictive CSP and no private browser storage. Private owner suggestions run locally.
- [x] Same signed controller determines the contact route; URL pin substitution rejected in Chromium. First discovery is honestly TOFU. No assertion of current remote guest-page availability or universal freshness.
- [x] Existing provider policy is updated by the owner operation; another purpose remains unchanged. Paused/disallowed state cannot advertise accepting enquiries. Directory removal does not masquerade as grant revocation.
- [x] Guest mutation endpoints refuse body parsing; shared send adapter cannot be enabled by DOM edits or config. Public launch remains blocked despite successful discovery tests.
- [ ] Independent security review, signed-web-delivery threat review, robust multi-instance/Sybil/abuse operations and real operator independence.
- [ ] Physical Android/browser owner handoff, existing-installation upgrade exercise, TalkBack and usability target measurements. Existing instrumented regressions must be reviewed when CI completes.

This checklist records implementation review and executable evidence, not independent certification. A public website's delivery operator remains in the browser trust chain. A hostile directory can omit profiles or serve stale content until locally known revisions/expiry reject it; there is no global freshness registry. Portfolio links are self-provided and never verified by scraping.

## Three highest-impact remaining blockers

1. **Secure guest messaging:** PR #8 still has no reviewed compatible browser Signal adapter, exact browser↔Android encrypted request/reply proof, or independent integration review. Discovery does not alter that scope. All guest sends remain disabled.
2. **Owner/device validation and recovery:** review the fresh-emulator CI, exercise the complete manual Android/browser handoff on a physical phone without disturbing existing installations, measure usability/accessibility, and reconcile discovery revision metadata after old identity-backup restores. The two-minute publishing target is unmeasured.
3. **Public-directory operations and genuine supply:** independent review, production HTTPS/rate/Sybil controls, abuse and opt-out process, periodic expired-content scrubbing, held-out search evaluation, and genuine opt-in professionals per category. No public deployment or recruitment was attempted.

## Audit trail and reproducibility

Initial integration audit selected PR #8's exact head because it already contains PR #7 and the disabled guest verifier. No `AGENTS.md` existed. Initial test failures were not concealed: one test incorrectly reused a state revision across a visibility change (fixed fixture), five search judgments exposed general parsing shortcomings (documented in SEARCH), and the browser harness initially used an eval-style wait blocked by the intended CSP (fixed harness without weakening CSP). Toolchain provisioning required temporary writable Android/Gradle directories and a full JDK; PostgreSQL baseline tests correctly refused the initial wrongly named disposable DB, then passed in their required `veil_test` DB. None required weakening an application security control.

Use [RUNBOOK](RUNBOOK.md), [schema](migrations/001_discovery.sql), committed test judgments and `.github/workflows/veil-discovery.yml`. CI is review evidence, never a public-release switch.

The draft's unrelated Orb [verify run 39579543931](https://github.com/Soldsoul86/orb/actions/runs/39579543931) passed lint, build, independent-package compilation and tests, then failed **Hard exit demonstration** with `TypeError: event.risk.measured.toFixed is not a function` (job 119153433769). This matches the known PR #7/#8 baseline failure. The discovery diff does not touch its runtime packages or scripts. It has not been hidden, waived, or “fixed” by changing unrelated code.
