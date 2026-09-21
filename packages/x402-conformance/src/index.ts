/**
 * @spendcap/x402-conformance — does a client do the right thing when it cannot
 * tell whether the money moved?
 *
 * Seven properties, one scriptable server, and an adapter small enough that
 * any client can be put under it. It is not a test suite for one
 * implementation; it is the same seven questions asked of each.
 */
export type { Outcome, Obligations } from "./outcomes.js";
export { OBLIGATIONS } from "./outcomes.js";
export type { Fault, ScriptedServer, ServerOptions } from "./server.js";
export { scriptedServer } from "./server.js";
export type { ClientUnderTest, CountingScheme, Property, Verdict } from "./battery.js";
export { PROPERTIES } from "./battery.js";
export type { Report, Result } from "./run.js";
export { runBattery, countingScheme, format, compare } from "./run.js";
