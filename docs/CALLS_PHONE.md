# Calls — when you last spoke with someone, on their page (stage 2b of the operator's flow; proposed)

> Status: **proposed 2026-10-03, revised the same day after the operator's question (§0): the next step is a small probe app, not the feature. The probe answered (`DEVICE_LOOP.md` §7b82) and the feature is **built 2026-10-03 as the opt-in calls build, v46** (`DEVICE_LOOP.md` §7b84, `orb-app-v46-calls.apk`; `DECISIONS.md` DR-36; limits `ARCHITECTURAL_DEBT.md` AD-31); awaiting the device.** ("Yes, go ahead with the design for calls first" asked for this write-up; building waits for the next "yes"). Nothing here is built.
> Builds on: People (`PEOPLE_PHONE.md`, DR-24/25), the Contacts read it copies the shape of (`orb.read.contacts`), Sources (`SOURCES_PHONE.md` §4 sketched this slice), the Safety check's grant pattern (DR-32). **This slice changes the manifest permission guard (three → four) and carries a Play Protect risk — both need your decision (§6).**

## 0. Revised 2026-10-03 — the operator's question, and what the research found

> *"If I chose one person at a time then also Play Protect issue comes — check for the best way to do it."*

**You are right, and my design under-weighted it.** Reading one person at a time changes what Orb *does*; it does not change what the **APK declares**. `READ_CALL_LOG` sits in the manifest, so Android and Play Protect weigh it at **install time**, for everyone who installs that build, whether or not they ever turn calls on. §6's first row said so; the design then still asked you to approve the build. This section replaces that ask.

