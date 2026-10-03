# Sources — letting Orb read what you choose to give it (stage 2 of the operator's flow; proposed)

> Status: **slice 2a built 2026-10-02 (DR-33, AD-28) — awaiting the device (`DEVICE_LOOP.md` §7b78, `orb-app-v42-sources.apk`).** The operator approved the framework, slice 2a and the order ("Yes, go ahead with slice 2a"). **Two things changed between this design and the build, both found while building and both stated in §10: Android refuses the Downloads folder itself in its folder picker, so a *Pick files* path was added beside *Choose a folder*; and a kept document's provenance reads *a PDF you chose*.** 2b (call log) and 2c (messages) are not built and not approved.
> Builds on: share (`SENSOR_SHARE.md`, the sealed-item pipeline), Recall, People, Commitments and *Coming up*, the capability registry (`Capabilities`), and the Safety check's pattern (a recorded grant, then the read; `SAFETY_CHECK_PHONE.md`).

## 1. Why, in plain words

Today Orb knows only what you **hand** it: you tap Share, one thing at a time. Your invoices, tickets, statements and letters are PDFs sitting in Downloads; your promises and your history with people sit in your messages and call log. Stage 2 lets Orb **reach for** those — but only the ones you choose, only when you ask, and **nothing is kept until you have seen it and ticked it.**

Reaching is different from receiving. `SENSOR_SHARE.md` §1 says receiving a share is not a capability because the world reaches in; **here Orb reaches out, so each source is a declared capability (tier *Observe*, switchable), with a recorded grant, a read, and a record — the same gate as the Safety check.**

## 2. The framework (one pattern for every source)

1. **A Sources screen** (button on the main screen). One row per source, each with its own switch (off until you turn it on), what it reads in one sentence, and what is kept.
2. **Pull, not push.** Orb reads **only when you tap *Look now*** on a source. No background reading, no schedule.
3. **A preview, then a choice.** *Look now* lists what it found — names, dates, a few opening lines. **You tick what to keep.** Unticked things are **forgotten the moment you leave the screen**: nothing copied, nothing recorded about them.
4. **Kept things go through the pipeline that shares already use**: sealed (own key, erase = destroy the key), searchable in Recall, mentioned people found, dates proposed in *Coming up*, commitments you can make from them. **No second store.** Provenance says where it came from (*from your Documents folder*), not just *shared*.
5. **The record is counts only**: that you switched a source on, that you looked (*N found*), that you kept *M*. **Never a file name, a sender, a number or a word.**
6. **Switching a source off** records it, stops all reading, and releases whatever Android access was held. What you already kept stays, erasable one by one like any item.

## 3. Slice 2a — PDFs in a folder you choose (proposed to build)

