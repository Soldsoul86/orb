# Sources — letting Orb read what you choose to give it (stage 2 of the operator's flow; proposed)

> Status: **proposed 2026-10-02, awaiting the operator's go-ahead.** Stage 2 of the flow the operator wrote (*"the next scan: email, messages, PDFs, … create a profile with my inputs, create commitments"*; *"messages in my mobile can be scanned and callings as well, downloads will have PDFs, building a profile with my explicit permission"*). **Because each source is a different permission and a different risk, stage 2 is cut into three slices that are approved one at a time. This document asks you to approve slice 2a — PDFs in a folder you choose — and the framework it sets up; 2b and 2c are described so you can see where it goes and are not built until you say.** Nothing here is built.
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
