# Settled — findings that look like discoveries and are not

> Status: **standing register.** Opened 2026-09-28.
> Read this **before** reporting any anomaly in a device export, a journal, or a
> self-test result as news.

Every entry here was established once, with evidence, and written up somewhere
longer. They are listed again because each one **presents as a fresh defect** to
anyone meeting it cold — including the author of this file three days later, and
including any assistant whose context has been summarised since.

The failure this register exists to stop is not forgetting. It is **re-deriving**:
reading the code and the data, reasoning correctly from them, and arriving at a
conclusion that a document already settled better. That happened on 2026-09-28,
twice in one conversation, in both directions — a known break reported as alarming,
and then a true statement "corrected" into a false one.

**How to use it.** If you are about to say *this is broken*, *this is new*, or
*this needs fixing*, check whether it is below. If it is, read the section named in
the last column before saying anything.

---

## The register

| Looks like | What it actually is | Decided in |
| --- | --- | --- |
| A **chain break at line 4** of pass 1's journal — `"previous": "35"` | The §5d defect's signature: a numeric extractor that read a hash's digit prefix, written 2026-09-25 by a build that still had the bug. **Historical, permanent, and correctly reported.** Art. I forbids editing history, so it can never be repaired, and everything after it links perfectly across four restarts | `DEVICE_LOOP.md` §5d, §5h |
| `chain.linksEndToEnd` **FAILED** on the running pass-1 build | Correct and expected **on that build**. It is not a new failure and not a bug in the self-test. §5j's fix **renames the check to `chain.noNewBreaks`** and compares break *positions* against the previous `probe.selftest`, so once installed `chain.linksEndToEnd` stops existing: a first run records `chainBaseline: true` and passes, and only a **new** break fails after that. **Seeing `chain.linksEndToEnd` at all means a build from before the fix.** A check that always fails is worse than no check | `DEVICE_LOOP.md` §5j |
| A package install or uninstall producing **no `signal:…PACKAGE_*` reading** | Expected. **P19 is refuted**: the broadcast never arrives, proven with the process alive, launched, and never force-stopped, while the same receiver's `BOOT_COMPLETED` filter fired in the same export. Do not re-propose the broadcast as a prompt route, and do not explain a silence by the force-stop — that explanation fitted the facts and was not the cause | `DEVICE_LOOP.md` §7b10 |
| `signal:…BOOT_COMPLETED` at a **non-zero uptime** | Not a reboot. **P17 is refuted**: delivered five times inside one boot session, every event deriving the same boot instant to the millisecond. Only `elapsedRealtimeMs` can date a boot. It appears to mark a force-stop since the app last ran (P20, control half still open) | `DEVICE_LOOP.md` §7b2, §7b4, §7b9 |
| The installed **pass 2 refusing to update** — *App not installed* | Signature mismatch. The build environment's keystore is not the one that signed it, so that install can never be upgraded, only removed, and its journal goes with it. The current build runs beside it as `dev.orb.pass2b` on lane `grants-b` | `DEVICE_LOOP.md` §7b8 |
| **Pass 1 hanging on launch**, then *isn't responding* | An unbuffered `RandomAccessFile.readLine()` in `Journal.readLines` — one syscall per byte, 1,017 ms per pass against 6 ms buffered on a 3.3 MB lane, and the launch path walks it six or seven times. **Fixed in source 2026-09-28, not installed.** Not a crash, and not the journal's size | `DEVICE_LOOP.md` §7b11 |
| A reading with **`Readable: false`** | *Cannot check*, never *nothing is enabled*. A failed read must never be rendered as an empty holding set; the whole signal exists because those are opposite facts | `DEVICE_LOOP.md` §7b, `packages/device-watch/DESIGN.md` |
| A reading with **`baseline: true`** | *No history to compare against*, never *compared and unchanged*. A first look that reports what was already there as news says FAILED for ever and means nothing (§5j again, one level down) | `DEVICE_LOOP.md` §5j |
| An observation carrying **no `installedPackage*` fields at all** | *This event is not about that.* Observations report the three grants; a scan reports the package set, on its own event type and cadence. An absence here is not a failed read, and recording it as one would be the `Readable: false` error in a new costume | `DEVICE_LOOP.md` §7b7 |
| An alert answered **`dismissed`** | The person recognised the change as their own doing. It is **not** a false positive — that would be an alert for a change that did not happen, and there has not been one. Counting dismissals as errors would tune the rule in exactly the wrong direction | `DEVICE_LOOP.md` §7b10 |

---

## Rules for this file

**One line per entry, and a pointer.** The argument lives where it was made. If an
entry here starts explaining itself at length, the explanation belongs in the
document it cites and this row should shrink again.

**Add an entry the second time something is re-derived, not the first.** A finding
written up once is a finding; one that gets rediscovered is a trap, and only traps
belong here.

**Remove an entry when it stops being surprising** — when the thing it describes is
fixed, installed and forgotten for the right reasons. A register that only grows is
one nobody finishes reading.

**Never let an entry here stand in for the evidence.** These are signposts. Anything
load-bearing gets re-read at the source before it is acted on, because a summary of
a finding is exactly the kind of second source of truth Art. IX §33 refuses.
