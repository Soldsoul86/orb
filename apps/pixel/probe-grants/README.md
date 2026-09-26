# Orb grants probe — P12, P13, P14

A throwaway instrument with one job: find out whether the three reads that
`apps/pixel/pass2` is built on are possible **on this device, at this build,
from an app holding no permission at all.**

`docs/DEVICE_LOOP.md` §7 records those three as predictions:

| | Prediction |
| --- | --- |
| **P12** | `ENABLED_ACCESSIBILITY_SERVICES` is readable with no permission |
| **P13** | `ENABLED_NOTIFICATION_LISTENERS` is readable on the same terms |
| **P14** | Active device admins are enumerable without being one |

Pass 2's signal is worthless if any of them is false, and the whole of pass 2's
Android glue would be written against an assumption. This answers them first,
which is why it exists before that glue does.

## What it does

Five reads, once, on the main thread, with the result printed and offered as a
file:

| | Source |
| --- | --- |
| P12 | `Settings.Secure.getString("enabled_accessibility_services")` |
| P12 | `AccessibilityManager.getEnabledAccessibilityServiceList(ALL)` — a second, independent route |
| P13 | `Settings.Secure.getString("enabled_notification_listeners")` — the constant is `@hide`, so the key is spelled out |
| P14 | `DevicePolicyManager.getActiveAdmins()` |
| context | `Settings.Secure.getString("accessibility_enabled")` — the master toggle, not a prediction |
| control | `FileInputStream("/data/system/users/0/settings_secure.xml")` — **must fail** |

Nothing else. No services, no receivers, no journal, no network, and **no
`<uses-permission>` line anywhere in the manifest** — not as an economy, but
because every prediction above is of the form *"readable with no permission"*,
and one permission would answer a different question. `aapt2 dump badging`
prints no permission rows for this APK; that absence is the experiment's control.

## The scoring rule, fixed before the result

Three outcomes per read, and they are never merged (`src/Readout.java.in`):

* **threw** — the read failed; we learned nothing about the contents.
* **absent** — the read returned `null`. Either never set, or withheld from us.
  The call cannot tell us which.
* **value** — the read returned a string, possibly empty.

And the part that matters: **an empty answer does not confirm a prediction.** An
empty list handed to a permissionless app is byte-identical to a full list being
filtered out of it, so a read that returns nothing proves only that the call did
not throw. It scores INCONCLUSIVE, not CONFIRMED.

Which means the operator has to supply the one thing the device cannot: whether
an entry is known to exist. Three checkboxes, unchecked by default, ticked only
against what the Settings screens actually show. With a known entry, an empty or
`null` answer is a **falsification** — we know what the right answer was and
this is not it. Nothing is hardcoded: a baked-in "an accessibility service is
enabled here" would go stale the moment it was switched off, and would then
turn a correct empty answer into a false alarm.

| read | operator claims an entry exists | verdict |
| --- | --- | --- |
| threw | either | FALSIFIED |
| absent | no | INCONCLUSIVE — unset and withheld look the same |
| absent | yes | FALSIFIED — withheld, not empty |
| value, empty | no | INCONCLUSIVE — the call works; contents unproven |
| value, empty | yes | FALSIFIED |
| value, entries | either | CONFIRMED |

Written down here because a scoring rule chosen after seeing the answer is not a
test. §7 R3 still applies to whatever comes back: a finding is recorded against
*this* device and *this* build, never generalised — which is why the build
fingerprint is printed above the results and travels in the exported file.

## What each answer would mean for pass 2

* **All three CONFIRMED.** `Grants` stands as written; the glue can be built.
* **P12 falsified through the setting but confirmed through
  `AccessibilityManager`.** The signal survives; `Grants` reads the framework API
  instead of the setting, and the setting is dropped rather than kept as a
  fallback that works on one device and not the next.
* **P12 falsified both ways.** Pass 2's first signal, as designed, is impossible.
  The nearest honest substitute is *installed* accessibility services
  (`PackageManager` query on `BIND_ACCESSIBILITY_SERVICE`), which is a different
  and weaker fact — installed is not enabled — and would have to be named as
  such rather than quietly substituted.
* **P13 or P14 falsified.** That kind drops out of `Grants.KINDS`. It does not
  become `"unreadable"` forever: a kind that can never be read is not an
  observation with a missing value, it is a signal we do not have.
* **INCONCLUSIVE on P14 with no admin on the device.** Expected, and not a
  failure of the probe. Most Pixels have Find My Device active as an admin; if
  this one does not, P14 cannot be settled here without enabling one.

## Building and running

```sh
export ANDROID_HOME=~/android-sdk
cd apps/pixel/probe-grants
./tests/run.sh      # 33 desktop checks, no SDK needed
./build.sh          # -> build/probeg/probeg.apk
```

Install it alongside pass 1. **It cannot disturb pass 1:** its own package id
(`dev.orb.probeg`), its own signing key, no shared storage, and it starts
nothing. That matters because pass 1 is mid-run (§7 R4) and an APK signed with a
different key cannot upgrade one signed with another — Android refuses the
install outright — so a shared package id would have offered an install that
silently required an uninstall, and an uninstall takes the run's journal with it.

Open it, tick only what you can see in Settings for yourself, then
**Export and share readout**. Delete the app afterwards; it holds nothing.

## Why the logic is tested at all, for something throwaway

33 desktop checks in `tests/`, three negative controls verified to bite. Not
because the probe is precious, but because its output is going to be written into
a document as a finding. The failure mode worth paying to avoid is the probe
reporting a **false yes** — scoring "readable and empty" as CONFIRMED — because
that error is invisible in the output and would be believed. The one rule the
suite pins hardest is the one-line version of the table above: *nothing is
confirmed except by entries actually handed over*, checked over all eleven shapes
a reading can take, both operator claims, in a single assertion.

`Grants` comes from pass 2 and `Json` from pass 1, taken at build time and never
copied — in the build and in the tests alike. The point of running on the device
is to watch the parser that would actually ship meet the string the device
actually returns (§7 R2). A private copy here could agree with the device while
the real one disagreed, which is the one way a probe can lie about the code it
was built to vouch for.
