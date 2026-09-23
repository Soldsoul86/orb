# Scam Checker — Scenarios

Status: draft for review. Work out behaviour here before building the bot.

Two layers:

1. **Message scenarios** — [`scenarios.yaml`](scenarios.yaml). One forwarded
   message → the expected decision (verdict, scam type, victim stage, red
   flags). This is the test set; every checker version must pass it.
2. **User journeys** — below. Who the people are, what they send, and what the
   bot must say back. These fix the bot's conversation design.

Ids and verdicts come from [`SCAM_TAXONOMY.md`](SCAM_TAXONOMY.md).

---

## Message scenarios at a glance

60 scenarios. Every scam type in the taxonomy is covered at least once, and the
set is weighted towards investment fraud, which is 76% of money lost in India
(see [`RESEARCH.md`](RESEARCH.md)).

| Group | Ids | What they test |
|---|---|---|
| A. Authority | A01–A08 | Digital arrest, courier, TRAI, electricity (English and Kannada), challan APK, tax refund |
| B. Banking | B01–B08 | KYC link, OTP request, receive-money QR, wrong transfer, reward points, APK invitation, AnyDesk, eSIM swap |
| C. Easy money | C01–C13 | Task job (English, Hindi, already paid), fake offer letter, crypto, KBC lottery (Hindi), and the full investment funnel: ad → group → APK → bait withdrawal → "tax" to withdraw → worried child (C07–C12) |
| D. Loans | D01–D02 | Loan-app harassment, advance fee |
| E. People you know | E01–E07 | "Hi Papa" with and without money, voice clone, sextortion and its fake-police second stage, matrimony gift, army officer |
| F. Shopping | F01–F04 | Fake helpline, fake sale, Tirupati darshan (Tamil), HSR rental advance |
| G. Schemes | G01–G03 | PM Kisan (Hindi), Jio giveaway, charity appeal |
| H. Other | H01–H02 | Insurance bonus, "recovery expert" targeting a crypto-scam victim |
| N. Real messages | N01–N12 | Bank OTP, real challan, BESCOM bill, real interview, friend's GPay request, UIDAI, Amazon OTP, Kannada rental, Zerodha, family chat, SIP confirmation, friends discussing stocks |
| X. Unknown | X01 | FASTag scam with no type yet → `other_scam` |

Hard cases worth reading first:

- **N01, N07** — real OTP messages. Having an OTP in the text is not the same as
  someone *asking* for it.
- **N05** — a friend's UPI request. A payment request alone is not a scam.
- **A05 vs N03** — fake vs real electricity bill. Differences: personal number,
  "tonight", no account number.
- **F04 vs N08** — fake vs real rental. Real: visit first, pay at agreement.
- **E02, G03** — could be genuine. Verdict is `suspicious` and the advice is how
  to verify, not "this is a scam".
- **C10, C12** — the investment funnel after money is in. C12 is the family
  path: the victim believes, the child doubts.
- **A02, C02, D01, H02** — money already sent. The bot's job is to stop the
  *next* payment, not to recover the last one. Never advise paying more to
  "unfreeze", "settle" or "recover".

Known gaps (add before the Bangalore launch):

- Kannada has 2 scenarios (A06, N08). Needs at least 10.
- No Telugu, Marathi, Bengali or Malayalam yet — needed for phase 2.
- No image-only inputs (a screenshot with no text extracted).
- Only one case of each scam type; the eval needs several phrasings per type.

---

## User journeys

Bot replies below are the *content* the bot must convey. Final wording and the
translation are produced by the LLM; the structure and the facts are fixed.

### J1. Setting it up for a parent (the growth loop)

**Who:** Priya, 29, backend engineer in Bellandur. Parents in Patna.

1. Priya sees the bot shared in her company's Slack channel. She taps the
   WhatsApp link and sends "hi".
2. Bot: *Forward me any message, call details or screenshot you're unsure
   about. I'll tell you if it looks like a scam. Want to set this up for your
   parents too?*
3. Priya taps **Set up for family**. The bot gives her a message to forward
   to her father, in Hindi, with the bot's number and one line on how to use
   it.
