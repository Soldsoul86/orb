# Scam Checker — Scam Taxonomy and Decision Schema

Status: draft for review. This is a product idea document, not part of the Orb
architecture. Nothing in MASTER.md or CONSTITUTION.md changes because of it.

## Product in one line

People forward a suspicious message, screenshot, link or call summary to a
WhatsApp number. A decision model (Jev today) classifies it against the list
below; an LLM explains the verdict in the user's language.

Launch: Bangalore (English, Kannada, Hindi) → hometowns of Bangalore's migrant
workforce (Tamil, Telugu, Marathi, Bengali, Malayalam) → B2B API for banks, UPI
apps, telcos and insurers.

---

## 1. Scam taxonomy

Every type has a stable id. The ids are the answer options for the `scam_type`
question in section 2, so they must not be renamed once in production — add new
ids instead and retire old ones.

### A. Impersonating authority

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `digital_arrest` | "Digital arrest" | Caller claims to be CBI, ED, police, customs, RBI or a judge. Victim is told they are under investigation, kept on video call for hours, and made to transfer money to a "verification" or "RBI safe" account. | Video call, uniforms or fake courtrooms, "don't tell anyone", money-laundering or drug-parcel accusation, Aadhaar "misused" |
| `courier_parcel` | Courier / customs parcel | "Your FedEx/DHL parcel with drugs/passports was seized." Usually the entry point into `digital_arrest`, or a small "customs fee" demand. | Courier brand name, parcel id, "press 1 to talk to executive", customs duty link |
| `telecom_disconnect` | TRAI / telecom disconnection | "Your number will be disconnected in 2 hours due to illegal activity. Press 9." | TRAI/DoT named, IVR "press 9", disconnection deadline |
| `utility_bill` | Electricity / gas bill | "Your power will be cut tonight at 9:30 pm, bill not updated. Call officer 98xxxxxxx." | Disconnection tonight, personal mobile number of an "officer", no consumer number |
| `traffic_challan` | Fake e-challan | "Pay your pending challan" with a lookalike link or an APK. | Link not on `echallan.parivahan.gov.in`, APK attachment |
| `tax_refund` | Income tax / GST refund | "Your refund of ₹15,490 is approved, verify account." | Refund amount, link asking for bank details or card |

### B. Banking and payments

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `kyc_update` | KYC / PAN / Aadhaar update | "Your account will be blocked today, update KYC." Link to phishing page or APK. | Bank name, "blocked", "today", shortened link |
| `otp_sharing` | OTP request | Anyone asking for an OTP, for any reason. | "Share the OTP you just received", "code sent by mistake" |
| `upi_collect` | Receive-money trick | "Scan this QR / approve this request to receive ₹5,000." Scanning or entering PIN sends money instead. | QR code to "receive", UPI collect request, "enter PIN to get money" |
| `wrong_transfer` | "Sent by mistake" | Fake credit SMS, then "I sent ₹10,000 by mistake, please return." | Fake bank SMS from a personal number, request to send back |
| `reward_points` | Card reward points | "Your 7,850 reward points expire today, redeem now." | Points expiring, link or APK |
| `malicious_apk` | Malicious app file | Any `.apk` sent over WhatsApp or SMS — "wedding invitation", "bank rewards", "PM Kisan". Reads SMS and steals OTPs. | File ending `.apk` |
| `remote_access` | Screen-sharing app | "Install AnyDesk / TeamViewer / QuickSupport so our executive can help." | Remote-access app named, usually after a fake support call |
| `sim_swap` | SIM swap / eSIM | "Upgrade to 5G / eSIM, send this SMS to 121." Scammer takes over the number. | Instructions to send a specific SMS, 5G/eSIM upgrade |

