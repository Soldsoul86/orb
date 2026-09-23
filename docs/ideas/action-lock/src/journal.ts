import type { LockEvent, NewEvent } from './types.ts';

export type Clock = () => number;

/** Append-only history. Events are immutable once appended. */
export interface Journal {
  append(event: NewEvent): LockEvent;
  all(): readonly LockEvent[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function inMemoryJournal(clock: Clock): Journal {
  return persistentJournal(clock, [], () => {});
}

/**
 * A journal that starts from stored events and hands the full list to `save`
 * after every append. Storage (a file, localStorage) is the caller's concern.
 */
export function persistentJournal(
  clock: Clock,
  stored: readonly LockEvent[],
  save: (events: readonly LockEvent[]) => void,
): Journal {
  stored.forEach((e, i) => {
    if (e.seq !== i + 1) throw new Error(`Corrupt journal: event ${i} has seq ${e.seq}`);
  });
  const events: LockEvent[] = stored.map((e) => deepFreeze(structuredClone(e)));
  return {
    append(event) {
      const stored = deepFreeze(
        structuredClone({ ...event, seq: events.length + 1, at: clock() }) as LockEvent,
      );
      events.push(stored);
      save(events.slice());
      return stored;
    },
    all: () => events.slice(),
  };
}
