# Durability — Track E: losing the phone must not lose the memory

> Status: **design proposed 2026-10-01; awaiting the operator's decisions** (§6). Nothing is built.
> Bears on `ROADMAP.md` Track E, `ARCHITECTURAL_DEBT.md` AD-11 and AD-12, `ERASURE.md` §2a ("a backed-up key is an
> un-erased payload"), `Synchronization.md`, `Encryption.md`. A laptop can never be required.

## 1. The finding that makes this urgent

`ROADMAP.md` said *"until sync exists, export is the backup."* **That is only half true, and the half that is
false is the half that matters.** The export (`Export and share journal`) writes **the journal's lines** — the
clear record of what happened. It does **not** contain the sealed words, the sealed pictures, or their keys: those live
in the app's private storage (`attachments/`, `attachment-keys/`) and go nowhere. So:

| What a person would call… | Survives losing the phone, today? |
| --- | --- |
| *That I remembered something, from which app, when* (the journal) | **Yes, if an export was taken** — as a file, readable on a laptop |
| *What I remembered* — the words | **No** |
| *Pictures I shared to Orb* | **No** |
| *The ability to erase / see where from* | **No** (they need the phone) |

And a fresh Orb install **cannot read an export at all**: the phone has no import. So the export is a record for a
laptop, not a way to get a phone's memory back.

## 2. What would have to be true for this to be safe

1. **A copy of the content must leave the phone** — that is what a backup is. So it must be **unreadable to anyone
   but the person**: encrypted under something only they hold.
2. **Erasure becomes honest about copies.** `ERASURE.md` §2a: *a backed-up key is an un-erased payload.* Once a
   backup holds an item's key, destroying the phone's copy of the key no longer destroys the content. This cannot be
   engineered away — only **stated, scoped and kept in the person's hands**: a backup is opt-in, made by the person,
   held where they put it, and deletable by them. It is the same limit AD-12 already names for exports.
3. **Restoring must not fork history.** A lane is single-writer. If a backup is restored while the old phone is still
   writing the same lane, there are two chains claiming one lane — the one corruption the design exists to make
   impossible.
4. **A backup that was never restored is not a backup.** The restore has to exist, be tested, and be done once on the
   real phone before anyone relies on it.

## 3. The options

| | What it is | Cost | Verdict |
| --- | --- | --- | --- |
| **A. A backup file the person holds** | One encrypted file (`orb-backup-….orbbak`) in Downloads: journal + sealed items + their keys, encrypted under a passphrase **only the person knows**. They carry it where they like — Drive, a USB drive, another phone, a laptop — and the file is ciphertext, so where it sits does not matter. Restore from the file on a fresh install | No server, no second device, works today. **A forgotten passphrase is unrecoverable.** Old backups keep what was erased after them (§2.2) | **Recommended** |
| **B. A second phone** | Peer sync of lanes (`Synchronization`) | Pairing, a transport, two-writer care, a whole protocol | Later; A does not block it |
| **C. A zero-knowledge relay** | Ciphertext to a server the person does not control | Infrastructure, an account, a threat surface | Later; A does not block it |
| **D. Export plus a reminder** | Status quo, nagged | **Does not protect the words or pictures at all** (§1) | Refused as the answer, kept as a complement |

## 4. The design (option A)

**What a backup holds.** The journal (the person's lane, unchanged bytes) and, for every item **not erased**, its sealed
bytes and key. It also holds the **destruction markers** of what *was* erased, so that after a restore Orb still refuses
to re-mint a destroyed identity (`Attachments` inv. 8). It holds **no key for an erased item** — erasure before the
backup is honoured by the backup — and nothing else: no passphrase, no setting, no allow-list copy (the allow-list is
events in the journal).

**How it is protected.** AES-256-GCM, in **chunks**, so a 25 MB picture does not need 25 MB twice in memory and a
truncated or reordered file is detected (each chunk is authenticated with its position and a *last-chunk* flag). The
key comes from the passphrase with **PBKDF2-HMAC-SHA256** (the platform has it; no library) at a high iteration count
recorded in the file's header, with a random salt. **Restore refuses a header that asks for fewer iterations than the
floor** (an attacker cannot talk Orb into a weak key). PBKDF2 is the weakest part of this and is chosen because it
needs nothing added; a memory-hard KDF would be better and is recorded as a debt.

**The passphrase.** Typed twice; at least 12 characters; held in memory only for the duration of the call and then
overwritten; **never stored, logged, journaled or sent**. The journal records only *that* a backup was made (`orb.backup`:
when, how many items, how many bytes) — the one fact the *Last backup* line needs. **No passphrase hint is stored**: a hint
is a weakened passphrase.

**Restore** (a button on a fresh install only). The person chooses the file with Android's file picker (no storage
permission), types the passphrase; Orb **decrypts and verifies the whole backup into a scratch area first, and only if every
chunk authenticates and the journal verifies does it replace anything**. A wrong passphrase, a damaged file, a truncated
file all fail closed with nothing changed. On success this phone **becomes the old install** (same lane): it appends
`orb.restored` (when, from which backup) and carries on the chain. Declared erasures then **replay on the next start**
(`Erase.reconcile`), so anything erased after the backup is destroyed again.

**The fork guard.** Restore is refused unless the current install holds nothing of its own (only its start events). The
screen says plainly: *"Only restore if the old phone is lost or wiped. If the old phone is still in use, this would put two
phones on one history."* The laptop importer already refuses two chains under one lane, so a fork is detectable, not silent.

**The reminder.** An in-app line on the main screen: *Last backup: never* / *12 days ago*, turning into a warning after 7
days. **No notification, no background work** — Orb asks for no new permission to nag. (A notification would be a new
capability and its own decision.)

**Where it lives.** `Backup.java.in` writes and reads the container (pure, JVM-testable: it takes streams and a directory);
`MainActivity` has two buttons and the status line; the file picker is the only new Android surface. Only `Backup`
touches the sealed store besides `Capture` and `Recall` (guard test).

## 4b. Revised 2026-10-01 after the operator's brief — control, and automatic

> *"I should be able to control and give access as much as I want, and losing a phone should not lose my data. I will take
> the necessary precautions."* A backup that has to be remembered is a backup that is forgotten, so the recommendation is
> **the same encrypted file, written automatically to a folder the person chooses**, in two steps.

**Step 1 — the core: Back up now, Restore.** As §4. Proven end to end (including restored once on the real phone) before
anything is automated.

**Step 2 — automatic, into a place the person picks.** The person chooses a **folder once** with Android's folder picker
(Google Drive, Dropbox, a USB drive, an SD card — whatever their phone offers). Android lets Orb keep write access to
*that folder only*, without a storage permission. Orb writes the encrypted backup there itself; **the person's own sync app
carries it off the phone**. So **Orb never gets an account, a server, or the internet** — local-first holds — and the person
chooses where their data goes and can change or stop it any time.

- **The passphrase and automatic backups.** The passphrase is typed once; Orb derives the backup key from it and keeps *that
  key* (not the passphrase) wrapped by the phone's hardware-backed Keystore, so it can write backups without asking. Restore
  always needs the passphrase (the key is re-derived from it and the salt in the file). Forget the passphrase and a lost phone is
  unrecoverable — which is why §6 asks for precautions, not a hint.
- **The controls** (all in one screen, all changeable): **where** (the folder); **what** (words always; pictures yes / no — they
  are big; later, per-app); **how often** (after changes, at most once a day, or manual only); **how many copies to keep** (the
  newest N; older ones Orb deletes **from that folder** — it cannot delete copies the sync app already made elsewhere); **stop**
  (forget the folder and the key; Orb offers to delete what it wrote).
- **Visible failure.** If the folder disappears (a USB unplugged, a revoked permission), the main screen says *Backups stopped:
  Orb cannot write to your folder* — a silent failure here would be the worst kind. The *Last backup* line and the 7-day warning
  remain for manual use.

**The precautions the operator takes** (Orb states them where the passphrase is set): keep the passphrase somewhere safe that is not
the phone (a password manager, paper at home); keep the backup in a place that is not the phone; **restore once, on purpose, to
see that it works**; and when something sensitive is erased, delete older backup files that hold it.

**Step 3 — later, not now.** A second phone or a zero-knowledge relay, which would make protection continuous without a file.
Step 1 and 2 do not block it.

## 5. Invariants and tests

- A backup is **ciphertext throughout**: no word of any item, no URL, no identity, no app name in the file (a grep test over
  a backup of known content).
- **Round trip**: back up, wipe the app's storage, restore — the journal is byte-identical, every sealed item opens to its
  original bytes, `verify` is clean.
- **Erasure is honoured**: an item erased before the backup is **not in it** (no blob, no key); one erased after, once restored,
  is destroyed again by the replay; a destroyed identity cannot be re-minted after a restore.
- **Fails closed**: wrong passphrase, one flipped bit anywhere, a truncated file, a reordered chunk, a downgraded KDF header, a
  restore onto a non-fresh install — each changes nothing and says why.
- **The passphrase is nowhere**: not in the file, not in the journal, not in any file under the app's directory after the call.
- **Memory is bounded** (chunking): backing up a large item does not hold it twice.
- **Mutation-checked**, as everything here is; and **restored once on the real phone** before it is called done.

## 6. What the operator decides *(adopted, 2026-10-01: the recommendation, Step 1 then Step 2 — awaiting a yes to start)*

1. **Option A?** (A passphrase-protected backup file the person carries; a second phone and a relay later, not now.)
2. **Accept the honest limit?** A backup you made keeps what you erased *after* it, until you delete that file — the same as an
   export. Orb says so on the screen that makes a backup, and the *Erase* dialog does not claim to reach backups.
3. **Restore as the same install** (this phone becomes the old one, with the fork guard), rather than as a new lane that imports
   the old (which needs multi-lane reading across Recall, Erasure and Provenance — a much larger change)?
4. **A reminder line after 7 days?** (Or another interval.)

## 7. Not here

No second-phone sync, no relay, no cloud account, no automatic or scheduled backup, no notification, no backup of the
laptop's journal (the laptop already holds what it imported). A restore **onto a laptop** is not offered: the laptop reads
the journal from an export as it does today.
