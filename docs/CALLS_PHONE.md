# Calls — when you last spoke with someone, on their page (stage 2b of the operator's flow; proposed)

> Status: **proposed 2026-10-03, awaiting the operator's go-ahead** ("Yes, go ahead with the design for calls first" asked for this write-up; building waits for the next "yes"). Nothing here is built.
> Builds on: People (`PEOPLE_PHONE.md`, DR-24/25), the Contacts read it copies the shape of (`orb.read.contacts`), Sources (`SOURCES_PHONE.md` §4 sketched this slice), the Safety check's grant pattern (DR-32). **This slice changes the manifest permission guard (three → four) and carries a Play Protect risk — both need your decision (§6).**

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
