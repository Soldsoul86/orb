# Action Lock for Android (Pixel)

A delayed press for UPI payments. Every payment waits for the buffer you set,
then opens your UPI app (Google Pay, PhonePe, Paytm, BHIM) with the payee and
amount filled in. You enter your UPI PIN there as usual.

Status: **source complete, not yet compiled.** The build environment used to
write it could not reach `dl.google.com` (Android SDK and Google Maven), so the
Kotlin code has not been through the compiler yet. The web part it runs has
been tested (see `../TESTS.md`).

## How it works

```
UPI link tapped anywhere  ─┐
QR scanned in the app     ─┼─► Action Lock holds the payment
UPI ID typed in the app   ─┘      · severity check ("never paid this person")
                                  · countdown / fingerprint, Stop at any time
                                        │ buffer ends
                                        ▼
                         upi://pay intent → your UPI app, pre-filled
                                        │ you enter your PIN
                                        ▼
                         result (txnId, Status) saved in the history
```

- **The lock** (severity, buffers, history, known payees) is the TypeScript
  core in `../src`, bundled into `app/src/main/assets/index.html` and run in a
  WebView. One implementation, the one the tests cover.
- **The Kotlin shell** (`MainActivity.kt`) provides only what a web page can't:
  the `upi://pay` intent filter, opening a UPI app and reading its result, the
  fingerprint prompt (BiometricPrompt), the Google code scanner and file storage.
- UPI links follow NPCI's UPI Linking Specification. The UPI app returns
  `txnId`, `responseCode` and `Status`; the app records that as "reported by the
  UPI app", not as proof of payment.

## Safety rules built in

| Rule | Why |
|---|---|
| The lock never hands a payment back to itself | Avoids loops when it is the default UPI link handler |
| A payment interrupted while the UPI app was open is marked "outcome unknown", never re-sent | Re-sending could pay twice |
| A payment still in its buffer when the app is closed is stopped, not sent on the next launch | Nobody was watching its buffer |
| Rotating the phone or switching dark mode does not restart the page | A restart would stop held payments |
| Shorter buffers apply after 24 h; longer ones immediately | Nobody can talk you into switching the lock off on the spot |
| A payee becomes "known" only after a completed payment | A stopped or failed payment doesn't teach the lock to trust anyone |

## Default buffers

| Payment | Buffer |
|---|---|
| Paid before, under ₹1,000 | None — opens the UPI app at once |
| Paid before, ₹1,000 or more | 2 s |
| New payee | 10 s, with "You've never paid this person before" |
| New payee, ₹10,000 or more | Fingerprint + 30 s |
| New payee, large, late at night | Fingerprint + 120 s |

All of these can be changed in the app under **Your buffers**.

## Build

Needs Node 22.18+, JDK 17 or newer, and the Android SDK (platform 36).

```bash
cd ..                     # docs/ideas/action-lock
npm install
npm run build:android     # writes android/app/src/main/assets/index.html
cd android
./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```

Or open this `android/` folder in Android Studio after `npm run build:android`.

## Install on the Pixel 10a

1. Copy `app-debug.apk` to the phone and open it. Allow installing from that
   source when Android asks.
2. Open **Action Lock** once.
3. Make it the handler for UPI links: tap any `upi://` link (for example in a
   WhatsApp message), choose **Action Lock** and **Always**. To change it later:
   Settings → Apps → Default apps → Opening links.

## Limits

- Payments started **inside** Google Pay or PhonePe (typing a UPI ID or
  scanning there) don't pass through the lock. Scan and pay from Action Lock
  instead; links tapped anywhere else do come through it.
- Some UPI apps may limit link-based payments to personal (non-merchant) UPI
  IDs. Test with the apps you use.
- "Payment during a call from an unknown number" is not detected yet (it needs
  phone-state and call-log permissions).
- No second person yet: the most serious level asks for your fingerprint and a
  longer buffer instead.
