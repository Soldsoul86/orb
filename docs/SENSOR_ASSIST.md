# Sensor Declaration — Assist (the screen, when you ask)

> Status: **declaration, 2026-10-01; built the same day** (step 7: part 1 decides, part 2 keeps
> — `DEVICE_LOOP.md` §7b50–§7b51). Written
> after the probe round (`DEVICE_LOOP.md` §7b41–§7b45), so every claim about what the
> platform delivers is a measurement, not a reading of documentation. The rules below
> are the operator's rulings (`DECISIONS.md` DR-14) turned into mechanism; the points
> that are still the operator's to confirm are in §10.
>
> Contracts it stands on, **all Accepted**: `Sensor`, `Observation`, `Attachment`,
> `Event`, `Capability`. Same convention as `SENSOR_SHARE.md` and `SENSOR_GRANTS.md`:
> the sensor emits Observations and Attachments; what Orb does about its own
> permissions stays Events.

You invoke the phone's assistant gesture on a screen and tap **Remember**. Orb keeps
the **text** of that screen, and where it came from, sealed on the phone. **Nothing is
read until you invoke it, nothing is kept until you tap, and nothing is taken from an
app you have not allowed.**

---

## 1. What it perceives, and why

A person's day happens inside other apps — a message, a ticket, a page, a document.
Share (`SENSOR_SHARE.md`) captures what one hands over deliberately; this captures
what is *on the screen right now* without the person having to select it first.

What the platform hands an assistant was **measured** on the operator's phone
(Pixel 10a, Android 16) with no permission requested:

| | Measured |
| --- | --- |
| Selectable as the assistant, bound, reached by the gesture | yes (P23, P24) |
| Structure of the screen (the text of its elements) | arrives for ordinary apps; 5–270 ms (P25, P28) |
| A screenshot | arrives; used here **only to check, never stored** (§5) |
| An app that opts out | withheld by the **app**, not the platform: structure comes back as one blocked node and the screenshot as one black colour (incognito, a chess app) |
| An app that does **not** opt out | delivered intact — including two financial apps (§7b42) |
| A game that draws its own surface | structure present, **no text** (7 nodes, none with text); the screenshot is real |
| The system's own switches | **text off ⇒ no structure and no screenshot**; the screenshot switch cannot be on while text is off; `flags` never follow the switches |
| A phone assistant **without** a recognition service | **not offered** by the chooser (P30 — the stub-less build never appeared), so this build keeps the do-nothing stub |

## 2. Registration (`Sensor.md` §2.1)

| Field | Value |
| --- | --- |
| `id` | `orb.sensor.assist` |
| Source identity | `orb.sensor.assist@<install>` — the convention of `SENSOR_GRANTS.md` §4 |
| Signal class | one deliberate capture of the text of the screen in an allowed app |
| Schedule | **trigger only.** The runtime does not poll; the platform delivers when the person invokes the assistant, and the person taps. `Sensor.md` §2.2 is satisfied as it is for share, because the trigger is a person — twice (invoke, then tap) |
| Emits | one `Observation` per **Remember**, `because: user.remembered`, with the text as an `Attachment` |

**What stays an Event, not an Observation** (as in `SENSOR_GRANTS.md` §4 — about Orb
itself, not the world): `orb.assist.declined` (§6), and the allow-list's own history
`orb.assist.allowed` / `orb.assist.disallowed` (§4).

## 3. Authority — what permits each read

There is **no Android permission** and none is requested (the manifest has none, and a
test fails the build if one appears). Authority is layered, and each layer is a person's
act:

1. **Choosing Orb as the assistant** — a system setting the person changes, not Orb.
2. **Allowing an app** — an `orb.assist.allowed` event naming that app (§4).
3. **Invoking** the gesture on a screen in that app.
4. **Tapping Remember.**

