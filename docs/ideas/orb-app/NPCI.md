# NPCI rules the pay guard builds on

Researched 2026-09-24. What UPI itself guarantees, and how Orb's pay guard uses
it to stop fraud before money leaves. Orb only reads the phone's screen; it
never talks to NPCI, a bank or a UPI app.

## What UPI guarantees

| Rule | Source | What the guard does with it |
|---|---|---|
| Every UPI app must capture the PIN in NPCI's **common library** (a separate, standard screen; the PIN never touches the app) | [UPI Procedural Guidelines](https://yashada.org/yashada_2019/pdfs/e_library_cit/edpri_UPI_Procedural_Guidelines.pdf); [CL specification](https://github.com/librefin-in/cl-specification) | The PIN screen ("Pay ₹3000.00", "To CHETHAN GOWDA P S", "Enter your PIN", keys 0–9) is the same in Google Pay, PhonePe, Paytm, BHIM, CRED and bank apps. The guard reads it in every listed UPI app and covers the keypad when the payment is unusual. It is the last step before money leaves. |
| Apps must show only the **beneficiary's bank-registered name** ("Banking name", from the Validate Address API) before paying; no nicknames or names from QR codes; users can't edit it. Deadline 30 June 2025 | NPCI [OC-101A/2025-26](https://www.npci.org.in/uploads/UPI_OC_No_101_A_FY_2025_26_Strengthening_beneficiary_name_verification_and_display_during_UPI_transactions_eb7bd7ed72.pdf); [Business Standard](https://www.business-standard.com/finance/personal-finance/no-more-scams-upi-apps-to-now-show-recipients-bank-registered-names-only-125052600445_1.html) | The guard matches that name against the names in your bank SMS history ("Mr M Muniraja"). Because the name comes from the bank, a scammer can't dress it up as someone you know. |
| **P2P collect requests** ("X has requested ₹…") stopped from 1 Oct 2025; merchant collect requests continue | NPCI circular of 29 July 2025 ([MediaNama](https://www.medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1-what-it-means/), [BusinessToday](https://www.businesstoday.in/personal-finance/banking/story/npci-to-tighten-upi-rules-peer-to-peer-collect-feature-to-end-in-october-489244-2025-08-13)) | Any payment that starts from a request (now from "merchants") gets a 30 s pause and needs your fingerprint, with "you never need your PIN to receive money". |
| **Biometric UPI**: fingerprint/face instead of the PIN, up to ₹5,000, optional (circular 7 Oct 2025; BHIM from Mar 2026) | [BusinessToday](https://www.businesstoday.in/personal-finance/news/story/no-more-pins-upi-to-get-face-and-fingerprint-authentication-for-faster-safer-online-payments-497815-2025-10-11) | Gap: payments approved by biometrics may skip the PIN screen. The guard still covers the apps' own Pay button in PhonePe and Google Pay; other apps are not covered for those payments yet. |
| DoT's **Financial Fraud Risk Indicator** flags phone numbers as medium / high / very high risk and shares it with UPI apps; PhonePe blocks "very high" | [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2130249&reg=48&lang=2); [MediaNama](https://www.medianama.com/2025/05/223-dot-financial-fraud-risk-indicator-upi/) | Not available to Orb (shared only with banks and UPI apps). Complementary: FRI knows bad numbers across India; Orb knows what is unusual for you. |
| **After a fraud**: call 1930 within the first hour, report on cybercrime.gov.in, tell the bank within 3 days (RBI zero-liability); disputes via the app or [UPI Help](https://www.upihelp.npci.org.in/) (UDIR) | [Moneyview guide](https://moneyview.in/upi/upi-fraud-complaints-in-india); [UPI Help](https://www.upihelp.npci.org.in/) | Next: when you tap "I was scammed" in Orb, show these steps with the transaction's UTR from the bank SMS, and the clock since it left. |

## Signals the guard uses (src/orb/guard.ts, GuardRules.kt)

- Someone you've never paid (by the bank-registered name, or the UPI ID on the PIN screen).
- More than you've ever paid them.
- A large amount for you (3× your usual large payment).
- Your quiet hours.
- **On a call** (phone or WhatsApp) during an unusual payment: scammers keep people on the line. Read from the phone's audio mode; no call details are read.
- **Started from a request** someone sent.

A usual payment to someone you know passes silently, even on a call.

## Not possible from the phone

- Stopping a payment after the PIN: once submitted, UPI settles in seconds.
- Checking a UPI ID against fraud lists (FRI, bank mule lists): not public.
