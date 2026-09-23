// Turns export files into your profile and a report. Pure except for the
// file list it is given; the command-line wrapper is scripts/import.ts.

import { buildProfile, mergeDuplicates, type Profile } from '../profile.ts';
import { redact, scanSensitive, sensitiveReport, type SensitiveHit, type SensitiveReport } from './sensitive.ts';
import { detectSubscriptions, displayMerchant, sameMerchant, type MandateEvent, type Subscription } from '../subscriptions.ts';
import { checkPhone, isPhoneDump, type PhoneCheck } from './phone.ts';
import {
  contactNames, isCallLogDump, isContactsDump, isUsageDump, parseCallLog, parseContacts, summariseCalls, summariseUsage,
  type Call, type CallSummary, type Contact, type ScreenSummary,
} from './people.ts';
import { isMailSummary, type MailSummary } from './mail.ts';
import { looksLikeUnreadAlert, parseAdbSms, parseBankAlert, parseMandateAlert, parseSmsBackupXml } from './sms.ts';
import { classifyPackages, isPackageList, type InstalledApps } from './apps.ts';
import { looksLikeScam } from './scam.ts';
import { parseGooglePayActivity } from './takeout.ts';
import { counterpartyKey, type Sms, type Txn } from './types.ts';

export type SourceKind =
  | 'adb_sms'
  | 'sms_backup_xml'
  | 'google_pay_takeout'
  | 'android_packages'
  | 'android_phone'
  | 'android_contacts'
  | 'android_calls'
  | 'android_usage'
  | 'gmail_summary'
  | 'empty'
  | 'unknown';

