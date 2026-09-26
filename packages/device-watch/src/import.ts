/**
 * The transport: a pass-2 export on disk becomes readings in this journal.
 *
 * Pass 2 writes its lane on the phone, in Java, one canonical-JSON event per
 * line, and the operator shares the file. That file **is** a journal lane, so
 * carrying it across is replication rather than parsing-and-reconstructing:
 * every event keeps its own id, hlc, chain and hashes, and this device holds a
 * replica of the phone's history rather than a retelling of it.
 *
 * **The import is the first cross-implementation verification on real data.**
 * `verifyLane` re-derives every envelope hash and every payload hash, so the
 * Java encoder's output is checked by the TypeScript one over a device's actual
 * history — not over a fixture. The phone itself can only check linkage
 * (`Journal.java.in`: re-derivation needs a JSON parser the probe does not
 * have), so this is a check the phone structurally cannot perform on itself.
 *
 * Then, and only then, each reading becomes an Observation in *this* device's
 * lane, citing the replicated event. That is the second step of the loop drawn
 * in `DECISIONS.md` DR-8 — Journal, then Observation — and it is a translation
 * rather than a move: the phone's event stays exactly as the phone wrote it.
 */
import type { Journal, StoredEvent, OrbEvent } from "@orb/journal";
import { hasPayload, unwrapPayload } from "@orb/journal";
import { observationDraft, readObservation } from "@orb/observation";
import type { DeviceAuthorityReading, KindReading } from "./reading.js";

/** The pass-2 event that carries a reading. */
export const GRANTS_OBSERVED_TYPE = "grants.observed";

/** The kinds pass 2 records, in the order a reader should think about them. */
const KINDS = ["accessibility", "notificationListener", "deviceAdmin"] as const;

export class ImportError extends Error {
  override readonly name = "ImportError";
}

export interface ImportResult {
  readonly lanes: readonly string[];
  /** Events newly replicated. Events already held are not counted. */
  readonly replicated: number;
  /** Readings newly turned into Observations. */
  readonly observed: number;
}

/**
 * Parses an export into events, refusing the whole file rather than part of it.
 *
 * A line that cannot be parsed makes the chain unverifiable from there on, and a
 * partly-imported chain is the *known absence* problem at its worst: a gap that
 * looks like history. So a bad line fails the import and names itself, instead
 * of being skipped into a lane that then verifies clean because the evidence of
 * the problem was dropped.
 */
export function parseExport(text: string): readonly StoredEvent[] {
  const events: StoredEvent[] = [];

  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new ImportError(`line ${index + 1} is not JSON: ${String(error)}`);
    }
    if (!isEventShaped(parsed)) {
      throw new ImportError(`line ${index + 1} is not an event envelope`);
    }
    events.push(parsed);
  }

  return events;
}

/**
 * Replicates an export and turns its readings into Observations.
 *
 * Idempotent twice over, and by different mechanisms. `replicate` skips events
 * already held, by id. Translation skips readings an Observation already cites.
 * So importing the same file again is a no-op, and importing a *longer* export
 * of the same lane adds only its tail — which is what the operator will actually
 * do, since every export contains the whole journal from the beginning.
 */
export async function importExport(journal: Journal, text: string): Promise<ImportResult> {
  const events = parseExport(text);
  if (events.length === 0) return { lanes: [], replicated: 0, observed: 0 };

  const byLane = new Map<string, StoredEvent[]>();
  for (const event of events) {
    const lane = byLane.get(event.lane);
    if (lane) lane.push(event);
    else byLane.set(event.lane, [event]);
  }

  let replicated = 0;
  for (const [lane, laneEvents] of byLane) {
    const before = (await journal.readLane(lane)).length;
    // Verifies the whole chain, refuses this device's own lane, and skips what
    // is already held. None of that is re-implemented here.
    await journal.replicate(lane, laneEvents);
    replicated += (await journal.readLane(lane)).length - before;
  }

  const observed = await observeReadings(journal, [...byLane.keys()]);
  return { lanes: [...byLane.keys()], replicated, observed };
}

/** Turns replicated readings into Observations, once each. */
async function observeReadings(journal: Journal, lanes: readonly string[]): Promise<number> {
  const cited = new Set<string>();
  for (const event of await journal.readLane(journal.lane)) {
    if (readObservation(event) === null) continue;
    for (const cause of event.causes ?? []) cited.add(cause);
  }

  let observed = 0;
  for (const lane of lanes) {
    for (const event of await journal.readLane(lane)) {
      if (event.type !== GRANTS_OBSERVED_TYPE) continue;
      // A replicated envelope whose payload this device does not hold cannot be
      // read, and is left for a later import rather than recorded as an empty
      // reading.
      if (!hasPayload(event) || cited.has(event.id)) continue;

      const reading = readingFrom(unwrapPayload((event as OrbEvent).payload));
      if (reading === null) continue;

      await journal.appendOne(
        observationDraft(
          {
            // inv. 3: what perceived this. Pass 2, on the phone that holds this
            // lane — not the importer, which only carried it.
            source: `pass2@${event.device}`,
            // There is no inference here: the value is what the OS returned, and
            // a read that failed is carried as `readable: false` rather than
            // smeared into a lower number. Uncertainty that has its own field
            // does not belong in this one.
            confidencePercent: 100,
            data: reading,
          },
          [event.id],
        ),
      );
      observed += 1;
    }
  }
  return observed;
}

/** The flat pass-2 payload as a reading, or null when it is not one. */
function readingFrom(payload: unknown): DeviceAuthorityReading | null {
  if (payload === null || typeof payload !== "object") return null;
  const flat = payload as Record<string, unknown>;

  const kinds: KindReading[] = [];
  for (const kind of KINDS) {
    const readable = flat[`${kind}Readable`];
    if (typeof readable !== "boolean") continue;

    const holding = flat[`${kind}Holding`];
    kinds.push({
      kind,
      readable,
      baseline: flat[`${kind}Baseline`] === true,
      ...(readable && typeof holding === "string" ? { holding: splitHolding(holding) } : {}),
      ...(Array.isArray(flat[`${kind}Gained`]) ? { gained: flat[`${kind}Gained`] as string[] } : {}),
      ...(Array.isArray(flat[`${kind}Lost`]) ? { lost: flat[`${kind}Lost`] as string[] } : {}),
    });
  }
  if (kinds.length === 0) return null;

  return { kinds, because: typeof flat["because"] === "string" ? flat["because"] : "unknown" };
}

/**
 * Splits a colon-joined holding set, the same way `Grants.split` does.
 *
 * Deliberately the same rule and deliberately not shared: the Java side writes
 * it and this reads it, and the one thing that must not drift is the *format*,
 * which `apps/pixel/pass1/tests/vectors.json` pins. A shared function across a
 * language boundary is not available; matching behaviour, stated as such, is.
 */
function splitHolding(joined: string): readonly string[] {
  return joined
    .split(":")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function isEventShaped(value: unknown): value is StoredEvent {
  if (value === null || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const hlc = event["hlc"] as Record<string, unknown> | undefined;
  const integrity = event["integrity"] as Record<string, unknown> | undefined;

  return (
    typeof event["id"] === "string" &&
    typeof event["lane"] === "string" &&
    typeof event["device"] === "string" &&
    typeof event["wallClock"] === "number" &&
    typeof event["type"] === "string" &&
    typeof hlc?.["physical"] === "number" &&
    typeof hlc["counter"] === "number" &&
    typeof integrity?.["hash"] === "string" &&
    typeof integrity["payloadHash"] === "string" &&
    (integrity["previous"] === null || typeof integrity["previous"] === "string")
  );
}
