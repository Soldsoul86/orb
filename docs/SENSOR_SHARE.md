# Sensor Declaration — Share to Orb

> Status: **declaration, 2026-09-28; built and imported as Observations,
> 2026-09-29.** The phone records a share (`apps/pixel/orb`, `Shares.java.in`), and
> the desktop turns it into an Observation (`packages/device-watch`, §4a). Written
> first so the posture meets Orb's own rules before a line of code existed — which
> is the test `AD-7` failed by being decided in a manifest at build time.
>
> Contracts it stands on, **all Accepted**: `Sensor`, `Observation`, `Event`,
> `Evidence`, `Entity`, `Capability`, `Policy`, `Action`.

The user selects content in any app, taps **Share**, and picks Orb. Android
delivers it. That is the whole sensor.

---

## 1. Why this one first

Every other mobile sensor infers its mandate. This one is **handed** it.

| | Share | Notification listener |
| --- | --- | --- |
| Consent | a deliberate act, per item | one grant, then continuous |
| Third-party data | only what the user chose to hand over | everything that arrives, forever |
| Permission needed | **none** | the most closely policed one Android has |
| What Orb reaches for | nothing | every notification on the device |

The last row is the architectural one. `Capability.md` §8 says *reads are
capabilities too … pretending otherwise is how read access becomes invisible* —
and it says that about Orb **reaching out and taking**. A share is the opposite
direction: the world reaches in. Which produces the first useful result of writing
this down:

> **Receiving a share is not a Capability.** Orb affects nothing and reaches for
> nothing. It is a `Sensor` with no Capability behind it — the only one that will
> ever be true of.

Contrast `AD-7`: enumerating 484 packages *is* a Capability at tier `Observe`,
because Orb reached out and read a list nobody handed it.

---

## 2. Registration (`Sensor.md` §2.1)

| Field | Value |
| --- | --- |
| `id` | `orb.sensor.share` |
| Source identity | `android.intent.action.SEND` / `SEND_MULTIPLE`, delivered to Orb's share target |
| Signal class | one user-initiated hand-off of content, with its declared MIME type |
| Schedule | **trigger only.** The runtime does not poll this; Android delivers. `Sensor.md` §2.2 — *Sensors do not wake randomly* — is satisfied trivially, because the trigger is a person |
| Emits | one `Observation` per hand-off, `because: user.shared` |

`because: user.shared` is deliberately the same shape as pass 2's
`because: operator.scan`. The projections already read that field; this sensor
adds a value, not a mechanism.

---

> **§3 is falsified as written — measured 2026-09-28** (`DEVICE_LOOP.md` §7b33).
> The clean split below — *record the reference now, resolve it later under a
> declared Capability* — **is not available on Android.** The URI grant is scoped
> to the receiving activity's lifetime, and a read attempted 9.5 s after the share
> is refused outright: *"Permission Denial: opening provider … that is not
> exported."* The **boundary** §3 draws is right; the **timing** it assumes is not.
>
> **Ruled 2026-09-28: resolve during the share.** The Capability is declared where
> it must happen rather than where it would be tidiest, and the share is itself
> the authorization event — a person deliberately handing something over is
> stronger consent than a prompt Orb could invent afterwards. §3's **boundary**
> survives intact: only a `content://` reference the sender granted is opened, and
> **a URL is still never fetched**, because that is egress at *Act (irreversible)*
> under DR-9 and a different act from reading what was handed over.
>
> Also measured: **a reference is not a content identity.** The same photograph
> shared twice produced two references, because Photos wraps a stable MediaStore
> id in a per-share token. Anything deriving an identity from a reference must use
> the embedded id and not the wrapper (`../contracts/Event.md` inv. 9).

## 3. The line that makes this safe: a share is a **reference**, not content

Android hands over a `content://` URI, a URL, or text — **a pointer**. Turning
that pointer into bytes is a second, separate act, and it is where the Capability
boundary actually falls:

```
user taps Share
      ↓
Observation recorded          ← no Capability. Nothing was reached for.
   (type, referrer, time, reference)
      ↓
─────── boundary ───────
      ↓
resolving the reference       ← a Capability, declared and tiered
```

Three resolutions, three different declarations:

| What was shared | Resolution | Tier | Why |
| --- | --- | --- | --- |
| plain text | none — it *is* the content | — | nothing to reach for |
| `content://` URI (photo, PDF, file) | read the bytes into an `Attachment` | `Observe` | a local read the user authorized by sharing; the URI grant is scoped and expires |
| a URL | **fetching it is egress** | `Act (irreversible)` | the host learns you fetched. You cannot un-disclose that — the same reasoning DR-9 applied to a remote model route |

