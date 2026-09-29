/**
 * What a grants reading says, as an Observation's `data`.
 *
 * Mirrors what `apps/pixel/pass2` records, one Observation per reading rather
 * than one per kind: a reading is a single occurrence — the device was looked at
 * once — and `Observation.md` §1 makes an Observation the record *that a
 * perception happened*, not a record per thing perceived.
 *
 * **The transport is `import.ts`, and sync is still absent.** Pass 2 writes these
 * on the phone, in its own lane, in Java; `importExport` replicates that lane
 * from a file the operator carries. A live sync is not built. This package is
 * written against the shape rather than against the pipe, so the pipe can be
 * either.
 */
/**
 * What perceived a grants reading (`docs/SENSOR_GRANTS.md` §2, §4).
 *
 * The sensor, not the app: the same look is taken by every build that carries the
 * grants watch, and which app wrote a lane stays knowable from the replicated event.
 */
export const GRANTS_SENSOR = "orb.sensor.grants";

/** The source of a grants reading: the sensor, at the install that holds the lane. */
export function grantsSource(device: string): string {
  return `${GRANTS_SENSOR}@${device}`;
}

export interface KindReading {
  readonly kind: string;
  /**
   * Whether the source could be read at all.
   *
   * `false` is *cannot check*, and it is never an empty holding set. A reading
   * that could not be taken must not look like a device that holds nothing.
   */
  readonly readable: boolean;
  /** Present only when `readable`. */
  readonly holding?: readonly string[];
  /**
   * What kind of look produced the set, for a kind where the platform offers
   * more than one.
   *
   * `installedPackage` carries `all` or `visible`; the grant kinds carry nothing,
   * because they are whole or unreadable with no middle. Two sets read under
   * different scopes are not two readings of one thing, and the Java side
   * re-baselines across a change rather than diffing — so a `gained` or `lost`
   * that arrives here was always taken under one scope.
   */
  readonly scope?: string;
  /** First record of this kind — nothing to compare against, so never news. */
  readonly baseline: boolean;
  readonly gained?: readonly string[];
  readonly lost?: readonly string[];
}

export interface DeviceAuthorityReading {
  readonly kinds: readonly KindReading[];
  /** Which wake took the reading: `process.start`, `settings.changed`, a signal. */
  readonly because: string;
}
