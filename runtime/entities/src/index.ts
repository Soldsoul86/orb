/** `@orb/entities` — handles found in text by rules. See `docs/ENTITIES_PHONE.md`. */
export { MAX_CHARS, MAX_HANDLES, extractHandles } from "./handles.js";
export type { Handle, HandleKind } from "./handles.js";
export { RELATIVE_MAX_CHARS, RELATIVE_MAX_DAYS, relativeDays } from "./relative.js";
export type { RelativeDay } from "./relative.js";
export { NAME_MAX_CHARS, NAME_MAX_CONTACTS, NAME_MIN_FIRST, matchNames, sharedFirstNames } from "./names.js";
export type { NameContact, NameMatch } from "./names.js";