**That third row is the one worth having written down before building.** A naive
share sensor "helpfully" fetches shared links to get a title and a preview, and in
doing so makes Orb initiate a network connection to an arbitrary third party on
the strength of a share. Under DR-9 that is a disclosure needing its own
authorization. **Sharing a link is not authorization to visit it.**

This also satisfies `Observation.md` inv. 5 — *references, never copies; raw
content is referenced as Attachments by identity* — by construction rather than by
discipline.

---

## 4. What the Observation carries

*Corrected 2026-09-29 to what the phone actually writes* (`DECISIONS.md` DR-13).
The first draft of this table named fields the phone never used (`sensor`,
`reference`, `resolvable`, `confidence`). History cannot be edited, so the shipped
names stand and this table follows them.

At the Observation level:

| Field | Value | Note |
| --- | --- | --- |
| `source` | `orb.sensor.share@<install>` | inv. 3, always attributed — **derived** from the event's type and device, see §4a |
| `confidencePercent` | `100` | §7: the occurrence, never the content |
| `attachments` | `["sha256:…"]` when the content was read | by identity, never inlined — inv. 5 |

And in its `data`, under the phone's own names:

| Field | Value | Note |
| --- | --- | --- |
| `because` | `user.shared` | |
| `shareReadable` | `false` when the phone could not read the intent | *cannot check*, never *nothing was shared*; when false, nothing below is present |
| `action` | `android.intent.action.SEND` / `SEND_MULTIPLE` | |
| `mimeType` | as declared by the sender | *declared*, never verified by the sensor |
| `referrer` | the calling package as Android reported it, or `unknown` | §5; **unverified** |
| `itemCount` | 1, or n for `SEND_MULTIPLE`, 0 if nothing nameable arrived | |
| `references` | what was handed over, colon-joined; for text, the text itself | never the resolved bytes; **carried whole, never split** — a URI and a sentence both contain colons |
| `resolved` | `true` / `false` | §6 |
| `absenceReason` | `unfetched` while unresolved | omitted once the content is held |
| `resolveOutcome` | `stored`, `held`, `refused`, `failed`, `openedNull`, `tooLarge`, `readFailed`, `sealFailed`, `noReference`, `notAContentUri` | every outcome is recorded, including refusals |
| `resolveDetail` | the platform's message, when there is one | |
| `attachmentBytes` | size of the held content | the identity itself is in `attachments` |

Placement in time and device comes from the envelope and from `causes` (inv. 4),
not from fields — the same rule that keeps the custody receipt's holder out of its
payload. The phone's own `elapsedRealtimeMs` is deliberately not copied: it places
the event on the phone, and the Observation reaches it through `causes`.

### 4a. From the phone's event to the Observation

The phone does not write an Observation. It writes an **`orb.shared` device
event**, and the desktop importer (`importExport`, `packages/device-watch/src/
share.ts`) translates it. The first draft of this document described the
Observation as if the phone wrote it directly, and never said how one became the
other; this is that.

- **A translation, not a move.** The phone's event is replicated verbatim and stays
  exactly as written. The Observation is a new event in the desk's own lane whose
  `causes` is the phone's event id, so lineage is in the journal's structure and
  not only in prose.
- **The source is derived, and that is enough.** The event's type (`orb.shared`)
  names the sensor and its `device` names the install. Both are fixed when the
  event is written and never change, so source identity is **fixed at write time**
  — the property `AD-6` needs — without a new field. A `sensor` field in the
  payload would repeat what the type already says (Art. IX §33), and every share
  already recorded would lack it.
- **The phone's names are kept.** Renaming `references` or `resolved` going
  forward would mean two record shapes to read for ever.
- **The referrer is data; it is not the source.** The sensor is the doorway; the
  sending app is where the content came from. Whether shares from two different
  apps are independent is `AD-6`'s question, and is not answered by changing what
  the source is called.
- **The same photograph shared twice is two Observations** (§8 rule 3). Both carry
  the same attachment identity, which is exactly how a later reader can tell they
  are one photograph shared twice.
- **A share that cannot be read is still an Observation** — the hand-off happened
  — carrying `shareReadable: false` and nothing else.

**Only occurrences in the world are Observations.** `Observation.md`:
*Observations originate from reality, Events from runtime activity.* The phone also
writes `orb.process.start`, `grants.exits`, `grants.capability.granted` and
`.revoked`, `grants.watch.failed`, `orb.chain.discontinuity`, `orb.export` and
`orb.resolve.attempt`. All of them are about Orb itself, so they stay **Events** —
present in the replicated lane and translated into nothing. (`grants.observed` and
`grants.packages` are readings of the OS's state and are translated, as
`orb.sensor.grants@<install>`; `SENSOR_GRANTS.md` §4 holds the one naming convention.)

