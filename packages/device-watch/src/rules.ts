/**
 * The rule, and what it deliberately does not do.
 *
 * One rule: **a change in what holds power over this device is worth telling you
 * about.** Not *a suspicious change* — that would be a verdict, and
 * `MOBILE_SENSING.md` §4.4's signal *reports a fact, never a verdict*. A grant
 * appearing is usually the owner installing something; whether it is alarming is
 * interpretation, and interpretation lives above this.
 *
 * It refuses to judge by publisher. *"A non-Google name appeared"* was the
 * obvious heuristic and is the wrong one: it bakes in an opinion about who is
 * safe, it is wrong the moment a legitimate third-party service is granted
 * access, and it is exactly the kind of judgement that belongs to the person
 * being told rather than to the thing telling them.
 *
 * **It does not learn — DR-8.** An answered alert is not raised again, and that
 * is idempotence rather than learning: pass 2 reports a change in exactly one
 * reading, so one alert per change is simply the right count. Whether the person
 * *acknowledged* or *dismissed* changes nothing here, and there is a test that
 * says so.
 */
import { changeKey, type AuthorityChange, type DeviceAuthority } from "./projection.js";

export const CHANGE_RULE = "device-watch.authority-changed";

/** A change that should be surfaced and has not been. */
export interface PendingAlert {
  readonly rule: string;
  readonly change: AuthorityChange;
}

/**
 * Which changes are worth raising now.
 *
 * Two things never reach here, and both are filtered in the projection rather
 * than being special cases:
 *
 * - **A baseline is not news.** §5j's lesson from the device: a self-test that
 *   reported a pre-existing state as a new failure said FAILED for ever and
 *   meant nothing. Whatever was already there when Orb arrived is not a change.
 * - **An unreadable kind is not an empty one.** A failed read would otherwise
 *   look like every grant being revoked at once — loud, and wrong.
 */
export function alertsFor(state: DeviceAuthority): readonly PendingAlert[] {
  return state.changes
    .filter((change) => !state.raised.has(changeKey(change.observation, change.kind)))
    .map((change) => ({ rule: CHANGE_RULE, change }));
}
