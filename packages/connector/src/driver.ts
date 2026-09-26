/**
 * The external half of a connector, injected rather than imported.
 *
 * Every connector — Gmail, Calendar, Drive — reaches its source over a network,
 * and none of that belongs in the part that decides what gets recorded. A driver
 * is supplied by the caller (`CLAUDE.md`: dependency injection), so the recording
 * rules are tested without a network and a failing test names the rule rather
 * than the weather.
 *
 * A driver may **throw** or **refuse**; it must never invent. Returning `null`
 * from a source that said nothing is correct and becomes `absent`; returning an
 * empty array for it is the lie this whole package is arranged to prevent.
 */

/** What was asked for. A shape, never the answer. */
export interface FetchScope {
  /** The connector's own name for what it reaches: `gmail`, `calendar`, `drive`. */
  readonly connector: string;
  /**
   * The query as the caller expressed it — `newer_than:3d`, a calendar window.
   *
   * Recorded, because a query is an **outbound disclosure**: it tells the
   * provider what was asked. A connector call that recorded only what came back
   * would leave the half that left the device unwritten (`SECURITY.md` §7).
   */
  readonly query: string;
}

/** What a driver hands back. `items` is `null` when the source said nothing at all. */
export interface FetchResult<Item = unknown> {
  readonly items: readonly Item[] | null;
}

export interface ConnectorDriver<Item = unknown> {
  fetch(scope: FetchScope): Promise<FetchResult<Item>>;
}

/**
 * A refusal by the other side, as against a failure of the attempt.
 *
 * Drivers throw this when a provider declines — a revoked token, a scope the
 * account does not grant, a rate limit that is a policy rather than an error. It
 * becomes `denied`, and a reader can tell it from `threw` without parsing prose.
 */
export class ConnectorDenied extends Error {
  override readonly name = "ConnectorDenied";
}
