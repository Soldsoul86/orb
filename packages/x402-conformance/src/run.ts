/**
 * Runs the battery and reports, rather than throwing.
 *
 * A conformance tool that stops at the first failure tells you one thing. The
 * useful artifact is the whole grid: which client satisfies which property,
 * side by side, so a gap is visible as a gap rather than as an exception.
 */
import { randomUUID } from "node:crypto";

import { PROPERTIES, type ClientUnderTest, type CountingScheme, type Verdict } from "./battery.js";
import { scriptedServer, type ServerOptions } from "./server.js";

export interface Result {
  readonly id: string;
  readonly title: string;
  readonly because: string;
  readonly verdict: Verdict;
}

export interface Report {
  readonly client: string;
  readonly results: readonly Result[];
  readonly passed: number;
  readonly failed: number;
  readonly inapplicable: number;
}

/** A fresh signing scheme that counts. One per property, so counts do not carry over. */
export function countingScheme(): CountingScheme {
  let n = 0;
  return {
    scheme: "exact",
    async createPaymentPayload(x402Version, requirements) {
      n += 1;
      return { x402Version, payload: { nonce: randomUUID(), amount: requirements.amount } };
    },
    count: () => n,
  };
}

export async function runBattery(
  name: string,
  client: ClientUnderTest,
  options: ServerOptions = {},
): Promise<Report> {
  const results: Result[] = [];
  for (const property of PROPERTIES) {
    // A new server and a new scheme per property: shared state between
    // scenarios is how a harness reports a pass it did not earn.
    const server = scriptedServer(options);
    const scheme = countingScheme();
    let verdict: Verdict;
    try {
      verdict = await property.run(server, client, scheme);
    } catch (error) {
      verdict = { ok: false, detail: `threw: ${(error as Error).message}` };
    }
    results.push({ id: property.id, title: property.title, because: property.because, verdict });
  }
  return {
    client: name,
    results,
    passed: results.filter((r) => r.verdict.ok === true).length,
    failed: results.filter((r) => r.verdict.ok === false).length,
    inapplicable: results.filter((r) => r.verdict.ok === null).length,
  };
}

const MARK: Readonly<Record<string, string>> = { true: "ok  ", false: "FAIL", null: "n/a " };

/** A plain-text report. */
export function format(report: Report): string {
  const lines = [`${report.client}`];
  for (const r of report.results) {
    lines.push(`  ${MARK[String(r.verdict.ok)]}  ${r.id}  ${r.title}`);
    lines.push(`        ${r.verdict.detail}`);
  }
  lines.push(
    `  ${report.passed} passed, ${report.failed} failed` +
      (report.inapplicable > 0 ? `, ${report.inapplicable} not applicable` : ""),
  );
  return lines.join("\n");
}

/**
 * Side-by-side grid.
 *
 * This is the output worth having: the same seven questions asked of every
 * client, with the answers in one column each.
 */
export function compare(reports: readonly Report[]): string {
  const width = Math.max(...reports.map((r) => r.client.length), 8);
  const head = ["    ", ...reports.map((r) => r.client.padEnd(width))].join("  ");
  const rows = PROPERTIES.map((p, i) =>
    [
      p.id.padEnd(4),
      ...reports.map((r) => MARK[String(r.results[i]?.verdict.ok)]?.padEnd(width) ?? "?".padEnd(width)),
      p.title,
    ].join("  "),
  );
  return [head, ...rows].join("\n");
}