**What I could establish (public sources, July–October 2024 onward; I could not open Android's own documentation page from here, so items 2–3 are from reports of it):**

1. **Play Protect's *documented* sideload block names four permissions — `RECEIVE_SMS`, `READ_SMS`, notification listener, accessibility** — and it is running in **India** (a pilot in nine countries). **`READ_CALL_LOG` is not on that list.** So calls are *less* likely to be blocked outright than SMS would be — but Play Protect also has unpublished heuristics, and the one block Orb has had so far (`QUERY_ALL_PACKAGES`, `DEVICE_LOOP.md` §7b38) was one of those, not the named four. It is a lower risk, not no risk.
2. **`READ_CALL_LOG` is *hard-restricted*.** For an app that is not from a store, the permission can be granted only if the thing that installed it **allowlisted** it (an installer does this through the install session); **the "Allow restricted settings" switch I wrote into §6 is for accessibility, notification access and device admin and, as reported, does *not* unlock hard-restricted permissions.** So that fallback may not exist. Whether Orb's own install route (the system installer, from Downloads) allowlists it on your phone cannot be known from here.
3. **There is no way to read the call history without the permission.** `LAST_TIME_CONTACTED` in Contacts is no longer maintained for current apps; a call-screening role sees only *new* calls and replaces your spam blocker; notification listening is on Play Protect's own list. Nothing else carries the history.

**The consequence for SMS (`SOURCES_PHONE.md` §5):** `READ_SMS` and `RECEIVE_SMS` are exactly the permissions Play Protect's sideload block names, in India. A sideloaded Orb that declares them would be **blocked at install**, not warned. **The SMS route through the permission is very probably closed for this distribution**, and slice 2c needs a different route (what you *share*, which already works) before it is designed further.

**What I now propose instead of building calls straight into Orb: measure first, with a tiny separate app.**

- **A probe, not a feature**: `Orb Calls Probe`, its own package, nothing of Orb in it. One screen, three buttons: *Ask for the permission*, *Count my calls* (shows only **how many calls are in the log and the date of the newest** — no number, no name), and a line that says how it was installed and what Android said. It exists to answer **two questions on your phone, in one afternoon**: **(a) does Android or Play Protect block or warn about installing an app that declares `READ_CALL_LOG`? (b) when installed the way you install, can the permission actually be granted — and does the "restricted setting" appear?** The same measure-before-building step the repository used for `QUERY_ALL_PACKAGES`.
- **Orb v45 is not touched.** Nothing about Orb changes until the probe has answered.
- **If the answer is *installs, and the permission can be granted***, there are two honest shapes for the feature, and I would choose between them with you then:
  - **An opt-in build of Orb** (the same code, built with a flag — exactly how `ORB_PACKAGE_SCAN=0` already works): the default Orb stays free of the permission; the call-aware Orb is a build you choose to install. Simplest; if Play Protect ever blocks it you keep the default build.
  - **A companion app** that holds the permission and answers Orb's question (*last call with these numbers?*) over a bound service guarded by a signature-level permission, so **Orb's own APK never declares it**. Cleaner isolation; two apps to install; more to build and to keep correct.
- **If the answer is *blocked*, or *installs but cannot be granted***, the calls slice stops there, with the reason recorded, and costs nothing but the probe.

**What stays from the rest of this document:** the screen (§2), what is read and kept (§3–4) and the tests (§7) are unchanged and apply to whichever shape is chosen. §5's *new permission in Orb's manifest* and §9's items 1–2 are **withdrawn**; the asks are now in §10.

## 1. Why, in plain words

On a person's page Orb already shows what you *kept* about them. What it does not show is the simplest thing you want to know before you message or chase someone: **when did we last speak?** Your phone knows — its call log has the number, the time and the length of every call. Orb can read that, for **one person at a time, when you open their page**, and say it in a line. It does not keep a single call.

## 2. What you would see

On a person's window, under their context, a new line:

- **Calls: last spoke Tue 29 Sep — 4 min, you called**
- **1 missed since then** (only when there is one)
- **Last 90 days: 7 calls, 21 min** · *or* **No calls with their numbers in the last year**

Words, not a list. Each is computed when the window opens from the call log and **let go when it closes**. Nothing is shown for a person with no number. **If you have not turned calls on**, the line is replaced by a one-line explanation and a button to turn it on. Nothing else in Orb changes.

**Turning it on** is a recorded decision of yours (**What the call history is used for → Allow**, on *What Orb may do*), followed by Android's own permission prompt. See §5 for what Android may say.

## 3. What it reads, and what it does not

- **Reads:** for calls in the **last 365 days** — the number, the time, the length, and whether it was incoming, outgoing or missed. **Never what was said** (Android keeps none).
- **In memory only.** Every call in that year is read by Android's provider and each is **compared with the numbers of the person whose window is open**; the ones that match are summarised; **all of it is let go when the window closes.** Nothing is copied, sealed, indexed or written.
- **Numbers are compared the way Orb already compares them** (`+91…` forms, `Mentions`' reader): the call log's own normalised number when it has one, otherwise the number as written. A number that cannot be normalised (a short code, a hidden number) can never match a person and is ignored.
- **At most 5,000 calls** are looked at per window (the newest). If there are more, the line says so — *based on the newest 5,000 calls*.
- **Only the system call log.** Calls made in WhatsApp, Telegram, Meet and similar apps are not in it, and Orb cannot see them.

## 4. What is recorded, and what is not

- The **grant** and its withdrawal are recorded, like every other (`PackageGrants` events for `orb.read.calls`).
- **One record each time a window reads the call log** — `orb.calls.read`: the capability, its version, **how many calls were examined and how many matched**. Counts only; never a number, a name, a time or a length.
- **Nothing about any call is kept anywhere** — not in the journal, not sealed, not in a backup. After a restore the permission is gone and the history is made to agree (`reconcile`, as for contacts).

## 5. What it changes in the architecture

- **A new declared capability `orb.read.calls` v1** — tier *Observe*, switchable, words pinned: *Reads your call history — the number, time, length and kind of each call in the last year — only while a person's page is open, only on the phone, to say when you last spoke. Nothing is kept; only how many calls were looked at is recorded.* New files: `CallsReader` (**the one file** that reads the call log), `CallsRules` (pure: number matching, the summary, the wording), `CallsAccess` (grant/revoke/reconcile), `CallsFacts` (the record). `PeopleActivity` gains the line and the grant button; the registry, the source guards and `What Orb may do` gain the entry.
- **A new Android permission, `READ_CALL_LOG`.** The manifest guard test (`AssistGuardTest`) says *the only permissions are three*; it becomes four, named. `READ_CALL_LOG` leaves the registry's list of reads Orb does not have (`UNDECLARED_READS`) and `CallLog` joins the declared reads. **This is the architecture change that needs your approval.**
- **No change** to the journal rules, to any existing record, or to the importer. The Safety check does not flag Orb itself.

## 6. Risks — two of them are real

| Risk | What it means | Handling |
| --- | --- | --- |
| **Play Protect.** Adding `READ_CALL_LOG` to the manifest changes the **whole app**, not just people who turn calls on. Android's scanner treats a call-log permission on a hand-installed app much as it treated `QUERY_ALL_PACKAGES` (which blocked an install earlier, `DEVICE_LOOP.md` §7b38). | v46 might be refused or warned about at install, even though nothing reads calls until you grant it. | **Rollback is v45, which is unchanged.** If v46 is blocked, I report what Android said, keep v45 as the build you use, and this slice waits for a different route (a separate app, or leaving it). You lose nothing but a build. |
| **Android restricts this permission for hand-installed apps.** `READ_CALL_LOG` is *hard-restricted*: on a phone where Orb was installed from a file (not a store), Android may grey out the permission with *Restricted setting*. | The prompt may not appear, or the permission cannot be granted until you allow it by hand. | The screen says so, plainly, and a button opens **Orb's own App info page**, where the steps are: **⋮ (top right) → Allow restricted settings**, then come back and turn calls on. If your phone offers no such switch, that is a finding and the slice stops. |
| **VoIP and app calls are invisible.** WhatsApp and similar calls are not in the system call log. | *Last spoke* will say *Tue* when you spoke on WhatsApp on Friday. | The line says **Calls (phone calls only)**. Nothing implies it is everything. |
| **A hidden or unsaved number.** | A contact's call from a number they do not have saved is not theirs. | Matching is by the person's saved numbers only. |
| **Two people sharing a number** (a family landline). | Both pages show the same calls. | Orb groups contacts that share a number into one person already (DR-24); the line is that person's. |
| **Time zones and clocks.** | A call at 23:50 may be *yesterday* elsewhere. | The device's own time zone, the same as every other date in Orb. |
| **Not testable off the phone:** the call log provider's columns on your phone, the restricted-settings step, multi-SIM. | | Everything else is; the first round is the real test. |

## 7. Tests, off the phone

`CallsRules` is pure and gets: number matching (normalised vs written forms, `+91`, spaces, a short code, missing), the summary from a fake list of calls (last answered call, direction, length, *missed since*, 90-day totals, the 365-day edge, the 5,000-call cut, no calls, a person with no numbers), the wording, time zones; the record carries counts only; source guards (only `CallsReader` touches the call log; read-only; no write API; the screen is secure; the grant is recorded before Android is asked; `reconcile` after a restore; the permission list is exactly the four named); the registry words are pinned. Mutation checks as before.

## 8. Not in this slice

- **Keeping a call** or a list of calls anywhere; a call history screen.
- **Calls in the commitment card, Today or the nudge** (*you last spoke 3 days ago* beside a chase). An easy next step once this line is trusted, and not before.
- **Other apps' calls**, SMS (its own design, after the scale and time design), the dialler, placing or answering calls.
- **A model reading anything** (DR-9).

## 9. For the operator to approve

1. **A new permission, `READ_CALL_LOG`**, and the manifest guard going from three permissions to four, named.
2. **The Play Protect risk with the rollback in §6** (v45 stays the safe build; v46 is tried).
3. **A person's page only**, computed when it opens and let go when it closes; **nothing about any call is kept**; one counts-only record per read.
4. **The last 365 days, the newest 5,000 calls, phone calls only**, said plainly on the line.
5. **Turning it on is a recorded decision of yours**, with Android's prompt after it and the restricted-settings help if Android asks for it.

## 10. For the operator to approve (replaces §9's items 1–2)

1. **Build the probe first** — a separate tiny app, `Orb Calls Probe`, that declares `READ_CALL_LOG` and reports only (a) whether it installs, (b) whether the permission can be granted, (c) how many calls are in the log and the date of the newest. **Orb v45 is not changed.**
2. **Decide the shape after the answer** — an opt-in build of Orb, or a companion app — or stop if it is blocked or cannot be granted.
3. **Everything else in this design stands** (§2–4, §7) for whichever shape follows.

## 11. The probe's answer (2026-10-03) and the proposed shape

**Measured on the operator's phone** (Pixel 10a, Android 16, installed from a downloaded file by Google Files — Orb's own route): the app **installed and ran**, the permission **was asked for with a prompt and granted** (1,472 ms, no restricted-setting refusal), and the call log **read: 1,510 calls, newest today** (`DEVICE_LOOP.md` §7b82). So the hard-restricted worry (§0 item 2) **does not bite on this install route**, and the feature is possible here.

**Not measured:** how Play Protect treats the *whole of Orb* with that permission added (the probe was a 13 KB app; Orb is larger and holds more), and any phone other than this one. 1,510 calls is well inside the 5,000 the design reads per page.

**The two shapes, now that the choice is real:**

| | **An opt-in build of Orb (recommended)** | **A companion app** |
| --- | --- | --- |
| What it is | The same code, built with `ORB_CALL_LOG=1` (exactly how `ORB_PACKAGE_SCAN=0` already works) adds the one permission to the manifest. The default build keeps three permissions. | A second app holds the permission and answers Orb over a bound service guarded by a signature-level permission. Orb's APK never declares it. |
| Cost | Small: a placeholder in the manifest, the guard test made to accept either build, `CallsReader` and the rest as in §3–7. | Large: a service, a protocol, versioning, two installs, and Orb must work when the companion is absent. |
| Benefit | Simple; the permission is in the build you choose to install; the default build is untouched; if Play Protect ever objects to the calls build, the default one remains. | Least privilege: a compromised Orb cannot read the call log; the sensitive permission lives in an app that holds none of Orb's data. |
| Weakness | The build you use daily holds the permission. | More to build and keep correct for one line of text. |

**Recommendation: the opt-in build now.** It is the simplest correct implementation that keeps the long-term architecture (the reader is one file behind one capability, so moving it into a companion later changes the reader, not the screens). The companion is the hardening to revisit if a second sensitive permission arrives.

**Still to approve (replaces §10):** (1) the opt-in build `ORB_CALL_LOG=1` (v46 is the calls build; the default build stays at three permissions); (2) the screen and reading of §2–4 unchanged; (3) the manifest guard accepts exactly three permissions in the default build and exactly four, named, in the calls build; (4) your word on what Android or Play Protect said at install.

## 12. The final shape, for approval (operator: "design for calls and the SMS as well", 2026-10-03)

Settled by the probes (`DEVICE_LOOP.md` §7b82–§7b83): **the call-history permission can be had on this phone** (silent install, a prompt, granted, 1,510 calls read); **the text-message permission cannot** (blocked, no override). So calls go ahead as the **opt-in build** of §11, and messages go by a different route (`MESSAGES_PHONE.md`). This section turns §11 into a buildable list.

- **The build flag.** `ORB_CALL_LOG=1` makes `build.sh` write `<uses-permission android:name="android.permission.READ_CALL_LOG" />` into the manifest at the placeholder `@CALL_LOG@` (exactly how `ORB_PACKAGE_SCAN` already places `QUERY_ALL_PACKAGES`); without it the placeholder becomes a comment and **the default build keeps its three permissions**. Calls builds are named `orb-app-vNN-calls.apk`; the default build is not produced unless asked.
- **The guard.** `AssistGuardTest` reads the manifest *template*: it holds that the template has the three fixed permissions plus the placeholder, that `build.sh` is the only place the call-log permission is ever spelled, and (a script check, like the probes') that a calls-built APK declares exactly four, named.
- **The code is in every build, switched on by the permission being there.** `CallsAccess.available(context)` asks the installed package whether it declared the permission. In a default build the capability's status reads ***NOT IN THIS BUILD*** and a person's page says one line (*Calls need the calls build of Orb*); in a calls build the grant flow of §2 and §4 applies. **No build behaves differently except through that one declared fact.**
- **Files:** `CallsReader` (the one reader of the call log), `CallsRules` (pure: number matching, the summary, the words), `CallsAccess` (available / grant / revoke / reconcile), `CallsFacts` (`orb.calls.read`: examined, matched), the capability `orb.read.calls` v1 (words pinned as in §5), `PeopleActivity` (the line and the button), `MayDoActivity`, `Orb` (reconcile at start). `READ_CALL_LOG` leaves `UNDECLARED_READS`; `CallLog` joins the declared reads, and the registry test is updated.
- **Version:** v46, the calls build. **Tests and mutation checks** as §7. **Not testable off the phone:** the provider's columns on this phone and the line's wording on a real call history.
- **Not changed from §2–4:** one person's page at a time, the last 365 days and newest 5,000 calls, phone calls only, nothing about any call kept, one counts-only record per read.

**Approve:** (1) the opt-in build and its flag, guard and *NOT IN THIS BUILD* behaviour as above; (2) everything in §2–4 as written.

## 13. As built (v46, the calls build)

- **Files.** `CallsRules` (pure: number normalisation, what a *spoken* and an *unanswered* call is, the summary, the words), `CallsReader` (**the one file** that reads the call log: five columns — the number, the log's normalised form, the kind, the time, the length — for the last year, newest first, at most 5,000), `CallsAccess` (available / granted / grant / revoke / reconcile), `CallsFacts` (`orb.calls.read`: examined, matched), the capability `orb.read.calls` v1 (words pinned), `PeopleActivity` (the line, the card, the grant), `MayDoActivity`, `Orb` (reconcile at start).
- **The build flag.** `build.sh` declares `READ_CALL_LOG` only when `ORB_CALL_LOG=1` (the manifest holds the placeholder `@CALL_LOG@`); the script says which it did. **Checked:** the default build declares three permissions, the calls build four.
- **On a person's page,** under *Last mentioned…* and above *Often with:* — in a default build, *Calls: not in this build of Orb.*; with no number saved, nothing; in the calls build, *Calls: off.* and **Show when we last spoke**, a card (what is read, *phone calls only — not WhatsApp*, nothing kept; **Cancel is the default**), then Android's own prompt, **then** the decision is recorded and the page reopens with the lines: *last spoke (today / yesterday / Tue 29 Sep) — 5 min, they called · N calls missed since then · Last 90 days: N calls, M min*. A *spoken* call is an incoming or outgoing one that lasted; a ring nobody answered is not *speaking*.
- **As approved, with one order change:** the design said *recorded, then Android is asked*; the build follows the **Contacts** pattern that was verified on the device — the card, then Android's prompt, then the recorded decision — and nothing is read until both exist. It is read-and-forget: a permission withdrawn in Android's Settings is noticed at the next start and brought into the history (`reconcile`).
- **Tests.** Number forms; the kinds; the summary across the edges (exactly 90 days, exactly a year, the future, 5,000); the words (seconds, minutes, hours; today, yesterday, this year, another year; the time zone deciding the day); the record; and source guards (one reader; read-only; five columns; nothing read without Android's permission; the permission spelled in one place; the grant before the flag; the card, Cancel first; the order of asking and recording; the build script and the manifest placeholder).

**Verified 2026-10-03** on the operator's phone (v47): "Calls working as intended." v46's first read failed on a `LIMIT` in the sort order (Android refuses SQL there); v47 sorts by date and caps while reading, and a failed read names its kind.
