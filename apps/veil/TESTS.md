# Tests

From this directory: `python3 -m unittest discover -s relay -v` and `gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` with JDK 21, Gradle 8.13 and Android SDK 35 installed.

Native and device checks: `gradle :app:connectedDebugAndroidTest`. The two-phone harness and physical A–J procedures are in [docs/TESTING.md](docs/TESTING.md). Test data must be synthetic. Build results, native encryption results, emulator results and physical verification are distinct claims.
