# Sensor Declaration — Grants

> Status: **declaration, 2026-09-29 — written after the sensor was built.** Unlike
> `SENSOR_SHARE.md`, which was declared before any code, this one describes what has
> been running since 2026-09-26 (`apps/pixel/pass2`, then `apps/pixel/orb`) and
> **proposes its name**. The name and the one-sensor shape are unreviewed; §2 says
> what would change if they are rejected.
>
> Contracts it stands on, **all Accepted**: `Sensor`, `Observation`, `Event`.

The phone looks at what currently holds power over it — the accessibility services,
notification listeners and device admins that are switched on — and, when the
operator has allowed it, at which apps are installed. It reports **what it saw**,
every time it looks, changed or not.

---

## 1. What it perceives, and why

`MOBILE_SENSING.md` §4.4 — *"Is the device itself under attack?"* — the group that
document calls the one most often skipped and the one that matters most for a system
holding a decades-long record of a life. A new app with Accessibility or Device Admin
is **the classic stalkerware install: cheap, high-value, low-noise.**

The occasion was measured, not imagined: on 2026-09-26 an accessibility service was
enabled on the operator's phone, a third-party payment app detected it within hours
and refused to run, and the journal held no record that anything had happened
(`CLAIMS.md` C1, route **A6**).

| | Reads | Permission | Cadence |
| --- | --- | --- | --- |
| The three **grants** | enabled accessibility services, enabled notification listeners, active device admins | **none** — confirmed P12–P14 | every wake |
| The **installed set** | which packages are installed, as a set to compare against last time | `QUERY_ALL_PACKAGES` for the full set; **gated by a recorded grant** (`PackageAccess`) | on its own interval, and on operator request |

The installed set **is not a grant**: an app appearing is not an app being given power.
It is here because a set can be compared with history and a broadcast cannot
(`DEVICE_LOOP.md` §7b5), and the broadcast was measured never to arrive at all (P19).

## 2. Registration (`Sensor.md` §2.1)

| Field | Value |
| --- | --- |
| `id` | `orb.sensor.grants` |
| Source identity | `orb.sensor.grants@<install>` — see §4 |
| Signal class | what holds power over this device, plus the installed-package set as a comparison set |
| Schedule | **trigger only.** The runtime does not poll; Android delivers, and the phone derives the rest from history (below) |
| Emits | `grants.observed` and `grants.packages` device events, translated to Observations on import |

**One sensor, not two.** The two event types differ in cost and cadence, not in
purpose: both are *a named set, compared against what the journal last recorded*, and
both exist to catch a change in what has power over the device. What needs its own
authorization is the **read** of the package set, and that is a Capability
(`installedPackages.read`, tier `Observe`, `Capability.md` §8), not a sensor. If two
sensors are preferred, the only change is a second id and source label; no record on
the phone changes, because the event types already differ.

**What wakes it** (none of them the sensor itself):

- process start — every launch, including the ones the platform causes;
- `BOOT_COMPLETED`, which is what `DEVICE_LOOP.md` §7b21 established also marks a package
  leaving the stopped state;
- a change to the two settings that have a URI (accessibility services, notification
  listeners), observed while the process is alive;
- the package-added, -removed and -replaced broadcasts, which are registered and have
  **never arrived** (P19, refuted) — the filter is kept so a platform that starts
  delivering them says so;
- the operator's scan button.

**The scan's own cadence is derived, not held.** At a wake, a scan is taken if the last
one in the journal is older than twelve hours — `lastOfType`, not a saved timer — so
the cadence survives process death because it was never in the process (`Scheduler.md`
§8). Twelve hours is a guess, and is now the whole detection latency for an install,
because the package broadcast never arrives (§7).

## 3. What the Observation carries

One Observation per **look**, not per thing perceived (`Observation.md` §1): the device
was looked at once. Its `data` is `DeviceAuthorityReading` (`packages/device-watch/src/
reading.ts`): `because` (what caused the look, e.g. `process.start`, `operator.scan`,
`signal:android.intent.action.BOOT_COMPLETED`) and one entry per kind read.

