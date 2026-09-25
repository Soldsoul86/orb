# The Sovereign Stack — silicon you own, an OS you rent, and you

> Status: **research, Phase 3 material. Not a contract, not an implementation.**
> Companion to `MOBILE_SENSING.md`, which maps what Android permits.
> This maps what sits *outside* Android's permission, what only you can supply,
> and how the three combine into a phone that is safer and whose egress you
> control. The offline-but-intelligent boundary is `AIRWALL.md`.

---

## 1. The premise, corrected

The instinct behind "the layer below the OS" is right, but on a stock phone the
literal reading fails: **you cannot get below Android on a device you did not
build.** Sensors are behind the HAL, the HAL is behind the framework, and the one
processor that *is* below Android — the modem — is a closed black box you have
strictly less visibility into than the OS itself.

So the move is not *below*. It is **around**:

> Put the capability on hardware whose firmware you wrote, or at a vantage point
> outside the phone where the phone cannot lie to you.

That is the whole strategy, and it is available today at trivial cost.

---

## 2. Five layers, by who can take them away

| Layer | What it is | Who can revoke it | What it buys |
| --- | --- | --- | --- |
| **S — Silicon you own** | An MCU + sensor whose firmware you wrote: ESP32, nRF52, RP2040. No OS, no permission model, no store. | **Nobody.** | Signals that cannot be deprecated, throttled, or policy-gated. Ever. |
| **N — Network you own** | Your router, your DNS resolver, your VPN endpoint. Observes the phone **from outside**. | Nobody (your hardware). | **The phone cannot hide from it.** Ground truth about what actually left the device — independent of anything the OS reports. |
| **B — Below Android, on the phone** | Secure element / StrongBox (Titan M2 on Pixel), Verified Boot, key attestation. | Google (root of the attestation chain). | A verdict on the OS **that survives the OS being compromised**. You cannot program it; you can read it. |
| **M — The modem** | A second processor running its own closed OS, with its own memory and radios. | Not yours at any price. | Nothing. **Listed to be named as a blind spot**, because pretending it isn't there is how people over-claim phone security. |
| **O — The OS, replaced** | GrapheneOS in place of stock Android. | You, by choosing. | Per-app **Network permission** and per-app **Sensors permission** — OS-enforced, not app-cooperative. Play Services, if installed at all, runs fully sandboxed with no special privilege. |

**Layer N is the one people skip and it is the most powerful.** Every claim an
app makes about "we don't send your data anywhere" is an app's claim. Your own
DNS log is a measurement. The phone can lie about what it did; it cannot make a
packet that crossed your router disappear from your router.

**Layer O is the direct answer to "I decide what reaches the internet."** On
stock Android that decision is a hope: you grant `INTERNET` at install and it is
effectively permanent and invisible. GrapheneOS turns it into a switch you hold,
enforced below the app. If the goal is egress control, this is the single
highest-leverage change available, and it costs nothing but a reflash.

---

## 3. Three inputs, and why none is sufficient alone

Every useful safety conclusion comes from combining three sources that fail in
*different* directions:

| Input | Strength | Characteristic failure |
| --- | --- | --- |
| **Silicon** (S/N) | Cannot be revoked, cannot be lied to | **No context.** A beacon knows a device is present. It has no idea whether that is your friend or a stalker. |
| **Android** (per `MOBILE_SENSING.md`) | Rich, labelled, correlated to real life | **Rented.** Permission-gated, quota-throttled, narrowing every release. |
| **You** | The only source of *meaning* | **Sparse, late, and sometimes wrong.** You will not annotate your life continuously. |

The user's own input is the one the architecture most underrates. Under
`Observation.md`, a direct manual entry carries `confidence 1.00` — the highest
in the table, above a GPS fix. A single sentence — *"I'm at the gym 6–7pm, phone
stays in the locker"* — converts a pile of ambiguous sensor readings into a
falsifiable expectation. That is not metadata. It is the highest-confidence
observation in the system, and it costs one line of typing.

> Silicon says **what**. Android says **where and when**. You say **what it was
> supposed to be.** Only the third makes the other two mean anything.

---

## 4. Use cases, mapped

Each row: the question, what each layer contributes, and what the combination
concludes that no single layer could.

### 4.1 — "Did someone touch my phone while I was away?"

| Layer | Contribution |
| --- | --- |
| **S** | A beacon in the bag reports continuous proximity — so you know whether the phone stayed where you left it. |
| **Android** | Screen unlocks, app installed, USB attached, a permission granted, Advanced Protection turned off. All L1/L2, cheap, background-capable. |
| **You** | *"Gym, 6–7pm, phone in locker, not with me."* |
| **Fusion** | An unlock at 18:22 + a package install + a USB attach, **inside a window you declared you were absent**, is the stalkerware-install signature. Any one alone is noise. Together, with a declared absence, it is close to unambiguous. |

This is the highest-value use case in the document and it needs no exotic
capability — only L1 events plus one sentence from you.

### 4.2 — "Is my phone talking to something it shouldn't?"

| Layer | Contribution |
| --- | --- |
| **N** | Your DNS log and router flows: every domain the phone resolved, every endpoint it reached, with timestamps. Independent of the phone. |
| **Android** | Which apps hold `INTERNET`; which were foregrounded when (usage stats). |
| **O** | GrapheneOS: revoke Network permission per app and watch the traffic stop — a controlled experiment you can actually run. |
| **You** | *"I have not opened that app in a week."* |
| **Fusion** | "App X resolved `telemetry.example` at 03:14, while unused for six days" is a finding no on-phone tool can produce honestly, because an on-phone tool asks the OS to report on itself. |

