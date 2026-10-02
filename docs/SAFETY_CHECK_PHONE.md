# The Safety check — what is on this phone that can see too much (stage 1 of the operator's flow; proposed)

> Status: **built 2026-10-02 (DR-32, AD-27) — verified on the device (`DEVICE_LOOP.md` §7b77, `orb-app-v41-safety.apk`).** The operator approved the design ("Yes, go ahead with stage 1", then "Yes, go ahead with the design"). Stage 1 of the flow the operator wrote (*"when I install Orb, it should first scan the mobile for apps with dangerous permissions and malicious intent, then certify it or guide me to delete the apps or revoke the permissions"*). **No `QUERY_ALL_PACKAGES`**; the blind spot is on the screen.
> Builds on the grants watch (`SENSOR_GRANTS.md`: accessibility, notification-listener and device-admin powers), the package scan (`PackageAccess`, DR-22) and the capability registry (`Capabilities`). **It does not take `QUERY_ALL_PACKAGES`** — see §4 and `DEVICE_LOOP.md` §7b38.

## 1. Why, in plain words

Your own words: Orb should start by asking *is this phone safe to put my life on?* Orb is about to hold your commitments, people and messages' worth of context; if another app on the phone can read the screen, your notifications or your messages, none of that is private. So the first thing Orb does is **look at what else is on the phone and tell you, plainly, what can see too much and what to do about it.**

## 2. What you would do and see

1. **First time Orb opens after an install,** a screen opens once: *Check this phone* — what Orb will look at (apps and what they may do, plus a few phone settings), that it stays on the phone, and two buttons: **Check my phone** and **Not now**. *Not now* is remembered; the check stays one tap away on the main screen (**Safety check**). **Nothing is read before you tap.**
2. **Check my phone** records your decision (the same recorded grant the contacts read uses), runs the check in seconds, and shows:
   - **Look at these now** — the few that need it, each in one plain sentence: *"Acme Keyboard can read everything you type, and was installed from outside the Play Store."* with the reason it matters and **Open its settings** (to revoke a permission or uninstall — you do it, Orb does not).
   - **Worth a look** — the rest, shorter.
   - **The phone itself** — screen lock, USB debugging, how old the security update is.
   - **What this cannot tell you** — always at the bottom (§5).
3. A dated line you can keep: *"Checked 2 Oct 2026 · 2 to look at now · 5 worth a look."* Not *safe*, not *certified* (§5).
4. **Run again any time** (the main-screen button). Orb's existing **grants watch** keeps alerting you if an app gains a powerful ability later.

## 3. What it looks at, and the rules (deterministic; no model)

**For each app Orb can see that is not part of Android itself** — its name, **where it was installed from** (Play Store or not), the **permissions it holds**, and the **powerful services it has switched on**:

| Level | What Orb says | The rule |
| --- | --- | --- |
| **Now** | *Reads your screen and can tap for you* | an **accessibility service** is switched on for it |
| **Now** | *Reads all your notifications, including one-time codes* | a **notification listener** is switched on for it |
| **Now** | *Can lock or wipe the phone* | a **device administrator** |
| **Now** | *Can draw over other apps **and** read the screen* | overlay permission requested **and** an accessibility service on |
| **Now** | *Reads your messages and your notifications* | SMS read granted **and** a notification listener on |
| **Now** | *Powerful, and installed from outside the Play Store* | any **Now** ability **and** not installed by the Play Store |
| **Worth a look** | *Reads your text messages* / *Reads your call history* | SMS or call-log permission **granted** |
| **Worth a look** | *Can see where you are when it is closed* | background location **granted** |
| **Worth a look** | *Can see every file on the phone* | all-files access **granted** |
| **Worth a look** | *Can draw over other apps* | overlay permission requested |
| **Worth a look** | *Can install other apps, and came from outside the Play Store* | install-apps permission requested **and** sideloaded |
| **Worth a look** | *A keyboard that is not Android's own* | a third-party keyboard enabled (it sees what you type) |

**Phone itself:** **no screen lock** (*Now*); **USB debugging on** (*Worth a look*); **security update older than six months** (*Worth a look*). **Orb's own entries** are never flagged. Each rule has a plain reason and a *what to do*; the table is the whole of the logic and is held by tests.

## 4. How Orb can see the apps — and the one thing it will not do

Orb will **not** take `QUERY_ALL_PACKAGES` (the permission to list every app). **On your phone, Play Protect blocked Orb the first time it carried that permission** (`DEVICE_LOOP.md` §7b38) — an app that asks for it is one Android itself treats as a surveillance risk, and Orb's job here is the opposite. Instead it uses what Android allows an ordinary app to see through **declared intent queries**, which the build already uses: the apps with a **launcher icon** (about 150 on your phone), and the apps that provide the powerful services above — **accessibility**, **notification listener**, **device admin**, **keyboards**. A few more `<queries>` entries are added for the services not already there (accessibility, notification listener, keyboard); they name *kinds of service*, never a particular app.

