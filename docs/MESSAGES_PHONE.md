# Messages — from an export file you make, read the way PDFs are (stage 2c, redesigned after the SMS probe; proposed)

> Status: **built 2026-10-03 (DR-37, AD-32) — awaiting the device (`DEVICE_LOOP.md` §7b85, `orb-app-v48-messages.apk`).** The operator approved the design and the build ("Yes, go ahead with the messages build").
> **Why this and not the permission:** an app declaring `READ_SMS` is **blocked by Play Protect on the operator's phone with no override** (`DEVICE_LOOP.md` §7b83). Orb will never hold an SMS permission. The route left is the one already proved with PDFs: **you hand Orb a file, you see what is in it, you tick what to keep.** Here the file is a **message export made by another app**.
> Builds on: Sources (`SOURCES_PHONE.md`, DR-33), documents in Coming up (`DOCUMENT_USE_PHONE.md`, DR-34), People (DR-24/25), person links (DR-29). Written together with the **scale and time** questions that `Is the system equipped…` (2026-10-03) found open — they are §4–5 here.

## 1. Why, in plain words

Your conversations with the people who matter — who said they would pay on Friday, who sent the address, who asked for the invoice — are in your text messages. Orb cannot read them directly, by Android's rules and Google's. But a free backup app from the Play Store (for example *SMS Backup & Restore*) can write your messages to **a file in Downloads**. Orb can then read **that file**, exactly as it reads a PDF: you choose it, you see the conversations listed with their last words, you tick the ones you want, and **only those are kept** — sealed, searchable, tied to the right person by their number, with the dates and deadlines in them showing in Coming up.

## 2. What you would do and see

1. **Once, outside Orb:** install a messages backup app from the Play Store, make a backup (**XML** file, to Downloads). *(Orb does not make, store or delete this file. After you have used it, delete it: it holds every message in the clear.)*
2. **Sources → Text messages** (a second row beside *PDF files*) → **Turn on text messages** (a recorded decision of yours) → **Pick the export file**.
3. **Orb reads the file once and lists the conversations:** for each person's number (or the contact name the backup app wrote) — *how many messages, from when to when, the last message's first words* — newest first, up to 50. It also says what it **left out by itself**: *service senders* (banks, one-time codes, offers, which write from names like `AX-HDFCBK`, not numbers) and *messages with codes* (OTP, PIN, CVV) — **counted, never listed.**
4. **Tick the conversations to keep → Keep.** For each ticked conversation Orb keeps **one item per finished month**, for the **last 12 months** (see §4). The screen says how many items that makes *before* you press Keep.
5. **After that** the items are ordinary kept words: searchable in Recall, tied to the person by their number (**sure**, as the number is written in each line), their dates and deadlines in **Coming up** (with the line they are on, as for PDFs), commitments by *Track this…*, erasable one by one.

## 3. What is read, what is kept, what is never kept

- **Read:** the one file you pick, once, **streamed** — it is not loaded whole — to count conversations (pass 1) and, only for ticked ones, to collect their messages (pass 2 at Keep). Nothing is read outside that file.
- **Kept (only if ticked):** the **words**, sealed — each month of a conversation as one text, every message on its own line as `[12 Sep 2026 14:05] +91… (name the backup app wrote): the message`. The number is in each line **on purpose**: it is what ties the item to the person (the same way a phone number in any kept text does).
- **Never kept:** service senders (names, not numbers); messages that look like codes (*OTP*, *one-time*, *verification code*, *PIN*, *CVV*, *password*); the current, unfinished month; pictures and group messages (MMS); anything unticked. **Unticked conversations are forgotten the moment you leave the screen — nothing about them is recorded.**
- **Recorded (counts only):** `orb.source.looked` (source `messages`: how many conversations and messages were in the file, how many left out), `orb.source.kept` (how many items). The kept items are `orb.shared` records exactly as documents are, with `referrer: orb-source://messages` and the **month** they cover (e.g. `2026-09`) — **no number, name or word.**

## 4. Scale — the open question, answered by caps and by measuring

Orb's screens read the newest **500** kept items each time they open (`Recall.SCAN_LIMIT`), decrypting each in memory. A year of a busy conversation is 12 items; twenty conversations is 240. So:

- **Caps, in the design:** at most **12 months per conversation**, at most **60 items per Keep**, and Orb **says plainly, before Keep,** how many items it will add and how many Orb will then hold (*you will have 312 items; the screens read the newest 500*). Coming up already says *looked at the newest 500, N not looked at* when the limit bites — that line stays.
- **No index yet.** A stored index of what is in each item would be a derived copy that must be kept in step with erasure (DR-19 said computed views are never stored, for that reason). I will not build one on a guess. **First measure:** the first device round with messages reports how long People and Coming up take with the new items (the screens already know how many items they read; the round asks you how it *feels*, and the build records the number of items read, counts only). **If it is slow or the limit bites, an index gets its own design**, with erase and rebuild proven first.

## 5. Time — what makes a message item honest