### 4.3 — "Am I being followed?"

| Layer | Contribution |
| --- | --- |
| **S** | A stationary BLE observer at home — a Pi or ESP32 — logging persistent unknown devices, continuously, with no battery limit and no permission. |
| **Android** | The OS's own unknown-tracker alerts (seen as a notification), plus your location trace. |
| **You** | *"This is my normal commute."* |
| **Fusion** | A device seen **at home, at work, and on the route between** is the pattern. The home observer is what makes it possible: the phone only sees what is near the phone, so it cannot distinguish "follows me" from "lives near my office". Two vantage points can. |

### 4.4 — "Did something happen to my body?"

| Layer | Contribution |
| --- | --- |
| **S** | A chest strap read **directly over BLE GATT** (`0x180D` / `0x2A37`) — no Google module, no vendor app, no account. |
| **Android** | IMU for motion and impact; activity transitions for coarse context. |
| **You** | Your own baseline, accumulated over months, plus occasional annotation. |
| **Fusion** | "Heart rate 40% above *your* resting baseline, no motion for four minutes, at an unusual location" means something. "Heart rate 110" means nothing. |

### 4.5 — "Is this network safe?"

| Layer | Contribution |
| --- | --- |
| **N** | A VPN endpoint **you** run at home: you control both ends, so you are not trusting a VPN company's promise, and hostile Wi-Fi sees only a tunnel. |
| **Android** | Cell ID / LAC / TAC changes, network-type downgrades, Wi-Fi identity; the OS's own network-security warnings as notifications. |
| **You** | *"I'm at a café I've never used before."* |
| **Fusion** | Weak evidence made useful by context. An implausible tower change is noise in a city; the same change while you are stationary in a declared location is worth recording at higher weight. |

### 4.6 — "Is my phone still the phone I think it is?"

| Layer | Contribution |
| --- | --- |
| **B** | Keystore key attestation, verified offline: `deviceLocked`, `verifiedBootState`, from a secure element that survives OS compromise. |
| **Android** | Build fingerprint, security patch level, installed package set. |
| **You** | *"I have never unlocked the bootloader."* |
| **Fusion** | A change in the attested boot state that you did not cause is one of the few signals that still means something **after** the OS is owned — because the answer comes from a chip the OS cannot forge. |

---

## 5. The egress decision point

"I decide what reaches the internet" needs a place where the decision is
physically made. There are exactly three, and they are complementary:

| Where | Mechanism | Strength |
| --- | --- | --- |
| **In the app** | Orb never opens a socket (`AIRWALL.md`) | Strongest for Orb itself; irrelevant to every other app |
| **In the OS** | GrapheneOS per-app Network permission | Covers every app; enforced below the app; requires reflashing |
| **At the edge** | Your router / DNS / firewall | Covers every app **and** the OS itself; cannot be bypassed by anything on the phone; only works at home |

Use all three. They fail independently, which is the point. And note the
asymmetry worth designing around: the OS control is *preventive* but only
GrapheneOS gives it to you; the network control is *observational* and works on
any phone today, including one you have not reflashed. **Start at the edge** —
it needs no change to the phone at all.

Whatever the mechanism, `SECURITY.md` §7 and Art. VIII §32 already fix the
obligation: what leaves is minimized, explicitly authorized, and **the departure
is itself recorded as history**. A disclosure you cannot later audit did not
satisfy the law even if you approved it at the time.

---

## 6. What this changes about the plan

1. **Cheapest sovereign win first, and it is not on the phone.** A DNS log on
   your own router gives you Layer N today, with no code, no APK, and no
   permission. It is the only vantage point the phone cannot lie to.
2. **The human-declaration sensor is missing and should not be.** A way to
   record *"I expect to be away from my phone from 6 to 7"* is a Sensor emitting
   `confidence 1.00` observations, and it is what converts §4.1 from noise into a
   finding. It needs no Android capability at all, which is precisely why it was
   easy to overlook.
3. **GrapheneOS is the answer to the egress question**, and the honest framing is
   that stock Android cannot answer it: per-app network control does not exist
   there. Worth deciding deliberately rather than defaulting.
4. **Name the modem as a blind spot in any threat model** rather than implying
   the phone is fully observable.
5. **Every S-layer device is a peer with its own lane** (Art. IV §14–15). A
   chest strap or a home observer is not an accessory to the phone — it is a
   device writing its own append-only lane into the same history. That is what
   makes §4.3's two-vantage-point argument work architecturally rather than as a
   hack.

---

## 7. Sources

- [GrapheneOS features](https://grapheneos.org/features) and [usage guide](https://grapheneos.org/usage) — per-app Network and Sensors permissions, sandboxed Google Play with no special privilege
- [Heart Rate Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html) (Bluetooth SIG) — `0x180D` / `0x2A37`
- [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) and [Key and ID attestation](https://source.android.com/docs/security/features/keystore/attestation) — `RootOfTrust`, `deviceLocked`, `verifiedBootState`
- `MOBILE_SENSING.md` for the Android layer in detail, and its §9 for the grant ladder this document's §2 extends downward
