# Orb Calls Probe — can an app like Orb be given the call-history permission here?

A throwaway instrument with one job (`docs/CALLS_PHONE.md` §0, `docs/DEVICE_LOOP.md` §7b82): find out, **on the operator's phone, installed the operator's way**, two things before any call feature is built.

| | Question |
| --- | --- |
| **(a)** | Does Android or Play Protect block or warn about **installing** an app that declares `READ_CALL_LOG`? |
| **(b)** | Once installed, **can the permission be granted** — is there a prompt, or does Android refuse silently ("restricted setting")? And can the call log then be read? |

It declares **exactly one permission and nothing else**, contains **nothing of Orb**, has its own package (`dev.orb.probecalls`) and its own throwaway key, and **Orb v45 is not touched**.

It shows **counts and one date**: whether the permission is held, what Android answered and how fast, how many calls the log holds, the date of the newest. It never shows, stores, logs or sends a number, a name or a time of day; it writes nothing. The report can be shared as text and holds nothing personal.

Build: `ANDROID_HOME=… bash build.sh` (see the script's header). The result is `build/probecalls/probecalls.apk`.