### C. Easy money

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `task_job` | Task / part-time job | "Earn ₹3,000/day liking YouTube videos or rating hotels." First small payouts are real; then "prepaid tasks" need deposits that are never returned. | Telegram group, likes/reviews/ratings, daily earning, "merchant task" |
| `fake_job_offer` | Fake job / overseas job | Offer letter from a big company or a visa job abroad, then a registration, training or visa fee. | Fee before joining, Gmail/Yahoo sender, overseas visa |
| `investment_trading` | Stock / trading tips | WhatsApp "stock learning" group, fake "institutional account" app, IPO allotment promises, fake SEBI registration. | Guaranteed returns, "institutional account", app not from a registered broker |
| `crypto` | Crypto scheme | Doubling schemes, fake exchanges, mining apps. | Guaranteed returns in crypto, unknown exchange |
| `lottery_prize` | Lottery / lucky draw | "You won ₹25 lakh in KBC / a car in a lucky draw — pay tax to claim." | Prize you didn't enter, fee to claim |

### D. Loans

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `loan_app` | Illegal instant-loan app | Easy loan, then huge charges and harassment using the victim's contacts and morphed photos. | App not from an RBI-regulated lender, contact access, threats |
| `loan_advance_fee` | Pre-approved loan fee | "Your ₹5 lakh loan is approved, pay ₹2,999 processing fee." | Fee before disbursal |

### E. Impersonating people you know

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `relative_impersonation` | "Hi Papa, new number" | Message or AI-cloned voice call from a "son", "friend" or "boss" in an emergency needing money now. | New number, urgency, can't talk on call, asks for UPI transfer or gift cards |
| `sextortion` | Video-call blackmail | Unknown video call records the victim, then threatens to share it unless paid. Often followed by a fake "police officer". | Unknown video call, threat to leak, fake police follow-up |
| `romance_matrimonial` | Romance / matrimony | Online match (often "NRI" or "doctor abroad") sends a "gift" stuck at customs, or needs money. | Met online, never met in person, gift or customs fee |
| `army_marketplace` | "Army officer" on OLX | Buyer or seller claims to be in the army, sends a QR code or asks for advance. | Army identity card photo, QR code, advance before seeing item |

### F. Shopping and bookings

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `fake_customer_care` | Fake helpline | Victim searches for a company's helpline and finds a scammer's number, who then asks for remote access or UPI. | Number found via search, personal mobile, remote-access or refund request |
| `fake_shopping` | Fake store / offer | Too-good-to-be-true sale pages, fake brand sites, Instagram shops that never deliver. | 80–90% off, lookalike domain, prepaid only |
| `fake_booking` | Fake booking | Fake hotel, temple darshan (e.g. Tirupati), pilgrimage helicopter, bus or event tickets. | Payment to personal UPI, domain not the official one |
| `rental_advance` | Fake landlord / token advance | Listing for a flat below market rent; "landlord" abroad asks for token advance before a visit. | Can't show the flat, asks for advance, owner "out of station" |

### G. Fake government schemes and giveaways

This is the part of fact-checking the product covers (see the decision on scam
checker vs fact checker: non-political, verifiable, money at stake).

| id | Name | How it works | Typical signals |
|---|---|---|---|
| `fake_govt_scheme` | Fake government scheme | "PM Kisan ₹6,000 / free laptop / free ration / free solar — register here." | Scheme name + registration link not on a `.gov.in` domain, fee to register |
| `fake_giveaway` | Fake brand giveaway | "Jio free 3-month recharge", "Tata anniversary gift", survey then "forward to 20 groups". | Free gift, forward-to-friends step, lookalike domain |
| `fake_charity` | Fake donation | Disaster relief, sick child, temple donation to a personal UPI ID. | Emotional appeal, personal UPI, no registered trust |

### H. Anything else

| id | Meaning |
|---|---|
| `insurance_policy` | Fake policy bonus, lapsed-policy refund, "IRDA officer". |
| `other_scam` | Clearly a scam but none of the types above. Reviewed weekly to find new types. |
| `none` | No scam type applies. |

---

## 2. Decision schema

One message = one decision call with the questions below. Question kinds follow
the three types Jev offers: **Choice** (pick one from a fixed list), **Score**
(a number on a rubric) and **Probability** (yes/no probability). Choice and
Score answers come with a 0–1 confidence.