**The honest blind spot:** an app with **no launcher icon and none of those services** is invisible to this check. That is a real limit — hidden apps are what stalkerware often is — which is why the powerful services (the ones such an app needs) are queried directly, and why §5 says so. **Whether the added queries trip Play Protect is something only the device can tell**; it is the first thing the next install will show.

## 5. What it will not say

- It will **not say *safe* or *certified*.** Orb has no malware database and no online reputation service; it cannot tell *malicious intent* from a legitimate app that holds a powerful permission. A clean result is worded *"nothing here matches these rules"* — and **always followed by what the check cannot see** (hidden apps, what an app does with what it holds, anything that changed after the check).
- It will **not uninstall or revoke anything itself.** It opens the app's own settings page; you decide.
- It will **not rank the world's apps**: a messaging app that reads your SMS is flagged as *worth a look* because it holds that power, not because it is bad.

## 6. What is recorded, and what is not

- **Your decision:** the existing recorded grant (`grants.capability.granted` / `revoked`) for the new capability, and `orb.safety.deferred` if you tap *Not now*.
- **Each check:** one `orb.safety.checked` event — **counts only**: how many apps were looked at, how many *Now*, how many *Worth a look*, the capability's version. **No app name, no permission list, nothing about any app** is written anywhere; the findings are computed and shown, never stored.
- The screen is **secure** (no screenshots): what is installed on your phone is a description of your life.

## 7. What it changes in the architecture

- **A new declared capability, `orb.read.appsecurity` v1, tier *Observe*, switchable**, in the registry, its words pinned: *Reads, for the apps Orb can see on your phone — those with a launcher icon and those with powerful services such as accessibility, notification access, a keyboard or device admin — their name, where they were installed from and which permissions they hold; and a few settings of the phone itself (screen lock, USB debugging, security-update date). Only when you run the Safety check, only on the phone. Only counts are kept; nothing leaves the phone.*
- New: `AppSecurityReader` (the one file that reads another app's permissions and install source), `SafetyRules` (pure: the table in §3 as code), `SafetyFacts` (the only builder of the two records), `SafetyActivity` (the screen); a *Safety check* button on the main screen and the first-run open; `<queries>` entries for the three service kinds. A source guard holds that **only `AppSecurityReader` reads another app's permissions, nothing in it names an app, and the records carry counts**.
- **No new Android permission.**

## 8. For the operator to approve

1. **The first-run flow:** the check **opens once** after install, offering **Check my phone** or **Not now**; it is always one tap away on the main screen; **nothing is read before your tap**.
2. **A new declared capability `orb.read.appsecurity` v1** (Observe, switchable), and **no `QUERY_ALL_PACKAGES`** — apps are seen by launcher icon and by their powerful services, **with the blind spot in §4 stated on the screen**.
3. **The rules in §3** — three levels, combinations, the phone's own settings — **and that it never says *safe* or *certified***; it says what matched, and what it cannot see.
4. **Guidance only:** it opens an app's own settings page; **Orb never uninstalls or revokes anything itself**.
5. **The record is counts only** — no app names — and the screen is secure.

## 9. Not in this slice

A malware or reputation database (it would need the network); scanning APK files or the contents of apps; Wi-Fi, Bluetooth, NFC and keys (the next stages of the flow); remembering which findings you accepted (*"I know this app"*); background re-checks (the grants watch already covers the biggest change); a score.

## 10. As built

- **Files.** `SafetyRules` (pure: the table of §3 as code; imports no Android class), `SafetyFacts` (the two records, counts only; `firstRun`), `SafetyAccess` (the recorded grant, marker file), `AppSecurityReader` (**the one reader** of other apps' permissions and install source, plus the phone's settings), `SafetyActivity` (secure screen: offer, findings, *Open its settings*, *Check again*), a *Safety check* button on the main screen, and the capability `orb.read.appsecurity` v1 on **What Orb may do** (revoke / allow).
- **Apps are seen through `<queries>`** for three service kinds (accessibility, notification listener, input method) plus the existing launcher/handler entries — no new Android permission.
- **First run.** The screen opens by itself once, when the journal holds **no** `orb.safety.*` record. *Check my phone* records the grant, **then** reads; *Not now* records `orb.safety.deferred`. Nothing is read before the tap.
- **Each run** records one `orb.safety.checked` (apps looked at, *Now*, *Worth a look*) — never a name, package, label or permission.
- **Rules as built.** Combinations replace their parts (accessibility + overlay; SMS + notification access); SMS, call log and background location count only when **granted**, all-files and overlay when **requested**; installer power counts only when sideloaded; the phone: no screen lock (*Now*), USB debugging and a security update older than **183 days** (*Worth a look*). Android's own apps and Orb are skipped. Sorted *Now* first, then by name.
- **Tests.** Every rule and boundary (182/183/184 days), the sideload list, the skip rules, the sort, the summary words (never *safe*/*certified*), the records, first-run, and source guards: one reader, no write APIs, pure rules, secure window, one `startActivity`, grant before read, two journal appends, manifest queries. Mutation checks are recorded in `DEVICE_LOOP.md` §7b77.

**Verified 2026-10-02.** The operator found nothing wrong; asked for *grouping by severity* later (299 apps, 42 in *Worth a look* — too coarse). Not built.
