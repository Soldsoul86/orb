/**
 * A small state projection: what currently holds power, and what has been said
 * about it.
 *
 * **Disposable by construction.** Nothing writes to this; it is folded from
 * events every time. The test is one line — delete it, rebuild by replay, get an
 * identical answer — and it is the line that keeps the journal authoritative.
 * The moment anything can be written here directly, Art. IX §33 is broken and the
 * projection becomes a second source of truth that outlives an erasure of the
 * events describing it.
 *
 * It is also **small on purpose**: current holdings, the changes seen, and which
 * of those have already been surfaced. Not a Knowledge Engine, and not standing
 * in for one — the layers `MASTER.md` puts here are deferred, not collapsed into
 * this file.
 */
import { readObservation } from "@orb/observation";
import type { StoredEvent, OrbEvent } from "@orb/journal";
import { hasPayload, unwrapPayload } from "@orb/journal";
import { ALERT_ANSWERED_TYPE, ALERT_RAISED_TYPE, type AlertAnswer, type AlertAnswered, type AlertRaised } from "./alert.js";
import type { DeviceAuthorityReading } from "./reading.js";

/** One change the device made, as seen in one reading. */
export interface AuthorityChange {
  /** The Observation it was read from. Identity of the change, with `kind`. */
  readonly observation: string;
  readonly kind: string;
  readonly gained: readonly string[];
  readonly lost: readonly string[];
  readonly because: string;
}

export interface Holding {
  readonly kind: string;
  /** Absent when the last readable reading could not read this kind. */
  readonly holding?: readonly string[];
  /** True when the most recent reading of this kind failed. Never an empty set. */
  readonly unreadable: boolean;
}

export interface DeviceAuthority {
  /** Current holdings per kind, newest reading wins. */
  readonly holdings: readonly Holding[];
  /** Every change seen, oldest first. */
  readonly changes: readonly AuthorityChange[];
  /** `observation|kind` for every change already surfaced. */
  readonly raised: ReadonlySet<string>;
  /** How each raised alert was answered, by alert event id. */
  readonly answers: ReadonlyMap<string, AlertAnswer>;
}

/** The key that identifies a change, and therefore an alert about it. */
export function changeKey(observation: string, kind: string): string {
  return `${observation}|${kind}`;
}

/**
 * Folds events into the projection.
 *
 * An event whose payload this device does not hold contributes nothing and is
 * not an error: a partial replica sees less, and seeing less is not the same as
 * there being less. Every field here is derived from what *is* readable, and the
 * projection never invents a holding for a reading it could not open.
 */
export function project(events: readonly StoredEvent[]): DeviceAuthority {
  const holdings = new Map<string, Holding>();
  const changes: AuthorityChange[] = [];
  const raised = new Set<string>();
  const answers = new Map<string, AlertAnswer>();

  for (const event of events) {
    if (!hasPayload(event)) continue;

    if (event.type === ALERT_RAISED_TYPE) {
      const alert = unwrapPayload((event as OrbEvent).payload) as AlertRaised;
      raised.add(changeKey(alert.observation, alert.kind));
      continue;
    }
    if (event.type === ALERT_ANSWERED_TYPE) {
      const answered = unwrapPayload((event as OrbEvent).payload) as AlertAnswered;
      answers.set(answered.alert, answered.answer);
      continue;
    }

    const observation = readObservation<DeviceAuthorityReading>(event);
    if (observation === null || !Array.isArray(observation.data?.kinds)) continue;

    for (const reading of observation.data.kinds) {
      holdings.set(reading.kind, {
        kind: reading.kind,
        // Unreadable is recorded as a reason and never as an empty holding set:
        // *cannot check* is not *nothing is enabled*, and a projection that
        // merged them would show every grant vanishing the moment a read failed.
        unreadable: !reading.readable,
        ...(reading.readable && reading.holding !== undefined
          ? { holding: [...reading.holding] }
          : {}),
      });

      if (reading.baseline || !reading.readable) continue;
      const gained = reading.gained ?? [];
      const lost = reading.lost ?? [];
      if (gained.length === 0 && lost.length === 0) continue;

      changes.push({
        observation: event.id,
        kind: reading.kind,
        gained: [...gained],
        lost: [...lost],
        because: observation.data.because,
      });
    }
  }

  return {
    holdings: [...holdings.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
    changes,
    raised,
    answers,
  };
}
