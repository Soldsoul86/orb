# Keeping erased words again — design (proposed)

> Status: **proposed 2026-10-01, awaiting the operator's go-ahead to build.** Nothing here is built.
> Decision record: `DECISIONS.md` DR-17. Bears on `contracts/Attachment.md` inv. 8, `ERASURE.md` §2c,
> `DEVICE_LOOP.md` §7b60 (which made shared text erasable), `BACKUP` behaviour in `DURABILITY.md`.

## 1. The problem, in one paragraph

Erasing destroys an item's key and leaves a *destroyed* marker. From then on the store refuses the **same exact bytes**
(`Attachments.store` → `erased`; `mintKey` refuses a second time). The rule exists so an erasure is never undone *by
accident* — a restore, an automation or a repeat share quietly bringing it back. But it is also applied when the person
**deliberately** hands Orb the same words again, and then it is only an obstacle: *"I erased it by mistake"*, *"I want it
back"*. The operator asked for exactly this to be possible (2026-10-01: "go with your recommendation, option 2").

## 2. The rule, restated

> **An erasure is never undone by arrival. It may be undone by the person, once, knowingly, for that item.**

Accident stays refused. The only new path is one the person walks through with a confirmation that names what they are
doing, and that path **leaves a record that cites the erasure it reverses**.

## 3. A correction to what I told the operator

I said a re-kept item would be destroyed again at the next restore unless the replay learned "the re-keep came later", and
that this needed a new event type and order-aware replay. **That was too strong.** Re-reading `Erasure.owedDestruction`:
it is *identity-based* — "declared erased, and **no live event cites the identity**". A re-kept item is a **new event** (new
envelope hash) citing the same identity, so it is live, and replay already leaves it alone. The existing projection gives
the right answer; what is genuinely new is only (a) the confirmation, (b) the lineage, (c) lifting the destroyed marker.
So no new event type and no change to replay — which makes this smaller than I said.

## 4. The design

**Where the person says yes.** Two places already hold the words in memory *and* a person at the screen:

| Entry | Today | New |
| --- | --- | --- |
| Shared text (`ShareActivity`) | store → `erased` → recorded as refused, toast | store → `erased` → **dialog**: *"You erased this on <date>. Keep it again?"* **Keep again / Not now**. Not now = exactly today's record. |
| Remembered screen (`AssistSession` preview) | *"…Orb will not keep it again."* | the same question on the preview card, beside **Remember** |

Shared **pictures and files are not in this step**: the platform's read grant on the sender's URI is short-lived and the
dialog would have to re-read it; that deserves its own look. (They keep today's refusal.)

**What "Keep again" does** (`Attachments.storeAfterErasure`, reachable **only** with a `Rekeep` value built by the dialog's
button handler — nothing automatic can construct one):

1. Find the erasure(s) this reverses: the declarations whose target event cites this identity (read from history).
2. Remove the identity's destroyed marker, then store the bytes under a **fresh key** (the old key never returns).
3. Append **one** event for the share/capture, outcome `stored` as for any keep, plus `rekept: true` and **`causes` =
   those erasure declarations** — "show your working" (lineage in `causes`, not prose).

One event per share, as now; the refused attempt is not also written when the person says yes.

**Crash windows** (each fails toward *erased*, using the reconcile that already exists):
- marker removed, nothing stored → identity is declared-and-not-live → `Erase.reconcile` puts the marker back.
- stored but the event not written → same: declared, not live → destroyed again at the next start.
- event written → live; erasing it later works as for any item (new declaration, new marker).

**Replay and backups.** A backup made after a re-keep holds the new key; before it, no key (erased). A restore replaces the
journal with the backup's own, so history and keys always agree. An *older* backup file still holds the **old** key for
the earlier erasure — the limit `ERASURE.md` §2a already names — and re-keeping does not change that.

## 5. What changes in the contract

`Attachment.md` inv. 8 and `ERASURE.md` say, in effect, *the same bytes arriving again do not make it readable.* That stays
true of **arrival**. The proposed addition (not applied until approved): *"…unless the owner, shown that they erased this
before, confirms keeping it again; the new keep is a new event whose `causes` cite the erasure it reverses, and takes a
fresh key."* The TypeScript keyring (`attachment-keyring.ts`) keeps refusing — the desk has no person to ask. Desk parity is
open and stated, not hidden.

## 6. Risks

| Risk | Handling |
| --- | --- |
| A shared dialog is tapped through by habit | Default focus is **Not now**; the text names the date of the erasure; it is the only prompt of its kind, never repeated for the same attempt |
| The prompt tells whoever holds the unlocked phone that these words were erased before | Same exposure as Recall, which already shows the content; stated, not hidden |
| An automation / second app triggers the path | `Rekeep` is built only in the dialog's click handler; a source guard asserts no other caller; tests assert the plain `store` still refuses |
| Re-keep un-erases other events' clear data | It cannot: only the sealed bytes return, as a **new** item; the old erased events stay erased and cite nothing |
| `causes` citing an erasure declaration confuses the graph | tested: the graph stays closed, provenance reads "kept again after you erased it", no content appears |
| Erasing a re-kept item | tested: new declaration, new marker, old events unaffected |

## 7. What it will be tested on (off the phone first)

Round trip (erase → refused → keep again → opens byte for byte → fresh key ≠ old); plain `store` still refuses; a crash at
each window leaves it erased after `reconcile`; erase after re-keep; restore of a backup made after re-keep opens it;
the event cites the declaration in `causes` and names no word; the guard on `Rekeep`; mutation checks on each of those.
The Observation and Kotlin/TypeScript translations carry `rekept`; fixture and vectors regenerate.

## 8. Not in this step

Pictures and files; the desk keyring; any "forget that I erased this" (a person who wants even the *fact* gone is asking
for something else, and the declaration is history).

## 9. For the operator to approve

1. **Scope:** shared text and remembered screens now; pictures/files later.
2. **The wording and default:** *"You erased this on <date>. Keep it again?"* — default **Not now**.
3. **The contract note** in §5 (inv. 8 gains the "unless the owner confirms" clause).