- **Items are monthly, closed months only, in your phone's time zone.** A month's text never changes once the month is over, so keeping the same month again from a newer export gives **identical words**, which Orb already recognises (*already in Orb*) — no duplicates, no growing threads. The unfinished month is not offered until it ends.
- **If the same month comes back different** (an earlier export had fewer messages), Orb can tell: each message item carries a **blinded key** for *(conversation, month)* — a keyed hash made with Orb's own secret, so it reveals nothing and cannot be reversed — and the row says ***an earlier version of this month is already in Orb***; it is **not kept again** (erase the old one and keep again if you want the new). This is the same device the sealed store already uses for addresses.
- **When it happened** is the month the words cover (in the clear record) and each message's own time (in the sealed text) — **not** the day you kept it. For these items **no relative-day guess is made** (*Friday* is not read from the keep day); only dates **written down** count, with the line they are on, deadlines first — the rule documents already follow (DR-34). A message's own day could anchor guesses later; not in this slice.

## 6. What it changes in the architecture

- **A new declared capability `orb.read.messages` v1** — *Observe*, switchable, words pinned: *Reads, in the one message-backup file you choose, the conversations and messages — only when you pick it and tap Look, only on the phone. Nothing is kept unless you tick it; only counts are recorded.* **No Android permission, no manifest change, no new query.** The Orb manifest stays exactly as it is.
- New: `MessagesRules` (pure: the format, grouping by number, service-sender and code filters, closed months, the line format, the caps), `MessagesReader` (**the one file** that parses the export, streaming), `MessagesFlow` (look and keep, off the phone with a test reader — the shape of `DocumentsFlow`), `MessagesFacts`; `SourcesActivity` gains the row. A `via`-style recognition by `referrer` extends the document paths (`DocumentDates` etc.) to message items; `Recall.fromLabel` names them *a message backup you chose*.
- **Reuses, unchanged:** the sealed store, the share record, the observation, `Erasure`, People's matching by number, Coming up's document rules, person links.
- **No change** to the journal rules or any existing record.

## 7. The file format, and what happens if it is not what I expect

I know the common XML written by *SMS Backup & Restore*: `<smses count="…"> <sms address="+91…" date="<epoch ms>" type="1|2|…" body="…" contact_name="…" read="1" … />`, with `<mms>` elements (ignored). **I have not seen your file.** So:

- The reader is written to that shape, **tolerant of attributes it does not know**, and **reads nothing but** `address`, `date`, `type`, `body` and `contact_name`.
- If the file is not recognised, the screen says so and shows **only the file's tag and attribute *names*** — never a value — so the next step needs no one to paste a message: *"Not recognised. Found: <smses> → <sms> with attributes: address, date, … (names only)."*
- Other formats (a JSON backup, another app's XML) are a later, separate step once you have a file in hand.

## 8. Risks, said plainly

| Risk | Handling |
| --- | --- |
| **The export file is every message in the clear, in Downloads.** | Orb says so on the screen and after Keep; it neither makes nor deletes the file; the screen is secure; **delete the file when you are done.** |
| **A third-party backup app needs the SMS permission itself.** | It comes from the Play Store, where Android and Google allow it; **Orb does not and cannot hold the permission.** Which app you trust is your choice; Orb names none as endorsed. |
| **The unfinished month is missing.** | Said plainly; it appears when the month ends and you export again. |
| **A number that is not a saved contact.** | Listed by number; the item is tied to nobody until you link it (*This is about a person…*). |
| **Code detection misses one** (a one-time code worded oddly). | The filter is a short fixed list, held by tests; a miss means a code in a sealed item you ticked — erasable, never sent. Service senders (where nearly all codes come from) are not offered at all. |
| **Wrong grouping** (one person, two numbers; a number with no country code). | Grouped by the number as normalised for People (`+91…`); People already merges a person's numbers. Unsaved variants may show as two rows; tick both. |
| **Speed:** a large export (50,000 messages). | Streamed, not loaded; a cap of 200 MB and 200,000 messages with the reason shown; pass 1 keeps only counts and a 120-character last-message snippet per conversation. |
| **Not testable off the phone:** the real file's shape; how fast People feels with hundreds of items. | The first round decides both (§4, §7). |

## 9. Tests, off the phone

`MessagesRules` pure: the format and the closed-month rule across time zones and month ends; grouping by number; service-sender filter; code filter (each word, near-misses); the line format; caps (12 months, 60 items); the blinded key (stable, different per conversation/month); the preview. `MessagesFlow` with a fake reader: look keeps nothing; keep seals exactly the lines, records only counts and the month, holds no word or number in the journal or on disk in the clear; a second keep adds nothing; an earlier-version month is not kept again; erased is not kept again; one bad conversation does not stop the rest. Source guards: only `MessagesReader` parses the export; **no SMS permission or API anywhere** (`READ_SMS`, `Telephony`, `SmsManager` stay in `UNDECLARED_READS`); the manifest unchanged; the screen secure and starting only the file picker; nothing read before the grant. Mutation checks as before. A fixture XML in the repository is **made-up**, never a real export.

## 10. Not in this slice

An index (§4); MMS and group chats; JSON or other apps' formats (§7); the current month; per-message anchors for relative days (§5); service senders (banks) — a possible later, separately-decided slice because they hold money and codes; reading the export for **calls** (the calls build covers that); a model reading anything (DR-9); deleting the export file.

## 11. For the operator to approve

1. **The route:** a message-backup export file you make, read through Orb's file picker — **no SMS permission, no manifest change.**
2. **Conversations by number only; service senders and code messages left out and only counted.**
3. **One item per finished month, last 12 months per conversation, ≤ 60 items per Keep, and the count shown before you press Keep.**
4. **Written dates only, deadlines first, as for documents** (no relative guesses).
5. **No index now;** measure first, design one only if needed.
6. **XML from *SMS Backup & Restore* first;** unrecognised files show tag and attribute names only.

## 12. As built (v48)

- **Files.** `MessagesXml` (the streaming reader: the platform's SAX parser, five attributes of `<sms>`, nothing external fetched, a cap, and a recognition that holds names only), `MessagesRules` (pure: the number test, the code filter, finished months in the person's zone, the survey of pass 1, the harvest of pass 2, the sealed words, the caps), `MessagesFlow` (look and keep, off the phone with a source the test supplies), `MessagesFacts` (the records, the referrer, the blinded key's reading), `MessagesAccess` (the recorded grant), `MessagesReader` (the one file that opens the picked file), a third section on `SourcesActivity`, and the capability `orb.read.messages` v1 on **What Orb may do**.
- **No permission, no manifest change, no new query.** The call-history permission is in the calls build as before; the messages source needs nothing. `Telephony`, `content://sms`, `SmsManager` and the SMS permissions appear in no source file (a test holds it).
- **What you see.** *Sources → Text messages → Turn on text messages* (a recorded decision) → *Pick the backup file* → the screen reads it once and lists up to 50 conversations by number: *+91… (name) · 5 messages · Aug 2026 to Sep 2026 · up to 2 items*, with the last words; above them what was **left out and only counted** (service senders, code-like messages, this month or older than a year, drafts); a line under them that updates as you tick (*N conversations ticked — up to M items (at most 60 per Keep). Orb holds H kept items; its screens read the newest 500 — or this may push older ones out of view*); **Keep the ticked ones**; and the reminder to delete the backup file.
- **What is sealed.** One item per finished month: `Messages with +91… (name) — Sep 2026`, then each message on its own line as `[12 Sep 2026 14:05] +91…: words` (sent ones `you to +91…`), in English and the phone's time zone so the same month always seals to the same words. The clear record is an `orb.shared` with `referrer: orb-source://messages/<16 hex>/<YYYY-MM>` — the key is a keyed hash of *(number, month)* made with Orb's own secret.
- **Same month again:** identical words → *already in Orb*; a different version of a kept month (fewer messages then) → ***an earlier version … is already in Orb*, not kept again**; erased → *not kept again from here*.
- **Rest of Orb.** A message month is read by the document rules in Coming up (written dates only, with their message, deadlines first, the rest folded) and the number in each line ties it to the person as *sure*; Recall names it *a message backup you chose*.
- **Made-up sample:** `docs/fixtures/orb-sample-messages.xml` (two made-up numbers, a bank-style sender and a code message) to try the flow without exposing a real export; the tests also read it.
- **Tests.** The parser (entities, newlines, an emoji, the mms ignored, a bad or missing date skipped, the cap, an unknown file described by names only, an external entity never fetched, non-XML an error); the rules (numbers, every code word and near-miss, the months and their edges and zones, the survey's counts, the 50 cap, the sealed words and their order and zone, ticks only); the flow (looking keeps nothing; keeping seals, records, holds no number or word in the journal or on disk; the same months again; an earlier version; erased; sixty per Keep, then the rest; how a kept month shows in Coming up, People and Recall; the status); and source guards.

## 13. The operator's backup app (2026-10-03, from his screenshots)

The app on the operator's phone is **"SMS Backup & Restore" 2.3.7 with a purple interface, a *Backup All / Backup Conversations / Delete All SMS* screen and a default location `/storage/emulated/0/AllBackupRestore`** — **not** the SyncTech app this design was written against (that one writes `sms-<date>.xml` into its own folder). **Its file format is unverified.** Many apps of this family copy the same XML, but Orb's reader will only know when it meets the real file. The next step is cheap: the operator makes a backup of **a few conversations** (*Backup Conversations*) and reports **the file's name and extension only**; if Orb says *Not recognised*, it shows the tag and attribute **names** (never a value), and the reader is adapted to what they are.

Two cautions given to the operator: that app asks for ***All files access*** (read, modify and delete every file) — leave it off first, try the *Storage Backup Location* pencil to pick a normal folder, and switch it off again in Settings afterwards if it must be granted; and **never tap *Delete All SMS* or *Delete All local Backups*** while testing. Orb endorses no backup app.