**What you do.** *Sources → Documents → Choose a folder* (Android's own folder picker opens; you pick *Downloads*, or any folder). *Look now* → a list of the PDFs in that folder, newest first: name, date, size, **the first lines of its text**, and *already in Orb* where you kept it before. Tick some → **Keep**.

**No Android permission.** The folder picker (`ACTION_OPEN_DOCUMENT_TREE`) gives Orb access to **that one folder** and nothing else; Android remembers it for Orb until you switch the source off. The manifest still holds three permissions; the guard that says so is unchanged.

**Reading a PDF's text.** Android's own `PdfRenderer` can return a page's text on current phones (Android 15+/16, SDK extension 13 — **your Pixel 10a, Android 16, has it**). Orb uses it; **no third-party PDF library**. Where the phone cannot, the row says *this phone cannot read the text of PDFs* and nothing can be kept from it. This is **not testable off the phone** — the pure parts are; the extraction is read through an interface that the tests replace.

**Limits, stated.**
- **One folder level**, not sub-folders (Downloads is flat; recursive reading is a later step).
- **A file over 10 MB, a PDF over 60 pages, or a password-protected PDF** is listed as *not read* with the reason.
- **A PDF with no text (a scan)** shows *no text found* and **cannot be kept** in this slice (Orb has no PDF viewer and no text recognition; both are separate decisions).
- **Text only is kept** — the **words** go through the pipeline sealed; the **file itself is not copied**. (Keeping the original is a later question: it needs a viewer and doubles what a person's stolen phone could expose.)
- **At most 40 files listed** per look, newest first.

**What it cannot judge.** A PDF can be a bank statement or an identity document. Orb does not know. **That is why nothing is kept without your tick**, the screen is secure (no screenshots), and each kept item can be erased on its own.

**The capability:** `orb.read.documents` v1, **Observe, switchable**, words pinned in the registry: *Reads, in the one folder you chose, the names, dates and text of PDF files — only when you tap Look now, only on the phone. Nothing is kept unless you tick it; only counts are recorded.* Revoke = *Switch off the Documents source*.

**Records (new, additive, counts only):** `orb.source.chosen` (source, no folder name), `orb.source.looked` (source, found, unreadable), `orb.source.kept` (source, kept). A kept item also produces the **same observation a share does**, with a `via: documents` field, so every downstream view (Recall, People, *Coming up*, commitments) works unchanged. `orb.source.off` on switch-off.

**Tests (off the phone).** Listing rules (PDF only, one level, newest first, the 40 cut, size/page limits), the preview trimmer (first lines, no control characters, the cut), *already in Orb* matching by content, the keep path producing the same sealed item as a share (and an erase destroying its key), the records carrying no name/word, a source guard that **only one file** touches the folder picker and the PDF text API, that it **adds no permission**, that the screen is secure, and that **nothing is read before the grant is recorded**. Mutation checks on the rules as before.

## 4. Slice 2b — the call log (described, not proposed for this approval)

**What it would read:** who called or was called, when, for how long, missed or answered — **never what was said** (Android keeps none). **It needs `READ_CALL_LOG`**, a permission Android calls *hard-restricted*: on a phone where Orb was installed by hand (as now), Android asks you to **allow restricted settings** for Orb first (App info → ⋮ → *Allow restricted settings*), and **Play Protect is likely to react** to a sideloaded app that holds it (it blocked `QUERY_ALL_PACKAGES`). **It would also change the manifest guard** (three permissions → four) — an architecture change that needs your decision on its own. **The use is People:** *last spoke with Arun, Tuesday, 4 minutes*, a **computed view on a person's page** (read when you open them, never copied), so the call log is not a second store. A *keep this call* action is not proposed.

## 5. Slice 2c — messages (described, not proposed for this approval)

**What it would read:** the text messages on the phone (SMS only — WhatsApp, RCS and other apps' chats are not reachable; they stay *share*). **It needs `READ_SMS`**, **hard-restricted** like the call log, with the same restricted-settings step and Play Protect risk, and it is the most sensitive source Orb could hold: **one-time codes, bank alerts and every private conversation.** If built, the design would be **per conversation and per tick** — *Look now* lists conversations with a person (never all), you tick which to keep, one-time-code and bank-sender messages are **left out by default** — and the content would join People's context and the commitment proposals. **Not built until 2a has run on the phone and you decide.**

## 6. What it changes in the architecture (2a)

- **A new declared capability `orb.read.documents` v1** in the registry; new files `DocumentsReader` (the one file that touches the folder picker's access and the PDF text API), `DocumentsRules` (pure: listing and preview rules), `SourcesFacts` (the records), `SourcesActivity` (the screen), a *Sources* button.
- **A small extension to the share pipeline:** a `via` field on the kept item's observation so provenance can say *Documents*. Additive; old items read as before.
- **No new Android permission; the manifest guard is unchanged.**
- **No change to the Event Journal rules**: new event types are additive, nothing mutated.

## 7. Risks, said plainly

1. **The PDF text API may not behave on every PDF** (odd fonts, columns read out of order). The preview shows what Orb read, **before** keeping — the operator sees the quality first. If it is poor, this slice has not earned its keep and we stop.
2. **Sensitive documents.** Unknowable to Orb; handled by *nothing without a tick*, secure screen, erase. Not by guessing.
3. **The folder grant is a standing grant** to read that folder until switched off. It is shown on **What Orb may do**, revocable, and every look is recorded.
4. **Not testable off the phone:** the folder picker, the persisted access, the PDF text extraction. The first device round is the real test.
5. **Play Protect** is not expected to react to this slice (no new permission, no new `<queries>`). 2b and 2c carry the real Play Protect risk and are decided separately.

## 8. For the operator to approve

1. **The framework** — Sources screen, per-source switch, *Look now* only (no background reading), preview then tick, nothing kept unticked, records counts-only.
2. **Slice 2a: PDFs in a folder you choose** — no new permission, text only (not the file), one folder level, scans cannot be kept in this slice.
3. **The order:** PDFs first, then the call log (2b), then messages (2c), **each approved separately** because each adds a hard-restricted permission and changes the manifest guard.

## 9. Not in this slice

The call log and messages (above); email (Gmail, last — the first thing that needs the network); keeping the original PDF file or a PDF viewer; text recognition for scans; sub-folders; Word/Excel/other file types; any model reading the text (its own decision about what leaves the phone, DR-9); automatic re-scans.

## 10. As built (slice 2a)

- **Files.** `DocumentsRules` (pure: listing, limits, cleaning, preview, row wording), `DocumentsFlow` (look and keep, off the phone with a test reader), `DocumentsFacts` (the three records and the share record's provenance), `DocumentsAccess` (the recorded grant, the chosen folder, release on switch-off, reconcile after a restore), `DocumentsReader` (**the one file** that lists a folder and reads a PDF's text), `SourcesActivity` (the screen), a *Sources* button, and the capability `orb.read.documents` v1 on **What Orb may do**.
- **Android refuses the Downloads folder in its folder picker** (since Android 11 an app cannot be given the Downloads folder, the storage root or `Android/data` that way). This was not in the design, which said *you pick Downloads*. **Fix inside the approved framework, no new permission:** *Choose a folder* works for any other folder — including one **inside** Downloads — and **Pick files** opens Android's file picker (which does open Downloads, multi-select, PDFs only): the files you pick are the files Orb looks at. Same preview, same ticking, same record.
- **The look.** Files are read one at a time in the background and their rows fill in as they are read: the first words, or why it was not read (over 10 MB, over 60 pages, password, no text, or *this phone could not read this file's text*). *Already in Orb* is decided by **the content**, not the name: the cleaned words are hashed as they would be sealed and asked of the store.
- **The keep.** Only ticked, readable, new files. Each is read again, cleaned, sealed exactly as shared text is, and recorded as an `orb.shared` record with `action: orb.source.documents`, `referrer: orb-source://documents`, `mimeType: application/pdf`, `textChars` — **no name, no words** — then observed. Content already held, or erased before, is **not written again** (an erased one can be kept again through Share, where the question is asked). Recall names it *a PDF you chose*.
- **Records:** `orb.source.chosen`, `orb.source.looked` (found, unreadable), `orb.source.kept` (kept) — counts only, plus the grant and its withdrawal.
- **Also fixed:** the Safety check's grant was never reconciled after a restore (`DocumentsAccess` and `SafetyAccess` both are now, at start-up).
- **Tests.** Every rule and boundary (10 MB exactly/over, 40 listed, ties, case); cleaning (line endings, control characters, blank lines, trim, the 200,000 cut, idempotence); previews; row wording; look keeps nothing; keep seals, records, observes, holds no word or name in the journal or on disk in the clear; a second keep adds nothing; erased is not kept again; one bad file does not stop the others; the records; and source guards (one reader; no write modes; rules pure; secure screen; two pickers and nothing else; read-only access; grant before choosing; nothing looked at unless on; two journal writes; ticked-only keep; no new permission or query).

**Verified 2026-10-03** on the operator's phone through *Pick files*: four PDFs read by Android's reader and kept as text; records counts only. The folder path (*Choose a folder*) has not been exercised yet.

**Finding 2026-10-03 (from the calls research, `CALLS_PHONE.md` §0):** Play Protect's documented block on sideloaded apps names `READ_SMS` and `RECEIVE_SMS` and is running in India. A sideloaded Orb declaring them would very probably be **blocked at install**, not just warned. Slice 2c (messages) by permission is therefore **probably closed for this distribution**; the route that remains is what the person **shares** (which already works), or a different distribution. It is not to be designed further until that is settled.

**Probe 2026-10-03:** the operator asked to test `READ_SMS` on his phone before anything is built — `DEVICE_LOOP.md` §7b83, `orb-sms-probe.apk`. The block predicted above is a prediction until then.

**Settled by the probe, 2026-10-03 (`DEVICE_LOOP.md` §7b83):** an app declaring `READ_SMS` is **blocked by Play Protect on the operator's phone with no override** (*App blocked to protect your device*, one **OK** button). **Slice 2c (messages by permission) is closed for this distribution.** The routes that remain, none needing the permission: **what you share** (works today); and, to be designed with the scale-and-time design, **a message export file made by another app** (SMS backup apps write a file to Downloads) **that Orb reads through the same file picker as PDFs** — preview, tick, keep. Orb itself would still hold no SMS permission.
