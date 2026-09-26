/**
 * What a grants reading says, as an Observation's `data`.
 *
 * Mirrors what `apps/pixel/pass2` records, one Observation per reading rather
 * than one per kind: a reading is a single occurrence — the device was looked at
 * once — and `Observation.md` §1 makes an Observation the record *that a
 * perception happened*, not a record per thing perceived.
 *
 * **The transport does not exist yet.** Pass 2 writes these on the phone, in its
 * own lane, in Java. Getting that lane into this runtime is an import or a sync,
 * and neither is built. This package is written against the shape rather than
 * against the pipe, so the pipe can be either.
 */
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
