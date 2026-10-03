# Orb SMS Probe — can an app like Orb be given the text-message permission here?

A throwaway instrument (`docs/SOURCES_PHONE.md` §5, `docs/DEVICE_LOOP.md` §7b83), the twin of `probe-calls`. Play Protect's published sideload block names `READ_SMS` and `RECEIVE_SMS` and runs in India, so reading texts by permission was judged "probably closed"; the operator asked to **measure it on his phone before anything is built**.

| | Question |
| --- | --- |
| **(a)** | Does Android or Play Protect **block or warn** about installing an app that declares `READ_SMS`? |
| **(b)** | Once installed, **can the permission be granted** — a prompt, or a silent refusal (hard-restricted)? And can the inbox then be counted? |

A **separate package** (`dev.orb.probesms`) from the calls probe, on purpose: if Play Protect blocks this one, the calls answer is not muddied. It declares **exactly one permission** (`READ_SMS` — not `RECEIVE_SMS`, not `SEND_SMS`), contains nothing of Orb, and shows **a count and one date** — never a sender, a message or a time of day. It writes and sends nothing.

Build: `ANDROID_HOME=… bash build.sh`; check: `bash tests/check.sh`.