**Drift is tested for.** The fixture the importer is tested against is generated by
`Shares.java.in`, the class the phone runs, and a test reads that file's source: a
field the phone starts writing fails the build until the importer decides whether
to map it, attach it or exclude it.

---

## 5. `referrer: unknown` is *cannot check*, never *nobody*

Android may or may not tell Orb which app initiated the share, and the value can be
absent for ordinary reasons. So:

> **An absent referrer is recorded as `unknown`, never omitted and never guessed.**

This is the register's oldest entry in a new costume: `Readable: false` means
*cannot check*, never *nothing is enabled*. A share sensor that dropped the field
when Android withheld it would make "we don't know where this came from" and "it
came from nowhere" the same record — and later, "shared from WhatsApp" would become
a fact nobody ever observed.

The same applies to `mimeType`: it is what the sending app **declared**. A sensor
that sniffed the bytes to correct it would be interpreting, which `Sensor.md` §1
forbids. Record the declaration; let a later stage disagree with it in its own
record.

---

## 6. A share that cannot be resolved is still an observation

URI grants are scoped and can expire; a file can be deleted between the share and
the read. When the bytes cannot be read:

- The Observation is **still recorded** — the hand-off happened.
- `resolvable: false` carries an `AbsenceReason` (`unfetched` / `pruned` /
  `erased`).
- No Attachment is minted, and **no empty one** is minted either.

The failure this prevents is a shared photo that becomes a record of "the user
shared nothing." Same fault line as `Readable: false`; same answer.

---

## 7. Confidence: certain about the occurrence, silent about the content

`Observation.md` inv. 2 — *occurrence, not truth* — and inv. 7 — *carries
confidence, not truth* — resolve cleanly here, and the resolution is the point of
the whole sensor:

- **The occurrence is as certain as anything Orb will ever record.** A person
  deliberately handed this over and the OS witnessed the act. There is no inference
  in it.
- **The content gets no confidence at all**, because the sensor makes no claim
  about it. A shared WhatsApp screenshot is an observation that *a screenshot was
  shared* — not that Ravi said anything.

"Ravi asked for the proposal" is an **interpretation**, produced later, by a
`Reasoner`, recorded with its own provenance and its own confidence. That
contract is still Draft, which is exactly why the sensor must not quietly do its
job: the observation layer is Accepted and can be built today; the interpretation
layer is not, and a sensor that interpreted would be building on Draft contracts
without saying so.

---

## 8. What this sensor must never do

1. **Interpret.** No entity extraction, no commitment detection, no summarising.
2. **Fetch.** No URL resolution without the declared egress Capability and its
   authorization.
3. **Deduplicate silently.** The same photo shared twice is two occurrences. A
   sensor that collapsed them would be deciding they meant the same thing.
4. **Correct the sender.** A wrong `mimeType` is recorded as declared.
5. **Reach past the share.** The URI grant covers one item. Walking a directory
   from a shared file's path is reaching for something nobody handed over — AD-7,
   re-committed.

---

## 9. The cost, stated now rather than discovered

**Shared content contains other people.** A forwarded thread carries Ravi's words,
and Ravi did not consent to Orb.

This is not avoidable and should not be pretended away. Two things make it the
least-bad available posture, and they are worth holding to:

- The act is **the user's, deliberate, and per-item** — the same act as forwarding
  the thread to a friend, which needs no justification at all.
- The exposure is **bounded by attention**. A notification listener captures
  everything that arrives, indefinitely, from everyone. Share captures what one
  person decided to hand over, once. That bound is not a technical control, but it
  is a real one, and it disappears the moment continuous capture is added.

`ERASURE.md`'s machinery applies unchanged: a shared item is a payload under its
own key, and erasing it destroys the key rather than the bytes — which is what
makes it reachable on a peer's disk too.

---

## 10. What it does not need, and what it would block on

**Needs nothing that is not already Accepted.** `Sensor`, `Observation`, `Event`,
`Evidence`, `Entity`, `Capability`, `Policy`, `Action` — the full set this
declaration touches, all accepted.

**Doing more is now a matter of code, not of contracts.** When this was written
the interpretation contracts were Draft; **all thirty are Accepted (2026-09-29)**.
Linking a share to a person (`Relationship`), turning it into a commitment (`Goal`
or `Project`) and extracting anything from it (`Reasoner`, `InferenceRecord`,
`ModelRouter`) are unbuilt, not blocked.

The recommendation stands, and it is what was built: **the observation layer,
complete and honest, with nothing claimed about meaning.** Interpretation is a
later step, and the history recorded meanwhile is already in the right shape for
it, because it was recorded without interpretation.
