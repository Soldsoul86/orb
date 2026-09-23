# Scam Checker — Research

Status: research notes, September 2026. Figures are as reported by the sources
listed at the end; they are reported complaints, so real losses are higher.

---

## 1. The problem is large and growing

| Measure | Figure | Source |
|---|---|---|
| Money lost to cyber fraud in India, 2025 | ₹22,495 crore | ThePrint, from I4C data |
| Cyber fraud cases reported, 2025 | 28.15 lakh (up ~24% from 22.68 lakh in 2024) | ThePrint, The420 |
| Senior citizens filing fraud complaints, 2025 | 1,03,488 | Govt reply, via IndiasNews |
| Money saved by fast reporting through 1930 / CFCFRMS, since launch | ₹7,130 crore across 23 lakh complaints | MHA Lok Sabha reply |
| Victims who don't report UPI fraud at all | 51% | LocalCircles |

**Reading:** losses are flat year on year (₹22,845 crore in 2024) but cases
are up 24% — more people are being hit, for smaller amounts each. Recovery is
small next to losses (₹7,130 crore saved in total since launch, against
₹22,000+ crore lost each year), so the product is built on prevention only.

## 2. Bangalore is the right launch city

| Measure | Figure | Source |
|---|---|---|
| Bengaluru losses, Jan–Nov 2025 | ₹1,543 crore — about ₹4.8 crore a day | The420 |
| Bengaluru cybercrime cases, 2022 – June 2026 | 59,951 cases, ₹5,059 crore lost | Deccan Herald |
| Share returned to victims | under 10% | The420 |
| Trading-investment fraud cases | 183 (2022) → 2,648 (2025) | Deccan Herald |
| Part-time job / task / review fraud cases | 228 (2022) → 2,158 (2025) | Deccan Herald |
| Digital arrest, Bengaluru | 480 cases, ₹42 crore; single cases of ₹11 crore and ₹31.8 crore | The420, Tribune, Bengaluru Live |

**Reading:** the city's tech-savvy, high-income population is not protected by
being tech-savvy. Bengaluru's own police say investment and task frauds have
overtaken OTP frauds as the biggest category.

## 3. Where the money actually goes

India, 2025 (ThePrint, PW Only IAS, from I4C):

| Scam | Share of money lost | Share of cases |
|---|---|---|
| Investment fraud (fake trading, stock tips, crypto, Ponzi) | **76%** | 35% |
| Digital arrest | 9% | 6% |
| Sextortion | 4% | **19%** |
| Everything else (KYC, OTP, UPI, jobs, shopping, loans…) | ~11% | ~40% |

**This changed the scenarios.** The first draft had 2 investment cases out of
39 scams. The money is in investment fraud, so the scenario set now follows the
whole investment funnel (C07–C12) and adds the second stage of sextortion (E07).

### How an investment scam runs (Bengaluru police pattern)

1. A Facebook or Instagram ad for free stock tips.
2. A WhatsApp group of 8–10 real people; the other members are scammers posting
   fake profit screenshots.
3. An "assistant" sends an APK for an "institutional" trading app.
4. A small first withdrawal works, to build trust.
5. Larger deposits for "block trades" or "IPO allotment".
6. When the victim tries to withdraw, they are asked for "tax" or "SEBI fees".

Each step is a scenario (C07–C11). The earlier the checker catches it, the less
is lost.

---

## 4. Competition — honestly

A basic "paste a message, get a verdict" checker already exists many times over:

| Product | What it does |
|---|---|
| RealCheck, ScamDekho, ScamRadar, BharatSecure, Digital Suraksha | Free web checkers for messages, links, UPI IDs; several Indian languages |
| SachAI | WhatsApp fact-checker bot |
| Airtel Fraud Detection | Blocks known fraud links at network level for all Airtel users, across SMS and WhatsApp. Airtel reports 68.7% lower fraud losses among its users |
| Truecaller | Caller ID and spam labels, including on WhatsApp |
| Sanchar Saathi (Chakshu), 1930, cybercrime.gov.in | Government reporting channels |

**Consequence:** a generic checker is not a business. Airtel already catches
known bad *links* for free, and several apps already answer "is this a scam?".
The product has to win on what these don't do.

## 5. What would make this worth building

1. **Follow a situation, not a message.** Investment and task scams unfold over
   weeks. The checker should remember "you're in a stock-tips group" and warn
   at the APK step and the "tax to withdraw" step. Existing checkers look at one
   message at a time. Jev's low cost per decision makes checking every message
   in an ongoing situation affordable.
2. **The family path.** Victims of investment scams believe in them; their
   children are the ones who doubt (scenario C12). No existing checker is built
   around "my dad is in this group, help me convince him". This is also the
   distribution plan.
