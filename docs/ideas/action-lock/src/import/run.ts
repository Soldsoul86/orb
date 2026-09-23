// Turns export files into your profile and a report. Pure except for the
// file list it is given; the command-line wrapper is scripts/import.ts.

import { buildProfile, type Profile } from '../profile.ts';
import { redact, scanSensitive, sensitiveReport, type SensitiveHit, type SensitiveReport } from './sensitive.ts';
import { displayMerchant, type MandateEvent } from '../subscriptions.ts';
import { looksLikeUnreadAlert, parseAdbSms, parseBankAlert, parseMandateAlert, parseSmsBackupXml } from './sms.ts';
import { looksLikeScam } from './scam.ts';
import { parseGooglePayActivity } from './takeout.ts';
import { counterpartyKey, type Sms, type Txn } from './types.ts';

export type SourceKind = 'adb_sms' | 'sms_backup_xml' | 'google_pay_takeout' | 'empty' | 'unknown';

export function detectSource(text: string): SourceKind {
  const head = text.trimStart().slice(0, 2000);
  if (head === '') return 'empty';
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
  /** Every unread alert, redacted, for private/unread-alerts.txt. */
  readonly unreadAll: readonly string[];
  /** Likely scam messages found in the inbox, redacted, with why. */
  readonly scams: readonly string[];
  readonly scamCount: number;
  /** Payments whose alert named no payee (kept for totals). */
  readonly unnamedCount: number;
}

const SERIOUS = new Set(['recovery_phrase', 'private_key', 'card_number', 'aadhaar', 'account_number', 'password', 'api_key']);

export function runImport(inputs: readonly ImportInput[], now: number, tzOffsetMinutes = 330): ImportResult {
  const txns: Txn[] = [];
  const mandates: MandateEvent[] = [];
  const hits: SensitiveHit[][] = [];
  const alarms: string[] = [];
  const unreadSamples: string[] = [];
  const unreadAll: string[] = [];
  const scams: string[] = [];
  let scamCount = 0;
  let unnamedCount = 0;
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
    if (kind === 'unknown' || kind === 'empty') {
      files.push({ name: input.name, kind, records: 0, txns: 0 });
      continue;
    }
    const messages: Sms[] = kind === 'adb_sms' ? parseAdbSms(input.text) : parseSmsBackupXml(input.text);
    let found = 0;
    for (const m of messages) {
      const scam = looksLikeScam(m);
      if (scam !== null) {
        scamCount++;
        if (scams.length < 10) scams.push(`${new Date(m.date + tzOffsetMinutes * 60_000).toISOString().slice(0, 10)} ${m.address}: ${redact(m.body).replace(/\n/g, ' ⏎ ').slice(0, 160)} (${scam.reason})`);
        continue;
      }
      scan(`SMS from ${m.address} on ${new Date(m.date + tzOffsetMinutes * 60_000).toISOString().slice(0, 10)}`, m.body);
      const t = parseBankAlert(m);
      const mandate = parseMandateAlert(m);
      if (mandate !== null) mandates.push(mandate);
      if (t !== null) {
        txns.push(t);
        found++;
        if (t.unnamed === true) {
          unnamedCount++;
          if (unreadAll.length < 5_000) unreadAll.push(`(no payee name) ${m.address}: ${redact(m.body).replace(/\n/g, ' ⏎ ')}`);
        }
      } else if (mandate?.event === 'executed' && mandate.amount !== undefined) {
        // "AutoPay of Rs 649 for NETFLIX executed": a payment the bank-alert parser doesn't word-match.
        txns.push({ at: m.date, direction: 'debit', amount: mandate.amount, counterparty: mandate.merchant, key: counterpartyKey(mandate.merchant), source: 'sms' });
        found++;
      } else if (mandate === null && looksLikeUnreadAlert(m)) {
        unreadCount++;
        const line = `${m.address}: ${redact(m.body).replace(/\n/g, ' ⏎ ')}`;
        if (unreadSamples.length < 5) unreadSamples.push(line);
        if (unreadAll.length < 5_000) unreadAll.push(line);
      }
    }
    files.push({ name: input.name, kind, records: messages.length, txns: found });
  }

  return {
    profile: buildProfile(txns, now, tzOffsetMinutes, mandates),
    txns,
    files,
    sensitive: sensitiveReport(hits),
    alarms,
    unreadSamples,
    unreadCount,
    unreadAll,
    scams,
    scamCount,
    unnamedCount,
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
    lines.push(
      f.kind === 'empty'
        ? `  ✗ ${f.name}: the file is empty. If it came from adb, check \`adb devices\` shows your phone as "device".`
        : f.kind === 'unknown'
          ? `  ✗ ${f.name}: format not recognised (skipped)`
          : `  ✓ ${f.name}: ${f.records} records → ${f.txns} transactions (${f.kind})`,
    );
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

  if (r.scamCount > 0) {
    lines.push(`⚠ LIKELY SCAM MESSAGES IN YOUR INBOX: ${r.scamCount}. Don't tap their links or call back.`);
    for (const s of r.scams) lines.push(`    · ${s}`);
    lines.push('  Report them on sancharsaathi.gov.in (Chakshu). They were not counted as bank alerts.', '');
  }

  lines.push('YOUR NORMAL');
  if (p.range !== null) lines.push(`  History: ${day(p.range.from)} → ${day(p.range.to)}`);
  lines.push(`  Payments: ${p.debits.count} · usual ${rupees(p.debits.p50)} · 90% under ${rupees(p.debits.p90)} · largest ${rupees(p.debits.max)}`);
  lines.push(`  Money in: ${p.credits.count} ${p.credits.count === 1 ? 'receipt' : 'receipts'}, ${rupees(p.credits.total)}`);
  lines.push(p.quietHours === null ? '  Quiet hours: not clear yet (needs more payments at varied times)' : `  Quiet hours: you rarely pay between ${hh(p.quietHours.from)} and ${hh(p.quietHours.to)}`);
  lines.push('  Most paid:');
  for (const x of p.payees.slice(0, 10)) lines.push(`    ${String(x.count).padStart(4)}×  ${x.name}  (usual ${rupees(x.median)}, max ${rupees(x.max)})`);
  lines.push(`  Payees in total: ${p.payees.length}`);
  if (r.unnamedCount > 0) lines.push(`  Payments whose alert named no payee: ${r.unnamedCount} (counted in amounts and hours only)`);

  lines.push('', ...formatSubscriptions(p));

  if (r.unreadCount > 0) {
    lines.push('', `? ${r.unreadCount} bank alerts could not be read. All of them (redacted) are in unread-alerts.txt. Samples:`);
    for (const s of r.unreadSamples) lines.push(`    ${s}`);
  }
  return lines.join('\n');
}

const shortDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

function formatSubscriptions(p: Profile): string[] {
  const lines: string[] = ['RECURRING PAYMENTS AND AUTOPAYS'];
  const active = p.subscriptions.filter((s) => s.status === 'active');
  if (p.subscriptions.length === 0 && p.autopays.length === 0) return [...lines, '  None found yet.'];

  const notes: string[] = [];
  for (const s of p.subscriptions) {
    if (s.priceChange) notes.push(`${s.name}: price changed ${rupees(s.priceChange.from)} → ${rupees(s.priceChange.to)} on ${shortDay(s.priceChange.at)}`);
    if (s.restartedAfterDays) notes.push(`${s.name}: charged again on ${shortDay(s.lastAt)} after ${s.restartedAfterDays} days without charges. Did you mean to restart it?`);
  }
  const lastSeen = p.range?.to ?? p.builtAt;
  for (const a of p.autopays) {
    if (a.status === 'active' && a.createdAt !== undefined && lastSeen - a.createdAt <= 30 * 86_400_000) {
      notes.push(`New autopay set up for ${displayMerchant(a.merchant)} on ${shortDay(a.createdAt)}${a.amount !== undefined ? ` (up to ${rupees(a.amount)})` : ''}. Recognise it?`);
    }
  }
  if (notes.length > 0) {
    lines.push('  Worth a look:');
    for (const n of notes) lines.push(`    ! ${n}`);
  }

  if (active.length > 0) {
    const perMonth = active.reduce((s, x) => s + x.monthly, 0);
    lines.push(`  Active: ${active.length} · about ${rupees(perMonth)} a month`);
    for (const s of active) lines.push(`    ${s.name}  ${rupees(s.usualAmount)} ${s.cycle} · next about ${shortDay(s.nextDueAt)}`);
  }
  const lapsed = p.subscriptions.filter((s) => s.status === 'lapsed');
  if (lapsed.length > 0) lines.push(`  Stopped: ${lapsed.map((s) => `${s.name} (last ${shortDay(s.lastAt)})`).join(', ')}`);
  const autopays = p.autopays.filter((a) => a.status === 'active');
  if (autopays.length > 0) {
    lines.push('  Active autopays (can take money without asking):');
    for (const a of autopays) {
      const when = a.nextDebitAt === undefined ? '' : a.nextDebitAt > lastSeen ? `next ${shortDay(a.nextDebitAt)}` : `last notice ${shortDay(a.nextDebitAt)}`;
      const bits = [a.amount !== undefined ? `up to ${rupees(a.amount)}` : '', a.frequency ?? '', when].filter(Boolean);
      const name = a.likelyMerchant !== undefined ? `${a.likelyMerchant} (likely; hidden ID …@${a.merchant.split('@')[1]})` : displayMerchant(a.merchant);
      lines.push(`    ${name}${bits.length ? ` · ${bits.join(' · ')}` : ''}`);
    }
  }
  const dormant = p.autopays.filter((a) => a.status === 'dormant');
  if (dormant.length > 0) {
    lines.push(`  Older autopays with no message for 60+ days: ${dormant.length}. Check in your UPI app that they are cancelled.`);
  }
  return lines;
}