| Per kind | Meaning |
| --- | --- |
| `readable` | **`false` is *cannot check*, never *nothing is enabled*.** A read that failed must not look like a device that holds nothing |
| `baseline` | **`true` is *no history to compare against*, never *unchanged*.** A first look reports nothing as news |
| `holding` | the set, only when readable |
| `scope` | for the installed set: `all`, `visible` (permission omitted, §7b40), or `ungranted` (the scan was refused) |
| `gained` / `lost` | what changed since the last look taken under the same scope |

**Confidence is 100 for the occurrence and says nothing about the content.** There is
no inference: the value is what the OS returned, and uncertainty has its own fields
(`readable`, `baseline`, `scope`) and does not belong in the confidence.

**A refused scan is still an Observation**, with `readable: false` and scope
`ungranted`. *The scan did not run because nobody authorized it* and *the scan ran and
found nothing* are opposite facts.

## 4. Source naming — the convention for every sensor

> **A sensor is `orb.sensor.<name>`. What perceived an Observation is
> `orb.sensor.<name>@<install>`.**

`Observation.md` inv. 3 asks *what perceived it*, and the answer is a sensor at an
install — never an app, and never the importer that carried the file. The install is the
event's `device`, fixed when the event is written. For `dev.orb.app` that is the
random per-install identity (`AD-8`); for the retired pass-2 lanes it is the handset
name, because that is what those builds wrote.

**This replaces `pass2@<device>`.** That label named an app you have since retired, and
it was applied to readings the consolidated app now writes. Which *app* wrote a lane
remains knowable from the replicated event (`lane`, `device`); the Observation's source
says what perceived, which is the same sensor across builds. **Nothing is renamed in
history**: event types (`grants.*`) are permanent, and Observations are minted at import
into a journal of the reader's own — none existed in this repository or in the
environment where this was changed (`.orb-local/` is gitignored and absent), and a
journal on the operator's own machine, if there is one, keeps the old label
immutably for whatever it had already imported.

The source is **derived from the event's type and device**, both fixed at write time, so
no field is added to the phone's record (Art. IX §33). What the source cannot say is
independence between sensors, which is `AD-6`'s question.

### What stays an Event

`Observation.md`: *Observations originate from reality, Events from runtime activity.*
Four phone event types sit under the `grants.` prefix and are about Orb itself, so they
are replicated and translated into nothing: `grants.exits` (why Orb's own process ended),
`grants.capability.granted` and `.revoked` (what the operator allowed Orb to read),
`grants.watch.failed`. The prefix is history and cannot be renamed; it does not make
them readings.

## 5. What this sensor must never do

1. **Issue a verdict.** A grant appearing is usually the owner installing something.
   Whether a change is alarming is interpretation, and lives in `device-watch`'s rule,
   above this — `Art. XI §42`.
2. **Read more than this.** Three grants and, under a grant, one package set. Nothing
   else about the device.
3. **Send anything anywhere.** Local read, local record.
4. **Render *cannot check* as *none*.** The oldest entry in the register.
5. **Ask for an `AccessibilityService`.** It reads which are enabled; it never requests
   one (`DR-2`).
6. **Hold the package scan open ambiently.** It runs only after a recorded grant, and the
   grant, the revocation and a refusal are all events (`AD-7`, half paid).

## 6. Relation to `AD-7`

The three grants need no permission. The package scan is the read `AD-7` records: it was
decided in a manifest, with no declaration. This document does **not** close that. It
records the sensor honestly and confirms the interim shape — a recorded grant before the
read — and leaves the read's proper declaration, tier and Policy rule to the permission
code (`DR-13`, Phase 3c).

## 7. Honest limits, stated once

- **A missed change is recovered, an undone one is not.** Comparison reports on
  endpoints: a grant given and withdrawn between two looks reads `changed: false` (P21).
- **Detection latency for an install is the scan interval**, because the package
  broadcast never arrives (P19, refuted).
- **A force-stop of an already-dead app is invisible** to the exit record, so the absence
  of a stop is never evidence there was none (P20).
- **The scope can shrink honestly.** Build without `QUERY_ALL_PACKAGES` and the scan
  reads `visible`, re-baselines once, and reports no phantom uninstalls (§7b40).