3. **Stop the next payment.** Once money has left, it is effectively lost —
   recovery is not part of the product (practitioner view, and consistent with
   under 10% returned in Bengaluru). But these scams take money in rounds: the
   ₹31.8 crore Bengaluru digital-arrest case was 187 transactions over six
   months, and investment scams always end with a "tax to withdraw" demand and
   then a "recovery agent". Every one of those is a prevention point.
   `stop_now` exists to stop the next payment, not to recover the last one.
4. **Kannada first.** Of the checkers whose languages are published (RealCheck:
   English, Hindi, Marathi, Telugu, Tamil, Bengali; ScamRadar: Hindi, English),
   none lists Kannada. Not yet checked for the others.

Items 1–3 are what the product is — all three act before money leaves. Detecting a single message is table stakes.

## 6. What could still make this fail

| Risk | Why it matters | What would tell us early |
|---|---|---|
| People who are being scammed don't doubt | A checker only helps people who ask | Share of `stop_now` cases sent by a family member vs the victim |
| Airtel / Jio / Google build it into the phone | Free, built-in, no forwarding needed | Watch their launches; our edge is situations and family, not link-blocking |
| Nobody pays | Consumers won't; banks might | One bank or UPI app pilot before month 9 |
| Jev is weak on Kannada and Hinglish | Wrong verdicts lose trust fast | Run scenarios.yaml against Jev before building the bot |
| Liability for a missed scam | A "no scam signs" verdict followed by a loss | Never say "safe"; always give the verify step |

---

## 7. Next research steps

1. Run `scenarios.yaml` against Jev and one LLM. Record accuracy by scam type
   and by language.
2. Talk to 10 people in Bangalore who lost money or whose parent did. Ask: at
   which step would a warning have stopped you? Would you have forwarded the
   message to anyone?
3. Talk to one bank fraud team about what they would pay for.

---

## Sources

- [Indians lost Rs 22,495 crore to cyber fraud in 2025, investment scams account for 75% — ThePrint](https://theprint.in/india/cybercrime-saw-24-spike-in-2025-indians-lost-rs-22495-crore-mainly-in-investment-scams/2859930/)
- [Cybercrime in India 2025: investment frauds account for 76% of losses — PW Only IAS](https://pwonlyias.com/current-affairs/cybercrime-in-india-2025/)
- [Cybercrime jumps 24% in 2025 — The420](https://the420.in/india-cybercrime-24pct-rise-22495cr-loss/)
- [MHA Lok Sabha reply on CFCFRMS](https://www.mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/LS02122025/432.pdf)
- [Senior citizens and women filed complaints worth Rs 7,769 crore in 2025 — IndiasNews](https://www.indiasnews.net/news/279223790/over-1-lakh-senior-citizens-463-lakh-women-lodged-financial-cyber-fraud-complaints-amounting-to-rs-7769-crore-in-2025-govt)
- [Bengaluru loses ₹4.83 crore every day — The420](https://the420.in/bengaluru-cyber-fraud-losses-1543-crore-daily-4-83-crore-2025/)
- [Bengaluru's cyber-crime losses hit ₹4,341 crore in 45 months — The420](https://the420.in/bengaluru-cybercrime-crisis-losses-investment-scams-upi-fraud-data-2025/)
- [Investment frauds surge in Bengaluru — Deccan Herald](https://www.deccanherald.com/india/karnataka/bengaluru/investment-frauds-surge-in-bengaluru-4096890)
- [How a Bengaluru techie fell for a fake trading app — Deccan Herald](https://www.deccanherald.com/india/karnataka/bengaluru/rs-175-lakh-became-rs-975-lakh-how-bengaluru-techie-fell-for-a-fake-trading-app-4154664)
- [Bengaluru techie loses Rs 11 crore to digital arrest scam — Tribune](https://www.tribuneindia.com/news/india/bengaluru-techie-loses-rs-11-crore-to-digital-arrest-scam)
- [Bengaluru woman loses ₹24 crore in digital arrest case — Bengaluru Live](https://thebengalurulive.com/bengaluru-woman-loses-%E2%82%B924-crore-in-karnatakas-biggest-digital-arrest-cyber-fraud-case/)
- [LocalCircles financial fraud survey](https://www.localcircles.com/a/press/page/financial-fraud-survey-india)
- [Airtel spam and scam prevention with AI — GSMA](https://www.gsma.com/solutions-and-impact/technologies/security/scams/general/bharti-airtel-spam-and-scam-prevention-with-ai/)
- [Airtel AI algorithm stopped 30,000 frauds per day — ThePrint](https://theprint.in/india/airtel-ai-algorithm-to-protect-customers-from-scams/2856991/)
- [RealCheck](https://realcheck.in/), [ScamDekho](https://scamdekho.in/scam-message-checker), [ScamRadar](https://www.scamradar.in/), [BharatSecure](https://bharatsecure.app/), [Digital Suraksha](https://digitalsuraksha.org/scam-checker), [SachAI](https://sachai.chat/)