export function detectSource(text: string): SourceKind {
  const head = text.trimStart().slice(0, 2000);
  if (head === '') return 'empty';
  if (isPhoneDump(head)) return 'android_phone';
  if (isUsageDump(head)) return 'android_usage';
  if (isMailSummary(head)) return 'gmail_summary';
  if (isContactsDump(head)) return 'android_contacts';
  if (isCallLogDump(head)) return 'android_calls';
  if (/^Row: \d+ /.test(head)) return 'adb_sms';
  if (isPackageList(head)) return 'android_packages';
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
  /** The largest payments each way, after merging duplicates: for checking the totals. */
  readonly biggest: { readonly out: readonly Txn[]; readonly in: readonly Txn[] };
  readonly phone?: PhoneCheck;
  readonly calls?: CallSummary;
  readonly screen?: ScreenSummary;
  readonly mail?: MailSummary;
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
  let apps: InstalledApps | undefined;
  let phone: PhoneCheck | undefined;
  let mail: MailSummary | undefined;
  const contacts: Contact[] = [];
  const calls: Call[] = [];
  const usage: string[] = [];

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
    if (kind === 'android_packages') {
      apps = classifyPackages(input.text);
      files.push({ name: input.name, kind, records: apps.total, txns: 0 });
      continue;
    }
    if (kind === 'android_phone') {
      phone = checkPhone(input.text);
      files.push({ name: input.name, kind, records: phone.apps, txns: 0 });
      continue;
    }
    if (kind === 'android_contacts' || kind === 'android_calls') {
      const n = kind === 'android_contacts' ? contacts.push(...parseContacts(input.text)) : calls.push(...parseCallLog(input.text));
      files.push({ name: input.name, kind, records: n, txns: 0 });
      continue;
    }
    if (kind === 'android_usage') {
      usage.push(input.text);
      files.push({ name: input.name, kind, records: 1, txns: 0 });
      continue;
    }
    if (kind === 'gmail_summary') {
      mail = JSON.parse(input.text) as MailSummary;
      files.push({ name: input.name, kind, records: mail.messages, txns: 0 });
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

  const base = buildProfile(txns, now, tzOffsetMinutes, mandates);
  const screen = usage.length > 0 ? summariseUsage(usage) : undefined;
  const people = contacts.length > 0 ? contactNames(contacts) : undefined;
  return {
    profile: {
      ...base,
      ...(mail !== undefined ? { subscriptions: withMailSubscriptions(base.subscriptions, mail) } : {}),
      ...(apps !== undefined ? { apps } : {}),
      ...(people !== undefined ? { people } : {}),
      ...(screen?.offHours ? { screenOff: screen.offHours } : {}),
    },
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
    biggest: biggestEachWay(txns),
    ...(phone !== undefined ? { phone } : {}),
    ...(calls.length > 0 ? { calls: summariseCalls(calls, contacts) } : {}),
    ...(screen !== undefined ? { screen } : {}),
    ...(mail !== undefined ? { mail } : {}),
  };
}

/**
 * Subscriptions seen only in mail (cards, app stores and foreign services
 * often send no SMS) join the ones found in bank alerts. Only merchants whose
 * receipts say subscription, membership or renewal, in rupees, are used:
 * a foreign-currency amount can't be compared with a rupee charge.
 */
export function withMailSubscriptions(fromSms: readonly Subscription[], mail: MailSummary): Subscription[] {
  const recurring = new Set(mail.receipts.filter((r) => r.recurring).map((r) => r.merchant));
  const txns: Txn[] = mail.receipts
    .filter((r) => r.currency === 'INR' && recurring.has(r.merchant))
    .map((r) => ({ at: r.at, direction: 'debit', amount: r.amount, counterparty: r.merchant, key: counterpartyKey(r.merchant), source: 'gmail' }));
  const found = detectSubscriptions(txns, mail.range?.to ?? mail.builtAt)
    .filter((s) => !fromSms.some((x) => sameMerchant(x.name, s.name)))
    .map((s): Subscription => ({ ...s, from: 'mail' }));
  return [...fromSms, ...found].sort((a, b) => b.monthly - a.monthly);
}

function biggestEachWay(txns: readonly Txn[]): ImportResult['biggest'] {
  const merged = mergeDuplicates(txns);
  const top = (dir: Txn['direction']) => merged.filter((t) => t.direction === dir).sort((a, b) => b.amount - a.amount).slice(0, 5);
  return { out: top('debit'), in: top('credit') };
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
          : f.kind === 'android_packages'
            ? `  ✓ ${f.name}: ${f.records} installed apps`
            : f.kind === 'android_phone'
              ? `  ✓ ${f.name}: phone check, ${f.records} apps you installed`
              : f.kind === 'android_contacts'
                ? `  ✓ ${f.name}: ${f.records} contact numbers`
                : f.kind === 'android_calls'
                  ? `  ✓ ${f.name}: ${f.records} calls`
                  : f.kind === 'android_usage'
                    ? `  ✓ ${f.name}: screen time`
                    : f.kind === 'gmail_summary'
                      ? `  ✓ ${f.name}: ${f.records} mails (summary from npm run mail)`
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

  lines.push(...formatPhone(r.phone));
  lines.push(...formatApps(r.profile.apps));

  lines.push('YOUR NORMAL');
  if (p.range !== null) lines.push(`  History: ${day(p.range.from)} → ${day(p.range.to)}`);
  lines.push(`  Payments: ${p.debits.count} · usual ${rupees(p.debits.p50)} · 90% under ${rupees(p.debits.p90)} · largest ${rupees(p.debits.max)}`);
  lines.push(`  Money in: ${p.credits.count} ${p.credits.count === 1 ? 'receipt' : 'receipts'}, ${rupees(p.credits.total)}`);
  lines.push(p.quietHours === null ? '  Quiet hours: not clear yet (needs more payments at varied times)' : `  Quiet hours: you rarely pay between ${hh(p.quietHours.from)} and ${hh(p.quietHours.to)}`);
  lines.push('  Most paid:');
  for (const x of p.payees.slice(0, 10)) lines.push(`    ${String(x.count).padStart(4)}×  ${x.name}  (usual ${rupees(x.median)}, max ${rupees(x.max)})`);
  lines.push(`  Payees in total: ${p.payees.length}`);
  if (r.unnamedCount > 0) lines.push(`  Payments whose alert named no payee: ${r.unnamedCount} (counted in amounts and hours only)`);
  const big = (t: Txn) => `${rupees(t.amount)} ${t.direction === 'debit' ? 'to' : 'from'} ${t.unnamed ? '(no name)' : t.counterparty} on ${day(t.at)}`;
  if (r.biggest.out.length > 0) lines.push(`  Biggest out: ${r.biggest.out.map(big).join(' · ')}`);
  if (r.biggest.in.length > 0) lines.push(`  Biggest in:  ${r.biggest.in.map(big).join(' · ')}`);

  lines.push('', ...formatSubscriptions(p));
  lines.push(...formatPeople(r.calls, r.screen));
  lines.push(...formatMail(r.mail));

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
    for (const s of active) lines.push(`    ${s.name}  ${rupees(s.usualAmount)} ${s.cycle} · next about ${shortDay(s.nextDueAt)}${s.from === 'mail' ? ' (from mail receipts)' : ''}`);
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

function formatApps(apps: InstalledApps | undefined): string[] {
  if (apps === undefined) return [];
  const lines: string[] = [];
  if (apps.remote_access.length > 0) {
    lines.push(`⚠ SCREEN-SHARING APP INSTALLED: ${apps.remote_access.join(', ')}.`,
      '  Scammers ask people to install these to take over the phone. Uninstall unless you use it for work.', '');
  }
  lines.push('YOUR PHONE');
  const list = (xs: readonly string[]) => (xs.length === 0 ? 'none found' : xs.join(', '));
  lines.push(`  Payment apps: ${list(apps.payment)}`, `  Bank apps: ${list(apps.bank)}`, `  Crypto apps: ${list(apps.crypto)}`, '');
  return lines;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function formatPhone(c: PhoneCheck | undefined): string[] {
  if (c === undefined) return [];
  const lines: string[] = [];
  const serious = c.findings.filter((f) => f.level === 'serious');
  lines.push(serious.length > 0 ? `⚠ PHONE CHECK: ${serious.length} serious` : '✓ PHONE CHECK: nothing serious');
  for (const f of c.findings) lines.push(`    ${f.level === 'serious' ? '!!' : ' ·'} ${f.text}`);
  lines.push(`  Apps you installed: ${c.apps} · not from the Play Store: ${c.notFromPlay.length} · default SMS app: ${c.smsApp ?? 'unknown'}`);
  if (c.drawOverApps.length > 0) lines.push(`  Can draw over other apps (fake screens on top of your bank app): ${c.drawOverApps.length}`);
  lines.push('');
  return lines;
}

function formatPeople(calls: CallSummary | undefined, screen: ScreenSummary | undefined): string[] {
  const lines: string[] = [];
  if (calls !== undefined) {
    lines.push('', 'PEOPLE AND CALLS');
    lines.push(`  Calls: ${calls.calls}${calls.range ? `, ${day(calls.range.from)} → ${day(calls.range.to)}` : ''} · contacts: ${calls.contacts}`);
    lines.push(`  Calls to you from people in your contacts: ${pct(calls.incomingFromContacts)} · from unknown numbers: ${calls.unknownIncoming}`);
    if (calls.persistentUnknown.length > 0) {
      lines.push('  Unknown numbers that keep calling (block them if you don\'t know them):');
      for (const u of calls.persistentUnknown) lines.push(`    ${u.number}  ${u.calls} calls, last ${day(u.last)}`);
    }
    if (calls.topPeople.length > 0) lines.push(`  Talk to most: ${calls.topPeople.slice(0, 5).map((x) => x.name).join(', ')}`);
  }
  if (screen !== undefined) {
    lines.push('', 'SCREEN TIME');
    lines.push(`  Days recorded: ${screen.days} (grows with each sync; Android keeps only the last few days)`);
    lines.push(screen.offHours ? `  Usually off your phone: ${hh(screen.offHours.from)}–${hh(screen.offHours.to)}` : '  Off-phone hours: not clear yet (needs 3+ full days)');
    if (screen.topApps.length > 0) lines.push(`  Most used: ${screen.topApps.slice(0, 5).map((a) => `${a.app} ${a.hours} h`).join(' · ')}`);
  }
  return lines;
}

function formatMail(m: MailSummary | undefined): string[] {
  if (m === undefined) return [];
  const lines = ['', 'MAIL'];
  lines.push(`  Read: ${m.messages.toLocaleString('en-IN')} mails${m.range ? `, ${day(m.range.from)} → ${day(m.range.to)}` : ''}`);
  if (m.alarms.length > 0 || m.sensitive.some((s) => s.kind !== 'otp')) {
    lines.push('  ⚠ Confidential data in mail (masked here):');
    for (const s of m.sensitive) lines.push(`    ${String(s.count).padStart(5)}  ${s.kind.replace('_', ' ')}`);
    for (const a of m.alarms) lines.push(`    · ${a}`);
  }
  const byMerchant = new Map<string, { n: number; total: number; currency: string; last: number }>();
  for (const r of m.receipts) {
    const k = `${r.merchant}|${r.currency}`;
    const e = byMerchant.get(k) ?? { n: 0, total: 0, currency: r.currency, last: 0 };
    byMerchant.set(k, { n: e.n + 1, total: e.total + r.amount, currency: r.currency, last: Math.max(e.last, r.at) });
  }
  const money = (n: number, c: string) => (c === 'INR' ? rupees(n) : `${c} ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  lines.push(`  Receipts: ${m.receipts.length} from ${byMerchant.size} merchants. Most often:`);
  for (const [k, e] of [...byMerchant.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) {
    lines.push(`    ${String(e.n).padStart(4)}×  ${k.split('|')[0]}  ${money(e.total, e.currency)} in total, last ${day(e.last)}`);
  }
  const foreign = [...new Set(m.receipts.filter((r) => r.recurring && r.currency !== 'INR').map((r) => `${r.merchant} (${r.currency})`))];
  if (foreign.length > 0) lines.push(`  Foreign-currency subscriptions: ${foreign.join(', ')}`);
  const recentTrials = m.trialsEnding.filter((t) => (m.range?.to ?? 0) - t.at < 60 * 86_400_000);
  if (recentTrials.length > 0) lines.push(`  Free trials ending recently (a charge follows): ${recentTrials.map((t) => `${t.merchant} ${day(t.at)}`).join(', ')}`);
  const trips = m.bookings.filter((b) => !b.cancelled);
  lines.push(`  Travel bookings: ${trips.length}${m.bookings.length > trips.length ? ` (+${m.bookings.length - trips.length} cancelled)` : ''}`);
  const years = new Map<string, number>();
  for (const b of trips) years.set(day(b.travelAt ?? b.at).slice(0, 4), (years.get(day(b.travelAt ?? b.at).slice(0, 4)) ?? 0) + 1);
  if (years.size > 0) lines.push(`    by year: ${[...years.entries()].sort().map(([y, n]) => `${y}: ${n}`).join(' · ')}`);
  const kinds = new Map<string, number>();
  for (const b of trips) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
  if (kinds.size > 0) lines.push(`    by kind: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  const routes = new Map<string, number>();
  for (const b of trips) if (b.route) routes.set(b.route, (routes.get(b.route) ?? 0) + 1);
  if (routes.size > 0) lines.push(`    top routes: ${[...routes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, n]) => `${r} (${n})`).join(', ')}`);
  const latest = [...trips].sort((a, b) => (b.travelAt ?? b.at) - (a.travelAt ?? a.at)).slice(0, 5);
  for (const b of latest) lines.push(`    ${day(b.travelAt ?? b.at)}  ${b.kind}  ${b.provider}${b.route ? `  ${b.route}` : ''}`);
  return lines;
}

/** One line per distinct format: digits and long codes don't make two lines different. */
function varied(lines: readonly string[], max: number): string[] {
  const seen = new Map<string, string>();
  for (const l of lines) {
    const shape = l.replace(/\d+/g, '9').replace(/[A-Z0-9•]{5,}/g, 'X').slice(0, 70);
    if (!seen.has(shape)) seen.set(shape, l);
    if (seen.size >= max) break;
  }
  return [...seen.values()];
}

/**
 * What the import could not understand, masked, for pasting into the
 * conversation that improves the readers (private/feedback.txt). Contains no
 * unmasked confidential data, no contact names and no full phone numbers.
 */
export function formatFeedback(r: ImportResult, inputs: readonly ImportInput[]): string {
  const out: string[] = ['ACTION LOCK · FEEDBACK (safe to paste: confidential items are masked)', ''];
  const kinds = new Set(r.files.map((f) => f.kind));
  out.push(`Files: ${r.files.map((f) => `${f.name}=${f.kind}:${f.records}`).join(' · ')}`, '');

  const noName = r.unreadAll.filter((l) => l.startsWith('(no payee name)'));
  const unread = r.unreadAll.filter((l) => !l.startsWith('(no payee name)'));
  out.push(`SMS: ${r.txns.length} transactions · ${r.unreadCount} bank alerts not read · ${r.unnamedCount} with no payee name`);
  for (const l of varied(unread, 30)) out.push(`  ? ${l.slice(0, 300)}`);
  if (noName.length > 0) out.push('  No payee name (different formats):');
  for (const l of varied(noName, 10)) out.push(`  ? ${l.slice(0, 300)}`);
  out.push('');

  if (!kinds.has('android_phone')) out.push('PHONE CHECK: the phone did not share app details.');
  else if (r.phone !== undefined) {
    const c = r.phone;
    out.push(`PHONE CHECK: ${c.apps} apps · not from Play ${c.notFromPlay.length} · accessibility ${c.accessibility.length} · notification readers ${c.notificationReaders.length} · SMS readers ${c.readSms.length} · admins ${c.deviceAdmins.length} · draw-over ${c.drawOverApps.length} · install ${c.installApps.length} · apk files ${c.apkFiles.length} · sms app ${c.smsApp ?? 'unknown'}`);
    if (c.apps === 0) {
      const dump = inputs.find((i) => detectSource(i.text) === 'android_phone')?.text ?? '';
      out.push('  No apps read. Start of the dump:', ...dump.split('\n').slice(0, 15).map((l) => `  | ${l.slice(0, 160)}`));
    }
  }
  out.push('');

  for (const [kind, label] of [['android_contacts', 'Contacts'], ['android_calls', 'Call log']] as const) {
    const f = r.files.find((x) => x.kind === kind);
    if (f === undefined) out.push(`${label}: not shared by the phone.`);
    else {
      const raw = inputs.find((i) => i.name === f.name)?.text ?? '';
      const rows = (raw.match(/^Row: \d+ /gm) ?? []).length;
      out.push(`${label}: ${f.records} read of ${rows} rows`);
      if (rows > 0 && f.records < rows * 0.9) {
        // Show the layout, not the data: values replaced by their length.
        const first = raw.split('\n').find((l) => l.startsWith('Row:')) ?? '';
        out.push(`  Layout: ${first.replace(/=([^,]*)/g, (_, v: string) => `=<${v.trim().length}>`)}`);
      }
    }
  }
  if (r.calls) out.push(`  calls ${r.calls.calls} · from contacts ${pct(r.calls.incomingFromContacts)} · unknown incoming ${r.calls.unknownIncoming}`);
  out.push('');

  if (r.screen === undefined) out.push('SCREEN TIME: not shared by the phone.');
  else {
    out.push(`SCREEN TIME: ${r.screen.events} events · ${r.screen.days} days · apps with totals ${r.screen.topApps.length} · off-phone ${r.screen.offHours ? `${hh(r.screen.offHours.from)}–${hh(r.screen.offHours.to)}` : 'not yet'}`);
    out.push(`  on the phone by hour (share of days): ${r.screen.byHour.map((x) => Math.round(x * 9)).join('')}`);
    if (r.screen.events === 0 || r.screen.topApps.length === 0) {
      const dump = inputs.filter((i) => detectSource(i.text) === 'android_usage').pop()?.text ?? '';
      const all = dump.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('##orb'));
      const hinted = all.filter((l) => /time=|totalTime|package=|stats|events|RESUMED|FOREGROUND/i.test(l));
      const sample = hinted.length > 0 ? hinted : all;
      out.push('  Format not fully read. Sample lines:', ...varied(sample, 20).map((l) => `  | ${l.trim().slice(0, 200)}`));
    }
  }
  out.push('');

  if (r.mail === undefined) out.push('MAIL: not imported yet (npm run mail).');
  else {
    out.push(`MAIL: ${r.mail.messages} mails · ${r.mail.receipts.length} receipts · ${r.mail.bookings.length} bookings · ${r.mail.skipped} unreadable`);
    if (r.mail.missed && r.mail.missed.receipts.length > 0) out.push('  Looked like receipts, no amount found:', ...r.mail.missed.receipts.map((l) => `  ? ${l}`));
    if (r.mail.missed && r.mail.missed.bookings.length > 0) out.push('  From travel companies, not read as bookings:', ...r.mail.missed.bookings.map((l) => `  ? ${l}`));
  }
  return out.join('\n');
}

/** A few lines for `npm run sync`; the full report goes to a file. */
export function formatSummary(r: ImportResult): string {
  const p = r.profile;
  const lines = [
    `Synced: ${r.txns.length.toLocaleString('en-IN')} transactions from ${r.files.filter((f) => f.kind === 'adb_sms' || f.kind === 'sms_backup_xml' || f.kind === 'google_pay_takeout').reduce((s, f) => s + f.records, 0).toLocaleString('en-IN')} messages` +
      (p.range ? `, ${day(p.range.from)} → ${day(p.range.to)}` : ''),
    `Your normal: usual ${rupees(p.debits.p50)} · 90% under ${rupees(p.debits.p90)} · ${p.payees.length.toLocaleString('en-IN')} payees` +
      (p.quietHours ? ` · quiet ${hh(p.quietHours.from)}–${hh(p.quietHours.to)}` : ''),
    `Recurring: ${p.subscriptions.filter((s) => s.status === 'active').length} subscriptions · ${p.autopays.filter((a) => a.status === 'active').length} active autopays`,
  ];
  if (p.apps) lines.push(`Phone: ${p.apps.payment.length} payment · ${p.apps.bank.length} bank · ${p.apps.crypto.length} crypto apps`);
  if (r.phone) {
    const serious = r.phone.findings.filter((f) => f.level === 'serious').length;
    lines.push(`Phone check: ${serious > 0 ? `${serious} serious · ` : 'nothing serious · '}${r.phone.findings.length - serious} to look at · ${r.phone.notFromPlay.length} apps not from the Play Store`);
  }
  if (r.calls) lines.push(`Calls: ${r.calls.calls} · ${pct(r.calls.incomingFromContacts)} of calls to you from contacts · ${r.calls.persistentUnknown.length} unknown numbers keep calling`);
  if (r.screen) lines.push(r.screen.offHours ? `Screen: usually off ${hh(r.screen.offHours.from)}–${hh(r.screen.offHours.to)} (${r.screen.days} days)` : `Screen: ${r.screen.days} days recorded; off-phone hours need 3+ full days`);
  if (r.mail) {
    const trips = r.mail.bookings.filter((b) => !b.cancelled).length;
    const fromMail = p.subscriptions.filter((s) => s.from === 'mail' && s.status === 'active').length;
    lines.push(`Mail: ${r.mail.messages.toLocaleString('en-IN')} mails · ${r.mail.receipts.length} receipts · ${fromMail} more subscriptions · ${trips} travel bookings`);
  }
  const warn: string[] = [];
  if (r.phone?.findings.some((f) => f.level === 'serious')) warn.push('phone check found an app to remove (see report)');
  if (r.mail && r.mail.alarms.length > 0) warn.push('passwords or keys sitting in mail');
  if (p.apps && p.apps.remote_access.length > 0) warn.push(`screen-sharing app installed (${p.apps.remote_access.join(', ')})`);
  if (r.scamCount > 0) warn.push(`${r.scamCount} likely scam messages`);
  if (r.sensitive.byKind.some((k) => k.kind === 'password' || k.kind === 'recovery_phrase' || k.kind === 'private_key')) warn.push('passwords or keys sitting in SMS');
  if (warn.length > 0) lines.push(`⚠ ${warn.join(' · ')}`);
  return lines.join('\n');
}
