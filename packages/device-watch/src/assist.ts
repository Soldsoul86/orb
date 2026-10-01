/**
 * What the phone's assistant keeps, as an Observation.
 *
 * `docs/SENSOR_ASSIST.md` §6. The phone writes an `orb.assist.captured` **device event**
 * when the person taps *Remember*; this is the translation into the **Observation** that
 * `Sensor.md` says the sensor emits — the same route as a share (`share.ts`). The phone's
 * event stays exactly as written and the Observation cites it in `causes`.
 *
 * **What is here is what was in the clear — and the clear part was designed to be small.**
 * The text of the screen is a sealed Attachment and appears only as its identity; the app
 * (one the person allowed), how much text, whether the app supplied a page address (a
 * yes/no — the address is sealed with the text) and the build are the rest. Nothing in this
 * file can read the text, because the phone never wrote it where this could see it.
 *
 * **Confidence is in the occurrence, silent about the screen.** Orb is certain a capture
 * happened. It claims nothing about the text being the whole screen (`SENSOR_ASSIST.md` §7),
 * so the content gets no confidence of its own.
 *
 * **Declines, allow-list changes and capture failures stay Events.** They are about Orb's own
 * permissions and decisions, not about the world (`SENSOR_GRANTS.md` §4), so they are not
 * translated.
 */
export const ASSIST_CAPTURED_TYPE = "orb.assist.captured";

/** What perceived it. Combined with the install as `orb.sensor.assist@<device>`. */
export const ASSIST_SENSOR = "orb.sensor.assist";

/** The occurrence: a person asked Orb to keep a screen's text and Orb did. */
export const ASSIST_CONFIDENCE_PERCENT = 100;

/** Fields the phone writes that become the Observation's `data`, under its own names. */
export const ASSIST_FIELDS_MAPPED = [
  "because",
  "package",
  "textNodes",
  "textChars",
  "webUri",
  "resolveOutcome",
  "attachmentBytes",
  "versionCode",
  "passwordFields",
] as const;

/** Fields that become `attachments` — by identity, never copied into `data` (inv. 5). */
export const ASSIST_FIELDS_ATTACHED = ["attachment"] as const;

/** Fields written and deliberately not carried over. None: the clear record is already minimal. */
export const ASSIST_FIELDS_EXCLUDED = [] as const;

export interface AssistReading {
  readonly because: string;
  /** An app the person allowed. Never one that was declined. */
  readonly package?: string;
  readonly textNodes?: number;
  readonly textChars?: number;
  /** Whether the app supplied a page address. The address itself is sealed. */
  readonly webUri?: boolean;
  /** `stored` (new content) or `held` (the same text was already kept). */
  readonly resolveOutcome?: string;
  readonly attachmentBytes?: number;
  /** The build that wrote the record. */
  readonly versionCode?: number;
  /** How many password fields were on the screen and left out. A count; nothing about them was read. */
  readonly passwordFields?: number;
}

export interface AssistTranslation {
  readonly data: AssistReading;
  readonly attachments: readonly string[];
}

const IDENTITY = /^[a-z0-9]+:[0-9a-f]+$/;

/** The capture as a translation, or null when the payload is not an object at all. */
export function assistFrom(payload: unknown): AssistTranslation | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const flat = payload as Record<string, unknown>;

  const text = (key: string): string | undefined =>
    typeof flat[key] === "string" ? (flat[key] as string) : undefined;
  const flag = (key: string): boolean | undefined =>
    typeof flat[key] === "boolean" ? (flat[key] as boolean) : undefined;
  const count = (key: string): number | undefined =>
    typeof flat[key] === "number" && Number.isSafeInteger(flat[key]) ? (flat[key] as number) : undefined;

  const pkg = text("package");
  const textNodes = count("textNodes");
  const textChars = count("textChars");
  const webUri = flag("webUri");
  const resolveOutcome = text("resolveOutcome");
  const attachmentBytes = count("attachmentBytes");
  const versionCode = count("versionCode");
  const passwordFields = count("passwordFields");

  const data: AssistReading = {
    because: text("because") ?? "unknown",
    ...(pkg === undefined ? {} : { package: pkg }),
    ...(textNodes === undefined ? {} : { textNodes }),
    ...(textChars === undefined ? {} : { textChars }),
    ...(webUri === undefined ? {} : { webUri }),
    ...(resolveOutcome === undefined ? {} : { resolveOutcome }),
    ...(attachmentBytes === undefined ? {} : { attachmentBytes }),
    ...(versionCode === undefined ? {} : { versionCode }),
    ...(passwordFields === undefined ? {} : { passwordFields }),
  };

  const identity = text("attachment");
  const attachments = identity !== undefined && IDENTITY.test(identity) ? [identity] : [];
  return { data, attachments };
}

/** What perceived a capture: the sensor, at the install that holds the lane. */
export function assistSource(device: string): string {
  return `${ASSIST_SENSOR}@${device}`;
}
