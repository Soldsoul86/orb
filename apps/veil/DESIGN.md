# Design boundary

This is the private-messenger application explicitly requested for this repository on 2026-10-15. It is a standalone Android application (`chat.veil`) and not an implementation of Orb's personal runtime. It does not read, mutate, replace or replicate existing Orb journals or installed probe identities. Its disappearing-message storage must not silently become permanent Orb history. Integrating it with the Event Journal requires a separate, explicit retention/consent design; no Orb architectural invariant is changed here.

See [the messenger architecture](docs/ARCHITECTURE.md) and [threat model](docs/SECURITY.md). GitHub Actions builds this application independently from the existing TypeScript runtime and Android probes. A successful APK build does not verify two-phone communication or physical capture behavior.
