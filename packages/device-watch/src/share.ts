/**
 * What the phone's share sensor hands over, as an Observation.
 *
 * `docs/SENSOR_SHARE.md` §4a. The phone writes an `orb.shared` **device event**;
 * this is the translation into the **Observation** that `Sensor.md` says the
 * sensor emits. It is a translation and not a move: the phone's event stays
 * exactly as written, and the Observation cites it in `causes`.
 *
 * **The source is the sensor, and it is derived rather than stored.** The event's
 * type (`orb.shared`) names the sensor and its `device` names the install, and
 * both are fixed when the event is written and never change. A `sensor` field in
 * the payload would repeat what the type already says (Art. IX §33), and every
 * share already in history would lack it.
 *
 * **The phone's names are kept** (`references`, `resolved`). History cannot be
 * edited, so renaming them going forward would mean two shapes to read for ever.
 *
 * **Nothing here interprets.** A shared screenshot is an observation that *a
 * screenshot was shared* — not that anyone said anything in it (`SENSOR_SHARE.md`
 * §7). Content gets no confidence because this sensor makes no claim about it.
 */
/** The phone's event type for one hand-off. */
export const SHARED_TYPE = "orb.shared";

/** What perceived it. Combined with the install as `orb.sensor.share@<device>`. */
export const SHARE_SENSOR = "orb.sensor.share";

/**
 * The occurrence is as certain as anything Orb records: a person deliberately
 * handed something over and the OS witnessed it (`SENSOR_SHARE.md` §7). This is
 * confidence in *that it happened*, never in what was shared.
 */
export const SHARE_CONFIDENCE_PERCENT = 100;

/**
 * Fields the phone writes that become part of the Observation's `data`, under the
 * phone's own names.
 */
export const SHARE_FIELDS_MAPPED = [
  "because",
  "shareReadable",
  "action",
  "mimeType",
  "referrer",
  "itemCount",
  "references",
  "resolved",
  "absenceReason",
  "resolveOutcome",
  "resolveDetail",
  "attachmentBytes",
  "textChars",
  "rekept",
] as const;

/**
 * Fields that become the Observation's `attachments` — by identity, never copied
 * into `data` (`Observation.md` inv. 5).
 */
export const SHARE_FIELDS_ATTACHED = ["attachment"] as const;

/**
 * Fields the phone writes that are deliberately not carried over.
 *
 * `elapsedRealtimeMs` is the phone's uptime clock: it places the event on the
 * phone, and the Observation reaches it through `causes`. Carrying it here would
 * give the same fact a second home.
 */
export const SHARE_FIELDS_EXCLUDED = ["elapsedRealtimeMs"] as const;

/**
 * What a share was, in the phone's own terms. Every field but `because` is
 * optional because the phone omits what it does not know rather than guessing:
 * an unreadable intent has no `mimeType`, and a share that was not read has no
 * `resolveOutcome`.
 */
export interface ShareReading {
  readonly because: string;
  /** False means the phone could not read the intent — *cannot check*, never *nothing shared*. */
  readonly shareReadable?: boolean;
  readonly action?: string;
  /** As the sender declared it. Never verified. */
  readonly mimeType?: string;
  /** Who Android said initiated the share, or `unknown`. Unverified. */
  readonly referrer?: string;
  readonly itemCount?: number;
  /**
   * What was handed over, exactly as the phone recorded it: colon-joined, and for
   * a text share the text itself. **Never split here** — a URI and a sentence both
   * contain colons, so the only faithful thing to do with the field is carry it.
   */
  readonly references?: string;
  readonly resolved?: boolean;
  readonly absenceReason?: string;
  readonly resolveOutcome?: string;
  readonly resolveDetail?: string;
  readonly attachmentBytes?: number;
  /**
   * How many characters of **text** were shared. Words are sealed as an Attachment and never written in the
   * clear (`docs/SENSOR_SHARE.md`); the count says how much there was, not what.
   */
  readonly textChars?: number;
  /** The person had erased this content and chose to keep it again (`docs/REKEEP.md`). A flag; the erasures are the event's `causes`. */
  readonly rekept?: boolean;
}

/** The Observation a share becomes, before it is drafted. */
export interface ShareTranslation {
  readonly data: ShareReading;
  readonly attachments: readonly string[];
}

/** A scheme-tagged identity, the only shape an Observation accepts as an attachment. */
const IDENTITY = /^[a-z0-9]+:[0-9a-f]+$/;

/**
 * The share as a translation, or null when the payload is not an object at all.
 *
 * Anything the phone did not write is left out, not defaulted. A field that is
 * present but of the wrong type is also left out: guessing a boolean from a
 * string would be interpreting, and the phone's own event is still in history.
 */
export function shareFrom(payload: unknown): ShareTranslation | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const flat = payload as Record<string, unknown>;

  const text = (key: string): string | undefined =>
    typeof flat[key] === "string" ? (flat[key] as string) : undefined;
  const flag = (key: string): boolean | undefined =>
    typeof flat[key] === "boolean" ? (flat[key] as boolean) : undefined;
  const count = (key: string): number | undefined =>
    typeof flat[key] === "number" && Number.isSafeInteger(flat[key])
      ? (flat[key] as number)
      : undefined;

  const shareReadable = flag("shareReadable");
  const action = text("action");
  const mimeType = text("mimeType");
  const referrer = text("referrer");
  const itemCount = count("itemCount");
  const references = text("references");
  const resolved = flag("resolved");
  const absenceReason = text("absenceReason");
  const resolveOutcome = text("resolveOutcome");
  const resolveDetail = text("resolveDetail");
  const attachmentBytes = count("attachmentBytes");
  const textChars = count("textChars");
  const rekept = flag("rekept");

  const data: ShareReading = {
    // Same convention as the grants reading: a missing reason is `unknown`, not
    // an invented one.
    because: text("because") ?? "unknown",
    ...(shareReadable === undefined ? {} : { shareReadable }),
    ...(action === undefined ? {} : { action }),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(referrer === undefined ? {} : { referrer }),
    ...(itemCount === undefined ? {} : { itemCount }),
    ...(references === undefined ? {} : { references }),
    ...(resolved === undefined ? {} : { resolved }),
    ...(absenceReason === undefined ? {} : { absenceReason }),
    ...(resolveOutcome === undefined ? {} : { resolveOutcome }),
    ...(resolveDetail === undefined ? {} : { resolveDetail }),
    ...(attachmentBytes === undefined ? {} : { attachmentBytes }),
    ...(textChars === undefined ? {} : { textChars }),
    ...(rekept === undefined ? {} : { rekept }),
  };

  const identity = text("attachment");
  const attachments = identity !== undefined && IDENTITY.test(identity) ? [identity] : [];

  return { data, attachments };
}

/** What perceived a share: the sensor, at the install that holds the lane. */
export function shareSource(device: string): string {
  return `${SHARE_SENSOR}@${device}`;
}
