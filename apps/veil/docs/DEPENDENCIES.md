# Major dependencies and licensing

| Component | Pin | Role |
|---|---|---|
| libsignal-client + libsignal-android | 0.105.0 | Upstream Signal protocol and native implementation; no custom crypto protocol |
| Kotlin / Compose compiler plugin | 2.2.20 | Android application |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.13 | Build; JDK 21 |
| Compose BOM | 2024.12.01 | Material 3 dark UI |
| AndroidX Activity / Fragment | 1.9.3 / 1.8.5 | Compose host and lifecycle |
| AndroidX Biometric / Lifecycle | 1.1.0 / 2.8.7 | Device authentication and scoped work |
| AndroidX Media3 | 1.5.1 | In-app memory-backed MP4 playback |
| OkHttp | 4.12.0 | TLS transport, bounded response handling, no HTTP logger |
| Python / SQLite | Python 3.12+ standard library | Opaque relay; no pip dependencies |
| Caddy | Operator-provided maintained v2 | Public HTTPS termination; deployment config unexecuted here |

The Signal version and Java/Kotlin signatures were inspected using upstream tagged source. Direct application dependencies are pinned for reviewability; the supplied CI actions currently use version tags and should be commit-pinned during supply-chain review. They have not been resolved or checksum-verified in this environment. Other Android dependencies also need current vulnerability/compatibility review during the first successful build. No analytics, trackers, remote image fetcher or hosted AI service is included.

libsignal is **AGPL-3.0-only**, maintained for Signal's own use; its external API is not a stable supported third-party contract. Its licensing obligations affect distribution of this application. Retain upstream notices and provide compliant corresponding source when distributing; the standalone Veil application source is AGPL-3.0-only with the license text included at ../LICENSE. Production release packaging is not established by this development deliverable. AndroidX and OkHttp generally use Apache-2.0; generate a resolved transitive license inventory before shipping. No production signing key or release artifact exists here.

Sources inspected:

- https://github.com/signalapp/libsignal/tree/v0.105.0/java/shared/java/org/signal/libsignal/protocol
- https://github.com/signalapp/libsignal/blob/v0.105.0/README.md
- https://github.com/signalapp/libsignal/blob/v0.105.0/java/build.gradle
- https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_SECURE
- https://developer.android.com/privacy-and-security/risks/secure-display

## Optional hosted storage

The hosted Render relay adds `psycopg[binary]==3.3.6` (Psycopg, LGPL-3.0-only) and managed PostgreSQL 17. The SQLite self-hosted path still uses only the Python standard library. Production corresponding source is in relay/postgres_store.py and relay/server.py; credentials are environment-only and never committed. See relay/HOSTING.md for storage, expiry and provider metadata limits.
