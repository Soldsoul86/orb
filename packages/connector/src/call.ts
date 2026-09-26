/**
 * The call event: what was asked of an external source, and how it went.
 *
 * `docs/DECISIONS.md` DR-7, tier 1 — *"The call is always journaled, content or
 * not."* Two reasons, and either alone is enough:
 *
 * - **An access Orb does not record is an access nobody can audit.** Including
 *   the user: "did Orb read my mail on the 12th?" has to be answerable from
 *   history rather than from trust.
 * - **The query is an outbound disclosure.** Asking a provider for
 *   `newer_than:3d` tells them what was asked. `SECURITY.md` §7 makes data
 *   leaving the device history; a call that recorded only what came back would
 *   leave the outbound half unwritten.
 *
 * It carries **no fetched content**. What came back is a count and an outcome;
 * the content is a separate concern with its own life (DR-7 tiers 2 and 3).
 */
import type { Journal } from "@orb/journal";
import { ConnectorDenied, type ConnectorDriver, type FetchResult, type FetchScope } from "./driver.js";
import { outcomeOf, type ReadOutcome } from "./outcome.js";

export const CONNECTOR_CALL_TYPE = "orb.connector.call";
export const CONNECTOR_CALL_SCHEMA = { id: CONNECTOR_CALL_TYPE, version: 1 } as const;

/**
 * What a call records. Content-free by construction: there is nowhere to put an
 * item, so no future edit can quietly start putting one there.
 */
export interface ConnectorCall {
  readonly connector: string;
  readonly query: string;
  readonly outcome: ReadOutcome;
  /**
   * How many items came back. `0` under `empty`, and **absent** under the three
   * outcomes where the count is not known — which is not the same as zero, and
   * is the reason this is optional rather than defaulted.
   */
  readonly count?: number;
  /** The failure's own words, under `threw` or `denied`. Never a summary of them. */
  readonly failure?: string;
}

/** A call and, when the source answered, what it handed over. */
export interface CallOutcome<Item = unknown> {
  readonly call: ConnectorCall;
  /** The fetched items, or `null` when the outcome was not `value` or `empty`. */
  readonly items: readonly Item[] | null;
  /** The id of the event this call was recorded as, for anything derived from it. */
  readonly eventId: string;
}

/**
 * Runs one fetch and records it, whatever happens.
 *
 * **The record is written on every path**, including the ones where nothing came
 * back. A connector that journaled only its successes would make silence mean
 * two things — *nothing was there* and *nothing was tried* — and a history that
 * cannot separate those cannot be used to say Orb did **not** read something on
 * a given day.
 *
 * Failures are caught rather than propagated, for the same reason: an exception
 * that escaped before the append would leave the attempt unrecorded, which is
 * the one outcome that must not be possible. The caller reads `outcome` to find
 * out what happened.
 */
export async function recordCall<Item>(
  journal: Journal,
  driver: ConnectorDriver<Item>,
  scope: FetchScope,
): Promise<CallOutcome<Item>> {
  let result: FetchResult<Item> | undefined;
  let call: ConnectorCall;

  try {
    result = await driver.fetch(scope);
    const outcome = outcomeOf(result.items);
    call = {
      connector: scope.connector,
      query: scope.query,
      outcome,
      // Only where a count is a fact. `absent` has no count — the source did not
      // say none, it did not say.
      ...(result.items === null ? {} : { count: result.items.length }),
    };
  } catch (error) {
    const denied = error instanceof ConnectorDenied;
    call = {
      connector: scope.connector,
      query: scope.query,
      outcome: denied ? "denied" : "threw",
      failure: describe(error),
    };
  }

  const event = await journal.appendOne({
    type: CONNECTOR_CALL_TYPE,
    schema: CONNECTOR_CALL_SCHEMA,
    payload: call,
  });

  return {
    call,
    items: call.outcome === "value" || call.outcome === "empty" ? (result?.items ?? null) : null,
    eventId: event.id,
  };
}

/** The error's own words, so a reader sees what happened rather than a paraphrase. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "" ? error.name : `${error.name}: ${error.message}`;
  }
  return String(error);
}