4. Her father sends "hi" in Hindi. Bot replies in Hindi with the same
   introduction and asks nothing else — no sign-up, no personal details.

**Must hold:**
- Setup takes under 2 minutes and needs no app install.
- The bot never asks the parent for name, age, bank or Aadhaar.
- Language is detected from the parent's first message; there is no language menu.

**Metric:** family invites sent per new user. This is the whole distribution
plan; if it is below 0.5, the plan does not work.

### J2. In the middle of a digital arrest

**Who:** Priya's father, 63, retired bank clerk. On a video call with a
"CBI officer" right now.

1. He types a few lines in Hindi describing the call (scenario A01 in Hindi).
2. Bot, within seconds, in Hindi:
   - **This is a scam. Cut the call now.**
   - Police and CBI never arrest anyone on video call. "Digital arrest" does
     not exist.
   - Do not send any money. Do not tell them your account details.
   - If you already sent money, call **1930** right now.
3. Bot offers: *Should I tell Priya?* Only if he says yes, Priya gets an alert.

**Must hold:**
- The verdict is the first line. The explanation comes after.
- The reply is short enough to read while scared — under 60 words before
  the first line break.
- The family alert needs his consent every time.

### J3. Money already sent

**Who:** Ramesh, 41, Whitefield. Paid ₹14,000 into a Telegram task scheme,
now asked for ₹25,000 more (scenario C02).

1. He forwards the screenshot.
2. Bot (verdict `stop_now`), first message:
   - **Stop. Do not pay the ₹25,000. This is a task scam. Every payment after
     the first is another loss — the ₹14,000 does not come back by paying more.**
   - One line: report it on **1930** so the accounts can be flagged for others.
3. Second message: what comes next in this scam (a "tax" or "unfreeze" fee,
   then a "recovery agent") so he recognises each one. No blame.

**Must hold:**
- The first line stops the next payment. Nothing comes before it.
- The bot never suggests paying to "unfreeze", "settle", "release" or "recover".
- The bot never promises or pursues recovery of money already sent.
- The tone is not judgemental. People who feel foolish stop asking.

### J4. A real message the bot must not scare people about

**Who:** Shanthamma, 67, Jayanagar. Receives the real BESCOM bill SMS
(scenario N03) and a real bank OTP message (N01). Forwards both.

1. Bot on N03: *No scam signs found. This looks like a normal BESCOM bill.
   Pay only through the BESCOM website or app, or at the counter.*
2. Bot on N01: *No scam signs found. This is the OTP your bank sent for a
   payment. Don't share it with anyone — not even someone who says they are
   from the bank.*

**Must hold:**
- Never the word "safe". Always one line on what would make it a scam.
- False alarms on real bills and OTPs are the fastest way to lose trust.
  The N scenarios are release blockers.

### J5. The bot is not sure

**Who:** Arjun, 34, Indiranagar. Gets "Hi Papa, this is my new number, save it"
on his father's phone (scenario E02).

1. Bot (verdict `suspicious`): *This could be real or the start of a common
   scam. Call your son on his old number before replying. If this number asks
   for money, it is a scam.*
2. Two days later the same number asks for ₹18,000. Arjun forwards it (E01).
3. Bot: **Likely scam.** Links back to the earlier warning.

**Must hold:**
- `suspicious` always says how to check, not just "be careful".
- The bot may use earlier messages from the same user as context. It keeps
  only the verdicts and types, not the message text (see open question 4 in
  the taxonomy).

### J6. A new kind of scam

**Who:** Anyone. Forwards the FASTag message (scenario X01).

1. Bot: **Likely scam** with general advice (government bodies don't collect
   fees through links sent on WhatsApp).
2. Case lands in `other_scam`. The weekly review sees several FASTag messages
   and adds a `fastag` type with its own advice.

**Must hold:**
- Unknown types still get a verdict; `other_scam` is not "don't know".
- Adding a type is additive: existing ids never change meaning.

---

## What is out of scope for the first bot

- Reading messages automatically. The user always chooses to forward.
- Joining groups. One-to-one chats only.
- Voice notes and live call listening.
- Recovering money. Once money has left, it is treated as lost; the bot only
  prevents the next payment and mentions 1930 in one line.
- Political or general news fact-checking.
