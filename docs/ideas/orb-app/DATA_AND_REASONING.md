# Your data, who can read it, and how Orb reasons over it

Status: audit 2026-09-24; the reasoning (LLM) layer is a **proposal awaiting
approval**. The live version of the audit is Orb's Phone tab → "Who can see what",
built from the permissions actually granted on the phone (`src/orb/datamap.ts`).

## 1. What data is on the phone

| Data | Where it lives | Who else can read it | Orb today | What it gives Orb | How to secure |
|---|---|---|---|---|---|
| SMS | Android's message store | Any app granted SMS (12 on your phone) | Reads (with permission) | Bank alerts, autopays, scams, secrets sitting in SMS | Take SMS away from apps that only fill OTPs; delete messages holding passwords |
| Notifications | Passing through Android | Apps with notification access (none of yours) | Not used | OTPs and payment confirmations from apps | Keep the list empty |
| Screen and taps (Accessibility) | — | Apps you enable (only Orb) | UPI pay and PIN screens; WhatsApp message box if you turn it on | The pay and message guards | Allow only apps you trust; Orb has no internet |
| Contacts | Contacts provider | Apps granted Contacts | Reads | Who is who; unknown callers | Remove from apps that don't need your address book |
| Call log | Call log provider | Apps granted Call logs | Reads | Unknown numbers that keep calling | Usually only the dialer and Truecaller-type apps |
| Installed apps and their permissions | Package manager | Any app, mostly | Reads | Phone check and this map | Uninstall what you don't use, especially apps not from the Play Store |
| Screen time | Usage stats | Apps with usage access | Reads (with permission) | Off-phone hours for the guards | Keep usage access to few apps |
| Location | Location services | Apps granted Location (some "all the time") | Not used | Trips, usual places, "paying from an unusual place" | Prefer "while using"; remove "all the time" |
| Photos, files, downloads | Shared storage | Apps granted Photos / All files | Not used | Could find photos of ID cards and cheques; stray `.apk` files | Limit to "selected photos"; delete ID photos from the gallery |
| Microphone, camera | Sensors | Apps granted them | Not used | — | Only apps that need them |
| Calendar | Calendar provider | Apps granted Calendar | Not used | Travel and routine | — |
| Health | Health Connect | Apps you connect | Not used | Sleep | — |
| Other apps' own data (WhatsApp chats, Gmail, bank apps) | Each app's private storage | Only that app | Not readable | — | Exports only: Google Takeout, WhatsApp "Export chat" |
| Your Google account (mail, Drive, Maps history) | Google's servers | Google; apps you connected | Takeout on the Mac; Drive via this chat's connector | Receipts, trips, history | Review third-party access at myaccount.google.com → Security |

What Orb reads stays in its private storage on the phone. The app has no
internet permission. On the Mac, raw copies are no longer kept.

## 2. What to secure first (from your phone)

1. 12 apps can read all your SMS, OTPs included. Keep it for the bank apps and Google Pay; remove it from Amazon, Flipkart, Swiggy, Zepto, redBus, MyJio, Airtel Thanks and WhatsApp.
2. 4 passwords sit in your SMS (ACT Fibernet, Deejos): change them, then delete the messages.
3. Blinkit Lite was installed from an `.apk` file, and `Food Scan.apk` is in Downloads: keep only if you know where they came from.
4. 24 likely scam messages: don't open their links. Report them on sancharsaathi.gov.in (Chakshu).
5. Open "Who can see what" and check location "all the time", microphone and photos for apps that don't need them.

## 3. The reasoning layer (proposal)

Rules and statistics do the everyday work: deterministic, on the phone,
tested (the pay guard, the message guard, the twin). A language model runs only
when harder crunching is needed, and only to **propose**: it never changes a
rule, loosens a guard or acts on its own.

### When it runs

| Trigger | What it crunches | What it may produce |
|---|---|---|
| Weekly, while charging | Your week of observations: payments, calls, pauses, answers | A new **baseline**: what's normal now, what changed ("food delivery up 40%", "new monthly ₹25,000 to R. Iyer") |
| Something the rules can't read | A bank alert or pay screen in an unknown format | A proposed reader for that format, shown to you before it's used |
| Something unusual the rules can't explain | A payment with an odd context | A question for you ("Is this rent?"), never a block |
| You ask | "What did I spend on travel this year?" | An answer, with the entries it used |
| Your pause decisions pile up | "Sent anyway" many times for the same kind of thing | A proposed change to a rule, for you to accept |

### Where it runs

- **On the phone first**: an on-device model (Gemini Nano through Android's AICore where the Pixel supports it, or a small open model). Nothing leaves the phone.
- **A cloud model only per task, with your yes**, given masked, derived facts ("₹25,000 monthly to a person, 6 months"), never raw messages, numbers or names.
- Chosen by a model router, never a hardcoded provider (Orb constitution: model independent). Swapping models changes no data or history.

### What stays true

- Every model run is recorded as an **inference record**: which model, what it was given (masked), what it said, what changed. Replay reproduces the history, not the model.
- A model's output is a **belief with a confidence and a reason**, never a fact, and never loosens protection. Anything that would (a new rule, a lower pause) waits for your approval.
- **Visible to you**: a "Why?" on every belief and question, and a reasoning log listing every model run and what it changed.

### Build order, if approved

1. The router and the inference record (the contracts `Reasoner`, `ModelRouter`, `InferenceRecord` already exist in `contracts/`).
2. On-device model where available; the weekly baseline and the reasoning log.
3. Proposed readers for unknown formats (the unread lists become input).
4. "Ask Orb" questions over your data.
5. Cloud models, off unless you allow them per task.
