// Cases the TypeScript and Kotlin pay guards must both get right.
// `npm run guard-vectors` writes them, with the expected decisions, to
// test/guard-vectors.json (read by GuardRulesTest.kt).
import { decideGuard, type GuardDecision, type GuardScreen, type GuardTable } from '../src/orb/guard.ts';

export const TABLE: GuardTable = {
  version: 1,
  builtAt: 0,
  largeAmount: 6_000,
  usual: 180,
  quiet: { from: 1, to: 6 },
  payees: [
    { key: 'tarunsharma', name: 'TARUN SHARMA', count: 4, usual: 3_000, max: 12_050, passUpTo: 24_100 },
    { key: 'ravikumarm', name: 'RAVIKUMAR M', count: 30, usual: 160, max: 400, passUpTo: 800 },
    { key: 'ashamenon', name: 'ASHA MENON', count: 12, usual: 1_000, max: 5_000, passUpTo: 24_000, relation: 'family' },
    { key: 'swiggylimited', name: 'SWIGGY LIMITED', count: 200, usual: 350, max: 1_800, passUpTo: 3_600 },
    { key: 'chethangowdaps', name: 'CHETHAN GOWDA P S', vpa: '9535528118@axl', count: 3, usual: 175, max: 400, passUpTo: 800 },
  ],
};

export const SCREENS: readonly (GuardScreen & { readonly label: string })[] = [
  { label: 'known payee, usual amount', name: 'TARUN SHARMA', amount: 3_000, hour: 13 },
  { label: 'known payee, name in other case', name: 'Tarun Sharma', amount: 3_000, hour: 13 },
  { label: 'known payee, far above their most', name: 'TARUN SHARMA', amount: 50_000, hour: 13 },
  { label: 'known payee, above most but small', name: 'RAVIKUMAR M', amount: 1_500, hour: 13 },
  { label: 'new payee, small', name: 'NEW PERSON', amount: 500, hour: 13 },
  { label: 'new payee, large', name: 'NEW PERSON', amount: 25_000, hour: 13 },
  { label: 'confirmed family, large', name: 'ASHA MENON', amount: 30_000, hour: 13 },
  { label: 'long name that begins the known one', name: 'SWIGGY LIMITED BANGALORE', amount: 400, hour: 13 },
  { label: 'short fragment is not a match', name: 'SWIG', amount: 400, hour: 13 },
  { label: 'known payee at 3 am, usual amount', name: 'RAVIKUMAR M', amount: 160, hour: 3 },
  { label: 'new payee at 3 am', name: 'NEW PERSON', amount: 500, hour: 3 },
  { label: 'known payee at 3 am, 2.5× your usual', name: 'RAVIKUMAR M', amount: 450, hour: 3 },
  { label: 'known payee at 3 am, 3.3× your usual', name: 'RAVIKUMAR M', amount: 600, hour: 3 },
  { label: 'quiet hours wrap midnight: 23:00 is outside 01–06', name: 'NEW PERSON', amount: 500, hour: 23 },
  { label: 'no name read', amount: 700, hour: 13 },
  { label: 'PIN screen shows only a known UPI ID', name: '9535528118@axl', amount: 300, hour: 13 },
  { label: 'PIN screen shows an unknown UPI ID', name: 'munirajamadavali@oksbi', amount: 300, hour: 13 },
];

export function vectors(): { table: GuardTable; cases: (GuardScreen & { label: string; expected: GuardDecision })[] } {
  return { table: TABLE, cases: SCREENS.map((s) => ({ ...s, expected: decideGuard(TABLE, s) })) };
}
