# Orb — the consolidated runtime

The first build whose purpose is to be **useful** rather than to be measured.

Pass 1 and pass 2 were instruments. They existed to answer P1–P22 and they did
(`docs/DEVICE_LOOP.md`): the boot path, the service types, the gap accounting,
the package route, P20. This app starts from what they established and pays the
debt they left.

```
ANDROID_HOME=/path/to/sdk ./build.sh
# -> build/app/app.apk   package dev.orb.app
```

---

## What is different from pass 2, and why

### 1. The identity is the install, not the handset — AD-8

`Install.java.in` mints **96 random bits at first run** and stores them in
app-private storage. That identity is both the `device` on every envelope and
the name of the lane.

Pass 1 opened lane `"pixel"` as a literal with `device = Build.MODEL/Build.DEVICE`.
Four packages on one phone therefore held **four chains under one lane name and
one device identity** — which every layer above assumes cannot happen (Art. IV
§14, `SECURITY.md` §4, `custody.ts` counting holders by `event.device`,
`Encryption.md` inv. 7). Nothing misbehaved on the phone, because a journal never
sees another app's store; it broke the moment two exports met.

**Minted rather than derived, deliberately.** An identity taken from `ANDROID_ID`,
a build fingerprint or a serial would be identical for two installs on one phone —
the defect itself — and would also be a stable cross-app identifier for a person,
which `MOBILE_SENSING.md` says not to build.

**There is no `ORB_LANE` build flag.** Pass 2 had one, and a flag is still the
lane's identity living outside the install that writes it. It cannot be set
wrong, forgotten, or duplicated by rebuilding if it does not exist.

### 2. The envelope no longer names the phone

The hardware fields — model, device, build, patch — moved into the
`orb.process.start` **payload**. A witness holding envelopes and no payloads
(`WITNESSES.md` W2) now learns *that* someone wrote, and nothing about which
handset. Context belongs in events; identity belongs in the envelope.

### 3. The export names its own source

`orb.export` carries `package`, which no envelope can supply. The precedent was
already in this repository: `dev.orb.probeg`'s capability report opens with
`package: dev.orb.probeg` — the artifact that needed it least already did it
(§7b30). The install identity is *not* repeated, because it is on every envelope
already (Art. IX §33).

---

## The share sensor

`ShareActivity.java.in`, declared in `docs/SENSOR_SHARE.md` **before** it was
written — the test AD-7 failed by being decided in a manifest at build time.

**No permissions. None at all.** Receiving a share is not a `Capability`:
`Capability.md` §8's *reads are capabilities too* is about Orb reaching out and
taking, and a share is the world reaching in.

**A share hands over a reference, not content.** Nothing here opens a stream or
fetches a link. Resolution is a separate, declared Capability — and fetching a
shared URL is egress at tier *Act (irreversible)* under DR-9, because the host
learns you fetched and you cannot un-disclose it. **Sharing a link is not
authorization to visit it.**

What is recorded: the declared `mimeType` (never sniffed — sniffing is
interpreting, which `Sensor.md` §1 forbids), the `referrer` or `unknown` (never
omitted, so *we do not know* and *nowhere* stay different facts), the references,
`itemCount`, and `resolved: false` with `absenceReason: unfetched`.

---

## What is deliberately absent

**The grants watch and the package scan.** They work, they are pass 2 B's, and
porting them in the same change as a new identity scheme would make a failure in
either indistinguishable from a failure in the other. Pass 2 B keeps running
until this replaces it — the same rule that let pass 2 be built while pass 1 ran
(`DEVICE_LOOP.md` §7 R4).

**Resolution of shared references.** Declared in `SENSOR_SHARE.md` §3 with its
tiers; not built. The sensor records pointers, which is complete and honest on
its own.

---

## The signing key

`keys/app.keystore`, gitignored, and **the only key that can upgrade this
install**. A signing key in version control is a worse failure than the one it
prevents, so it cannot live here — keep a copy off the machine that built it.
§7b8 is what losing one costs: an install that can never be upgraded, only
removed, and its journal goes with it.