Declared as a Capability: **`assist.screen.read`**, tier **`Observe`** (a local read of
what is already on the person's own screen), granted **per app** by layer 2 and
exercised **per invocation** by layers 3–4. The grant, its revocation and a refusal are
all events, in the shape `grants.capability.*` already uses. It never reaches anything
else: a captured web address is **not authorization to visit it** (same reasoning as
`SENSOR_SHARE.md` §3, DR-9).

## 4. The allow-list

**Allow-list only** (DR-14 ruling 4). An app is captured only if the person has allowed
it; an app on no list — a new bank app, anything unknown — is never captured.

- **The list is not stored as a list.** It is the **projection** of `orb.assist.allowed`
  and `orb.assist.disallowed` events, latest wins per app. A stored copy would be a
  second source of truth (Art. IX §33).
- **It starts empty.** A fresh install captures nothing.
- **How an app is added** *(implemented as below on 2026-10-01; differs from the first
  draft, and the operator has not yet confirmed the difference)*: **from the assistant card,
  on the app itself.** When Orb declines an app that is not allowed, the card offers
  *Allow Orb to remember from this app*; tapping it writes the event. An Orb screen
  (*Apps Orb may remember from*) shows the list and removes an app. **Why not a list of every
  app with a switch each:** showing one needs launcher-wide package visibility
  (`<queries>`), and Orb's package scan reads whatever it can see — so the visible set would
  jump by roughly a hundred apps and the install alert would report a hundred "new apps" that
  were not new. It can be done (with a deliberate re-baseline of the scan's scope), at the cost
  of that boundary; it is a decision, not a default. A consequence of the chosen route: the
  list shows **package names**, because Orb cannot look up app labels without the same
  visibility.
- **A refused capture does not log which app it was.** When an app is not allowed, the
  decline records the *reason* and **never the package** (§6) — a record of "Orb declined
  an app" naming a payments app would itself be the leak the ruling forbids.
- **A floor under the list (proposed, §10).** DR-14 ruling 1 says no payments app is
  ever captured; a person could still tick one by mistake. A short, versioned list of
  well-known payments packages that **cannot be allowed** would make the ruling
  enforceable rather than hoped for. It is a list, so it is imperfect and says so.

## 5. The decision, in order

On every invocation, Orb decides before it keeps anything. **Arrival is the only signal**
(§7b45): the flags and the system's switches say what was *permitted*, only what arrived
says what was *delivered*.

| # | Check | If it fails — `orb.assist.declined` with `reason` |
| --- | --- | --- |
| 1 | Did the **structure** arrive? | `noStructure` — includes the person having switched text off |
| 2 | Is the app **allowed**? (the package is read first; if not, **nothing else is read**) | `notAllowed` |
| 3 | Did the **screenshot** arrive? | `noScreenshot` — *cannot check*, never *fine* |
| 4 | Is the screen **protected**? structure blocked (`blockedNodes > 0`) **or** the screenshot uniform | `protectedScreen` |
| 5 | Is there **any text**? | `noText` — a game, a canvas: nothing to keep, and the person is told |

- **A capture needs both to have arrived.** The screenshot is never stored. It is the only
  way to tell a screen that protected itself *without* marking its structure blocked
  from an ordinary one. If the person turns the screenshot off, nothing is kept from
  that invocation and the card says why.
- **A callback belongs to an invocation by the id it carries**, never by "the latest
  one": a null screenshot callback was seen arriving after its session closed (twice;
  §7b44–§7b45). The decision waits for both callbacks or a timeout; a timeout is
  `noScreenshot`. The measured latencies are ≤ 270 ms; the timeout is proposed at 3 s (§10).
- **An app that opts out is never overridden**, whatever list it is on.

## 6. What the phone writes

**Nothing is written before the tap.** From invocation until the tap, the screen's text
lives in memory in the session and nowhere else; dismissing, timing out or the session
ending discards it. It is never logged, never backed up (`AD-11`: backup and device
transfer are off), never put in a notification.

**`orb.assist.captured`** — a device event on **Remember**, translated to an Observation
on import (`SENSOR_SHARE.md` §4a's route; `packages/device-watch/src/assist.ts`):

| In the clear (the journal cannot forget) | Value |
| --- | --- |
| `because` | `user.remembered` |
| `package` | the allowed app it came from |
| `textNodes`, `textChars` | how much, as numbers |
| `webUri` | **boolean** — whether the app supplied a page address |
| `attachment` / `attachmentBytes` | `sha256:…` and size of the sealed text |
| `resolveOutcome` | `stored` (new content) or `held` (the same screen was already kept) |
| `versionCode` | the build that wrote it |

| Sealed inside the Attachment (destroyable) | |
| --- | --- |
| The text of the screen's elements, in order | **node text only**, trimmed, blank elements dropped |
| The page address, if the app supplied one | the address itself is content, so it is sealed, not written in the clear |

The sealed document is a versioned header (`orb.screen.text.v1`), the address line, `---`, then
the text — **no time, no app, no counts beside it**, so identical screens are one Attachment
under one key and nothing about *when* or *where* sits next to the words.

**Excluded in v1:** accessibility descriptions, hints, view ids, and any node the build can
tell is a password field — dropped even if the platform delivered it, not assumed
blanked already. The picture is never kept.

**`orb.assist.declined`** — `reason` from §5, the build's `versionCode`, and **no
package**. **`orb.assist.captureFailed`** — when the person asked to keep and Orb could not
(`erased`, `tooLarge`, `sealFailed`, `journalFailed`): an outcome and a build, no app. **`orb.assist.allowed` / `disallowed`** — the package and `by: operator`.

The Observation carries `source` `orb.sensor.assist@<install>`, `confidencePercent: 100`
**for the occurrence** (that you captured this) and none for the content (§7), and
`attachments: ["sha256:…"]` — by identity, never inlined (`Observation.md` inv. 5).

## 7. Confidence: certain about the capture, silent about the screen

Orb is certain *a capture happened*. It claims nothing about whether the text is the
**whole** screen: a long list may deliver only what is drawn, and a game delivers
nothing. `textNodes` and `textChars` state how much arrived; they are not a claim that it
was everything. Interpreting the text — who is named, what is promised — is the Knowledge
layer's, above this (`Art. XI §42`).

## 8. Retention, and what erasing does

**Kept until the person deletes it** (ruled 2026-10-01; no expiry). Deleting one capture
**destroys its key** (`ERASURE.md` §2a), so the text becomes unreadable everywhere a copy
exists. **The Event remains** — the journal is append-only (Art. I) — and it still says a
capture of *N* characters happened in *package* at that time. Erasure removes the **content**,
not the **fact** that something was kept; this is the same trade `SENSOR_SHARE.md` §9
accepted. **The phone can now destroy an attachment key** (step 6, `DEVICE_LOOP.md` §7b46; on the
device once v10 is run), so the gate that kept *Remember* from storing anything is
down to one thing: the build that stores a screen must also keep that screen's text
out of any clear payload — the property AD-12 names.

**A consequence worth stating:** because a destroyed identity is never re-minted, a person
who erases a capture and later captures the *identical* text will be told Orb will not
keep it again (`resolveOutcome: erased`). That is `Attachment.md` inv. 8 applied.

## 9. What this sensor must never do

1. **Read before the gesture.** No background read, no accessibility service (`DR-2`,
   rejected), no polling.
2. **Keep before the tap.** Reading to *show* is not keeping.
3. **Keep a screenshot, a description, a hint, a view id, or a password field.**
4. **Capture an app that is not allowed**, record its name, or capture one that opted out.
5. **Interpret.** No entity extraction, no commitment detection, no summary.
6. **Fetch.** A captured address is never visited without the declared egress Capability.
7. **Capture the lock screen.** Keyguard launch is declared off (`supportsLaunchVoiceAssist
   FromKeyguard="false"`).
8. **Treat a late callback as the current screen's.**
9. **Render *cannot check* as *fine*.** A missing screenshot is `noScreenshot`, never a pass.

## 10. Open points — the operator's to confirm

1. **The payments floor** (§4): a fixed list of payments packages that cannot be allowed.
   Recommended, because ruling 1 is otherwise enforced only by the person remembering it.
2. **Descriptions excluded** (§6): they are mostly icon labels and make captures noisy;
   revisit if captures prove too thin.
3. **The 3 s timeout** (§5): measured latencies are ≤ 270 ms; 3 s is generous.

## 11. Honest limits, stated once

- **Measured on one phone** — a Pixel 10a on Android 16. Other makers' builds may
  deliver differently or not offer a sideloaded assistant at all.
- **The apps decide what is protected** (P26), so the allow-list is the real control, and
  the payments floor is a list.
- **A person can allow an app and then invoke on a sensitive screen inside it.** The
  platform's opt-outs and §5 check 4 catch screens that protected themselves; a sensitive
  screen that did not is the person's to avoid.
- **Other people are in what you capture** (`SENSOR_SHARE.md` §9): a message carries
  its sender's words. The act is the person's, deliberate and per item.
- **The recognition stub stays** — required by the platform's chooser — and recognises
  nothing. It is not a microphone user; the build requests no permission.

## 12. What it needs, and what it would block on

Needs nothing not already Accepted. **Step 6 is built** (erasing one capture on the phone, §8); what remains before Remember
stores a screen is the overlay itself (step 7). The general Capability → Policy → permission mechanism (Phase 3c,
AD-7) is not required to *ship* this, which uses the same recorded-grant shape as the
grants watch; it is what would eventually replace the hand-rolled grant.