The schema is written provider-neutral on purpose: the checker talks to a
`DecisionProvider` interface, and Jev is one implementation. Another model must
be able to answer the same questions.

| # | Question id | Kind | Answer options | Why we ask |
|---|---|---|---|---|
| 1 | `is_scam` | Probability | 0–1 | Main verdict |
| 2 | `scam_type` | Choice | ids from section 1 | Picks the explanation and advice |
| 3 | `victim_stage` | Choice | `first_contact`, `engaged`, `money_or_info_requested`, `money_or_info_already_given` | `already_given` switches to emergency advice |
| 4 | `impersonated_entity` | Choice | `police_or_agency`, `bank`, `telecom`, `courier`, `utility`, `government`, `employer`, `relative_or_friend`, `brand_or_shop`, `none` | Tells the user who is being faked |
| 5 | `asks_for_otp_or_pin` | Probability | 0–1 | Red flag on its own |
| 6 | `asks_for_payment` | Probability | 0–1 | Red flag on its own |
| 7 | `asks_to_install_app` | Probability | 0–1 | APK or remote-access app |
| 8 | `pressure_level` | Score | 0 = none … 4 = threats or deadlines within hours | Urgency is the strongest scam signal |
| 9 | `language` | Choice | `en`, `hi`, `kn`, `ta`, `te`, `mr`, `bn`, `ml`, `hinglish`, `other` | Language for the explanation |

Link checks are done by ordinary code, not the model: domain age, lookalike of a
known brand, official `.gov.in` / bank domain, known-bad list. Their result is
passed into the decision call as part of the input.

---

## 3. Verdict policy

Thresholds are placeholders until measured on real Indian scam samples.

| Condition | Verdict shown | What happens |
|---|---|---|
| `victim_stage = money_or_info_already_given` | **Act now** | Immediately: call **1930**, report at **cybercrime.gov.in**, call your bank to freeze the account. Shown before any explanation. |
| `is_scam ≥ 0.85` and `scam_type` confidence ≥ 0.7 | **Likely scam** | LLM explains why, in the user's language, with the advice for that type |
| `is_scam` between 0.4 and 0.85, or low confidence on `scam_type` | **Suspicious** | Second check by an LLM; advice: don't pay, don't share OTP, verify through the official number |
| `is_scam < 0.4`, `asks_for_otp_or_pin` < 0.3 and `asks_to_install_app` < 0.3 | **No scam signs found** | Never say "safe". Always add: "If anyone asks for OTP, PIN or money, stop." |

Rules that override the model:

- Any `.apk` file → at least **Suspicious**.
- Any request for OTP or UPI PIN → at least **Suspicious**.
- A verdict of "safe" is never shown.
- A payment request on its own does not block **No scam signs found** — friends split bills over UPI (scenario N05).

---

## 4. Advice lines (one per group, localised by the LLM)

- **Authority:** Police, CBI and courts never call on video or ask for money. There is no such thing as "digital arrest".
- **Banking:** Banks never ask for OTP, PIN or app installs. Use the number on the back of your card.
- **Easy money:** If you have to pay to earn, it is a scam.
- **Loans:** Check the lender is RBI-regulated. Never pay a fee before a loan is given.
- **People you know:** Call them back on their old number before sending anything.
- **Shopping and bookings:** Book only on official websites. Never pay a personal UPI ID.
- **Government schemes:** Real schemes are only on `.gov.in` sites and never charge to register.

Reporting: **1930** (national cyber-crime helpline), **cybercrime.gov.in**, and
**Chakshu** on the Sanchar Saathi portal for fraud calls and messages.

---

## 5. Open questions

1. How accurate is Jev on Hinglish and regional-language messages? Measure before committing.
2. Where do labelled samples come from? Start with public examples and user-confirmed outcomes.
3. What is the WhatsApp Business API cost per user-initiated conversation at scale?
4. What must be stored under the DPDP Act, and for how long? Default: store the decision and type, not the message.
