// Turns export files into your profile and a report. Pure except for the
// file list it is given; the command-line wrapper is scripts/import.ts.

import { buildProfile, type Profile } from '../profile.ts';
import { redact, scanSensitive, sensitiveReport, type SensitiveHit, type SensitiveReport } from './sensitive.ts';
import { looksLikeUnreadAlert, parseAdbSms, parseBankAlert, parseSmsBackupXml } from './sms.ts';
import { parseGooglePayActivity } from './takeout.ts';
import type { Sms, Txn } from './types.ts';

export type SourceKind = 'adb_sms' | 'sms_backup_xml' | 'google_pay_takeout' | 'unknown';

export function detectSource(text: string): SourceKind {
  const head = text.trimStart().slice(0, 2000);
  if (/^Row: \d+ /.test(head)) return 'adb_sms';
  if (/<smses[\s>]/.test(head) || /<sms\s/.test(head)) return 'sms_backup_xml';
  if (head.startsWith('[') && /"(?:header|products)"\s*:/.test(head) && text.includes('Google Pay')) return 'google_pay_takeout';
  return 'unknown';
}

export interface ImportInput {
  readonly name: string;
  readonly text: string;
}

export interface ImportResult {
  readonly profile: Profile;
  readonly txns: readonly Txn[];
  readonly files: readonly { readonly name: string; readonly kind: SourceKind; readonly records: number; readonly txns: number }[];
  readonly sensitive: SensitiveReport;
  /** Where the most serious items were found, masked. */
  readonly alarms: readonly string[];
  /** Bank alerts that could not be read, redacted, so their format can be added. */
  readonly unreadSamples: readonly string[];
  readonly unreadCount: number;
}

const SERIOUS = new Set(['recovery_phrase', 'private_key', 'card_number', 'aadhaar', 'account_number', 'password', 'api_key']);

export function runImport(inputs: readonly ImportInput[], now: number, tzOffsetMinutes = 330): ImportResult {
  const txns: Txn[] = [];
  const hits: SensitiveHit[][] = [];
  const alarms: string[] = [];
  const unreadSamples: string[] = [];
  let unreadCount = 0;
  const files: ImportResult['files'][number][] = [];

  const scan = (where: string, text: string) => {
    const h = scanSensitive(text);
    hits.push(h);
    for (const x of h) if (SERIOUS.has(x.kind) && alarms.length < 20) alarms.push(`${where}: ${x.kind.replace('_', ' ')} ${x.masked}`);
  };

  for (const input of inputs) {
    const kind = detectSource(input.text);
    if (kind === 'google_pay_takeout') {
      const r = parseGooglePayActivity(input.text);
      txns.push(...r.txns);
      scan(input.name, input.text);
      files.push({ name: input.name, kind, records: r.txns.length + r.unread, txns: r.txns.length });
      continue;
    }
    if (kind === 'unknown') {
      files.push({ name: input.name, kind, records: 0, txns: 0 });
      continue;
    }
    const messages: Sms[] = kind === 'adb_sms' ? parseAdbSms(input.text) : parseSmsBackupXml(input.text);
    let found = 0;
    for (const m of messages) {
      scan(`SMS from ${m.address} on ${new Date(m.date + tzOffsetMinutes * 60_000).toISOString().slice(0, 10)}`, m.body);
      const t = parseBankAlert(m);
      if (t !== null) {
        txns.push(t);
        found++;
      } else if (looksLikeUnreadAlert(m)) {
        unreadCount++;
        if (unreadSamples.length < 5) unreadSamples.push(`${m.address}: ${redact(m.body).replace(/\n/g, ' ⏎ ')}`);
      }
    }
    files.push({ name: input.name, kind, records: messages.length, txns: found });
  }

  return {
    profile: buildProfile(txns, now, tzOffsetMinutes),
    txns,
    files,
    sensitive: sensitiveReport(hits),
    alarms,
    unreadSamples,
    unreadCount,
  };
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Plain-text report for the terminal. Contains no unmasked confidential data. */
export function formatReport(r: ImportResult): string {
  const p = r.profile;
  const lines: string[] = [];
  lines.push('ACTION LOCK · IMPORT REPORT', '');
  for (const f of r.files) {
    lines.push(f.kind === 'unknown' ? `  ✗ ${f.name}: format not recognised (skipped)` : `  ✓ ${f.name}: ${f.records} records → ${f.txns} transactions (${f.kind})`);
  }
  lines.push('');

  if (r.sensitive.total > 0) {
    lines.push(`⚠ CONFIDENTIAL DATA FOUND: ${r.sensitive.total} items. Masked in everything saved.`);
    for (const k of r.sensitive.byKind) lines.push(`    ${String(k.count).padStart(5)}  ${k.label}  e.g. ${k.examples.join(', ')}`);
    if (r.alarms.length > 0) {
      lines.push('', '  Most serious, and where:');
      for (const a of r.alarms) lines.push(`    · ${a}`);
    }
    if (r.sensitive.byKind.some((k) => k.kind === 'recovery_phrase' || k.kind === 'private_key')) {
      lines.push('', '  A wallet recovery phrase or private key sitting in messages or exports should be treated as exposed.',
        '  If it is real, move the funds to a new wallet.');
    }
    lines.push('');
  } else {
    lines.push('✓ No confidential data found.', '');
  }

  lines.push('YOUR NORMAL');
  if (p.range !== null) lines.push(`  History: ${day(p.range.from)} → ${day(p.range.to)}`);
  lines.push(`  Payments: ${p.debits.count} · usual ${rupees(p.debits.p50)} · 90% under ${rupees(p.debits.p90)} · largest ${rupees(p.debits.max)}`);
  lines.push(`  Money in: ${p.credits.count} ${p.credits.count === 1 ? 'receipt' : 'receipts'}, ${rupees(p.credits.total)}`);
  lines.push(p.quietHours === null ? '  Quiet hours: not enough history yet' : `  Quiet hours: you rarely pay between ${hh(p.quietHours.from)} and ${hh(p.quietHours.to)}`);
  lines.push('  Most paid:');
  for (const x of p.payees.slice(0, 10)) lines.push(`    ${String(x.count).padStart(4)}×  ${x.name}  (usual ${rupees(x.median)}, max ${rupees(x.max)})`);
  lines.push(`  Payees in total: ${p.payees.length}`);

  if (r.unreadCount > 0) {
    lines.push('', `? ${r.unreadCount} bank alerts could not be read. Samples (redacted) — share them to add the format:`);
    for (const s of r.unreadSamples) lines.push(`    ${s}`);
  }
  return lines.join('\n');
}
