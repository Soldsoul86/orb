// The Orb app screen (imperative shell). Reads the phone through the Android
// bridge, builds the twin with the tested core, and shows it. Bundled into
// android/app/src/main/assets/index.html by `npm run build:android`.

import { runImport, type ImportInput, type ImportResult } from '../import/run.ts';
import { answer, buildTwin, type AnswerEvent, type Entity, type Question, type Twin } from './twin.ts';
import { demoSources } from './demo.ts';
import { buildGuardTable } from './guard.ts';
import { dataMap } from './datamap.ts';
import { baselineFacts, baselinePrompt, inferenceRecord, routeModel, rulesBaseline, type GuardSummary, type InferenceRecord, type MaskedFacts, type ModelInfo } from './reason.ts';

interface Access {
  sms: boolean;
  calls: boolean;
  contacts: boolean;
  usage: boolean;
}

interface OrbNative {
  access(): string;
  requestAccess(): void;
  requestUsageAccess(): void;
  read(source: string): string;
  loadAnswers(): string;
  appendAnswer(json: string): void;
  saveProfile(json: string): void;
  saveGuard(json: string): void;
  guardOn(): boolean;
  openGuardSettings(): void;
  guardLog(): string;
  modelStatus(): string;
  modelDownload(): void;
  modelGenerate(id: string, prompt: string): void;
  shareText(text: string): void;
  clipboardText(): string;
  loadReasoning(): string;
  appendReasoning(json: string): void;
  guardUnread(): string;
  clearGuardUnread(): void;
  guardSeen(): string;
  messageGuardOn(): boolean;
  setMessageGuard(on: boolean): void;
}

/** In a browser there is no phone: invented sample data, answers kept in this tab. */
let reasoningLog = '';

function browserNative(): OrbNative {
  const sources = demoSources(Date.now());
  let answers = '';
  try {
    answers = localStorage.getItem('orb.answers') ?? '';
  } catch {
    /* storage may be unavailable */
  }
  return {
    access: () => JSON.stringify({ sms: true, calls: true, contacts: true, usage: false }),
    requestAccess: () => {},
    requestUsageAccess: () => {},
    read: (s) => sources[s] ?? '',
    loadAnswers: () => answers,
    appendAnswer: (json) => {
      answers += json + '\n';
      try {
        localStorage.setItem('orb.answers', answers);
      } catch {
        /* ignore */
      }
    },
    saveProfile: () => {},
    saveGuard: () => {},
    guardOn: () => false,
    openGuardSettings: () => {},
    guardLog: () => '',
    modelStatus: () => 'unavailable',
    modelDownload: () => {},
    modelGenerate: () => {},
    shareText: () => {},
    clipboardText: () => '',
    loadReasoning: () => reasoningLog,
    appendReasoning: (json) => {
      reasoningLog += json + '\n';
    },
    guardUnread: () => '',
    clearGuardUnread: () => {},
    guardSeen: () => '{}',
    messageGuardOn: () => false,
    setMessageGuard: () => {},
  };
}

const native: OrbNative = (globalThis as unknown as { AndroidOrb?: OrbNative }).AndroidOrb ?? browserNative();
const isPhone = (globalThis as unknown as { AndroidOrb?: OrbNative }).AndroidOrb !== undefined;

type Tab = 'today' | 'ask' | 'people' | 'money' | 'phone';
const state: {
  tab: Tab;
  result: ImportResult | null;
  answers: AnswerEvent[];
  twin: Twin | null;
  person: string | null;
  search: string;
  skipped: Set<string>;
  status: string;
  records: InferenceRecord[];
  thinking: string | null;
  cloud: { facts: MaskedFacts; approvedAt?: number } | null;
  showLog: boolean;
  writing: string | null;
  showUnread: boolean;
} = { tab: 'today', result: null, answers: [], twin: null, person: null, search: '', skipped: new Set(), status: '', writing: null, showUnread: false, records: [], thinking: null, cloud: null, showLog: false };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const date = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function loadAnswers(): AnswerEvent[] {
  return native
    .loadAnswers()
    .split('\n')
    .filter((l) => l.trim() !== '')
    .flatMap((l) => {
      try {
        const e = JSON.parse(l) as AnswerEvent;
        return e.kind === 'answer' ? [e] : [];
      } catch {
        return [];
      }
    });
}

function access(): Access {
  return JSON.parse(native.access()) as Access;
}

/** Reads every source the phone allows, then builds the twin. Yields between steps so the status shows. */
async function sync(): Promise<void> {
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const inputs: ImportInput[] = [];
  const labels: Record<string, string> = { sms: 'messages', calls: 'calls', contacts: 'contacts', apps: 'apps', phone: 'app permissions', usage: 'screen time' };
  for (const source of ['sms', 'contacts', 'calls', 'apps', 'phone', 'usage']) {
    state.status = `Reading ${labels[source]}…`;
    render();
    await tick();
    const text = native.read(source);
    if (text.trim() !== '') inputs.push({ name: `${source}.txt`, text });
  }
  state.status = 'Understanding…';
  render();
  await tick();
  state.result = runImport(inputs, Date.now());
  // The lock judges payments against this profile: kept up to date from the phone itself.
  native.saveProfile(JSON.stringify(state.result.profile));
  rebuild();
  state.status = '';
  render();
}

function rebuild(): void {
  if (state.result === null) return;
  state.answers = loadAnswers();
  state.twin = buildTwin(state.result, state.answers, Date.now());
  // The pay guard reads this table; it changes with every answer (e.g. someone confirmed as family).
  native.saveGuard(JSON.stringify(buildGuardTable(state.result.profile, state.twin, Date.now())));
  state.records = loadRecords();
  // The weekly baseline: once a week, on the phone's own model if it has one, else by rules.
  const last = latestBaseline();
  if (state.thinking === null && (last === undefined || Date.now() - last.at > 7 * 86_400_000)) refreshInsights();
}

// ── Reasoning: Orb's weekly notes, the models behind them, and their log ──

const NANO: ModelInfo = { kind: 'on_device', provider: 'Google AICore', name: 'Gemini Nano' };
const CLOUD: ModelInfo = { kind: 'cloud', provider: 'the AI app you shared to', name: 'cloud model' };

function loadRecords(): InferenceRecord[] {
  return native
    .loadReasoning()
    .split('\n')
    .flatMap((l) => {
      try {
        const e = JSON.parse(l) as InferenceRecord;
        return e.kind === 'inference' ? [e] : [];
      } catch {
        return [];
      }
    });
}

function guardWeek(now: number): GuardSummary {
  const events = native
    .guardLog()
    .split('\n')
    .flatMap((l) => {
      try {
        return l.trim() === '' ? [] : [JSON.parse(l) as { at: number; outcome: string; kind?: string }];
      } catch {
        return [];
      }
    })
    .filter((e) => e.at >= now - 7 * 86_400_000);
  return {
    paused: events.filter((e) => e.outcome === 'shown' && e.kind !== 'message').length,
    notPaid: events.filter((e) => e.outcome === 'cancelled' && e.kind !== 'message').length,
    messagesPaused: events.filter((e) => e.outcome === 'shown' && e.kind === 'message').length,
  };
}

function facts(): MaskedFacts | null {
  if (state.result === null || state.twin === null) return null;
  return baselineFacts(state.result, state.twin, Date.now(), guardWeek(Date.now()));
}

function keep(rec: InferenceRecord): void {
  native.appendReasoning(JSON.stringify(rec));
  state.records = loadRecords();
}

/** Runs the weekly baseline on the phone's model, or on rules if there is none. */
function refreshInsights(): void {
  const f = facts();
  if (f === null) return;
  const model = routeModel(native.modelStatus() === 'available' ? NANO : null, false, CLOUD);
  if (model.kind === 'rules') {
    const now = Date.now();
    keep({ kind: 'inference', id: `i${now}`, at: now, task: 'weekly_baseline', template: 'rules', model, prompt: '', reply: '', proposals: rulesBaseline(state.result!, now) });
    render();
    return;
  }
  const id = `m${Date.now()}`;
  state.thinking = id;
  pendingFacts.set(id, f);
  render();
  native.modelGenerate(id, baselinePrompt(f));
}

const pendingFacts = new Map<string, MaskedFacts>();

function latestBaseline(): InferenceRecord | undefined {
  return [...state.records].reverse().find((r) => r.task === 'weekly_baseline');
}

function insightsCard(): string {
  const latest = latestBaseline();
  const status = native.modelStatus();
  const by = (r: InferenceRecord) =>
    r.model.kind === 'on_device' ? `${r.model.name} on this phone` : r.model.kind === 'cloud' ? `a cloud AI you approved (${new Date(r.approvedAt ?? r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })})` : "Orb's rules (no model)";
  const cloud = state.cloud;
  return `
    <h2>This week, by Orb</h2>
    <div class="card">
      ${state.thinking ? '<p class="meta">Thinking on this phone…</p>' : ''}
      ${
        latest === undefined
          ? '<p class="meta">No notes yet.</p>'
          : latest.proposals.length === 0
            ? '<p class="meta">Nothing unusual this week.</p>'
            : latest.proposals.map((p) => `<p>${p.kind === 'question' ? '? ' : '• '}${esc(p.text)}</p>`).join('')
      }
      ${latest ? `<p class="meta">By ${esc(by(latest))}, ${new Date(latest.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. <button class="link" data-log="1">How Orb reasoned</button></p>` : ''}
      <p class="meta">On-device model: ${status === 'available' ? 'ready' : status === 'downloadable' ? 'can be downloaded by Android' : status === 'downloading' ? 'downloading…' : status === 'checking' ? 'checking…' : 'not supported on this phone'}.</p>
      <div class="opts">
        <button class="opt" data-insight="1">${status === 'available' ? 'Refresh on this phone' : 'Refresh with rules'}</button>
        ${status === 'downloadable' ? '<button class="opt" data-download="1">Download on-device model</button>' : ''}
        <button class="opt" data-cloud="1">Ask a cloud AI…</button>
      </div>
      ${
        cloud
          ? `<div class="cloud">
              <p><b>Exactly this will be sent</b>, by the AI app you pick. People are replaced by labels; only this phone knows who they are.</p>
              <pre class="unread">${esc(baselinePrompt(cloud.facts))}</pre>
              ${
                cloud.approvedAt === undefined
                  ? '<button class="primary" data-approve="1">Approve and choose AI app</button><button class="link" data-cancelcloud="1">Cancel</button>'
                  : '<p class="meta">Copy the AI\'s whole answer, come back, then:</p><button class="primary" data-paste="1">Paste the answer</button><button class="link" data-cancelcloud="1">Cancel</button>'
              }
            </div>`
          : ''
      }
    </div>`;
}

function logView(): string {
  const recs = [...state.records].reverse();
  return `
    <button class="link" data-closelog="1">← Today</button>
    <h2>How Orb reasoned</h2>
    <p class="meta">Every time a model was asked: which one, exactly what it was given (masked), what it said, and what Orb took from it. Kept on this phone as history.</p>
    ${recs
      .map(
        (r) => `<details class="card">
          <summary><span class="row"><span>${esc(r.task.replace('_', ' '))} · ${esc(r.model.kind === 'rules' ? 'rules' : `${r.model.name} (${r.model.kind === 'on_device' ? 'on this phone' : 'cloud, approved'})`)}</span><span class="meta">${new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span></summary>
          ${r.approvedAt ? `<p class="meta">You approved sending at ${new Date(r.approvedAt).toLocaleString('en-IN')}.</p>` : ''}
          ${r.prompt ? `<p class="meta">Given:</p><pre class="unread">${esc(r.prompt)}</pre>` : '<p class="meta">No model: fixed rules over your data.</p>'}
          ${r.reply ? `<p class="meta">Replied:</p><pre class="unread">${esc(r.reply)}</pre>` : ''}
          <p class="meta">Orb took: ${r.proposals.length === 0 ? 'nothing (no valid notes)' : r.proposals.map((p) => esc(p.text)).join(' · ')}</p>
        </details>`,
      )
      .join('') || '<p class="meta">Nothing yet.</p>'}`;
}


function give(question: string, value: string): void {
  const e = answer(question, value, Date.now(), state.answers.length);
  native.appendAnswer(JSON.stringify(e));
  rebuild();
  render();
}

// ── Views ──────────────────────────────────────────────────────────────────

function questionCard(q: Question, current?: string): string {
  const own = current?.startsWith('note:') ? current.slice(5) : undefined;
  const writing = state.writing === q.id;
  return `<div class="card q">
    <p class="qtext">${esc(q.text)}</p>
    <p class="meta">Because ${esc(q.because)}.</p>
    <div class="opts">${q.options
      .map((o) => `<button class="opt${o.value === current ? ' on' : ''}" data-q="${esc(q.id)}" data-v="${esc(o.value)}">${esc(o.label)}</button>`)
      .join('')}<button class="opt${own !== undefined ? ' on' : ''}" data-write="${esc(q.id)}">${own !== undefined ? `“${esc(own)}”` : 'In my words…'}</button></div>
    ${writing ? `<div class="write"><input id="note" type="text" maxlength="120" placeholder="e.g. my cousin, pays half the rent" value="${esc(own ?? '')}"><button class="primary" data-note="${esc(q.id)}">Save</button></div>` : ''}
    ${current === undefined ? `<button class="link" data-skip="${esc(q.id)}">Not now</button>` : ''}
  </div>`;
}

function nextQuestion(t: Twin): Question | undefined {
  return t.questions.find((q) => !state.skipped.has(q.id));
}

function today(t: Twin): string {
  if (state.showLog) return logView();
  const q = nextQuestion(t);
  const icon: Record<string, string> = { money: '₹', due: '⏰', security: '⚠', question: '?' };
  return `
    <h2>Today</h2>
    ${t.brief.length === 0 ? '<div class="card meta">Nothing needs you today.</div>' : ''}
    ${t.brief.map((b) => `<div class="card brief ${b.kind}"><span class="ic">${icon[b.kind]}</span><span>${esc(b.text)}</span></div>`).join('')}
    ${q ? `<h2>One question</h2>${questionCard(q)}` : ''}
    ${insightsCard()}
    ${sensitiveNote()}`;
}

function sensitiveNote(): string {
  const r = state.result;
  if (r === null) return '';
  const bad = r.sensitive.byKind.filter((k) => k.kind === 'password' || k.kind === 'recovery_phrase' || k.kind === 'private_key');
  if (bad.length === 0) return '';
  return `<h2>Worth fixing</h2><div class="card brief security"><span class="ic">⚠</span><span>${bad
    .map((k) => `${k.count} ${k.label.toLowerCase()}`)
    .join(', ')} sitting in your SMS. Change those passwords and delete the messages.</span></div>`;
}

function ask(t: Twin): string {
  const q = nextQuestion(t);
  const answered = t.answeredQuestions.slice(-5).reverse();
  return `
    <h2>Ask me</h2>
    <p class="meta">${t.answered} answered · ${t.questions.length} waiting. Each answer is saved on this phone as history; you can change it any time.</p>
    ${q ? questionCard(q) : '<div class="card meta">No more questions for now.</div>'}
    ${state.skipped.size > 0 ? `<button class="link" data-unskip="1">Show the ${state.skipped.size} skipped</button>` : ''}
    ${answered.length > 0 ? `<h2>Recently answered</h2>${answered.map((a) => questionCard(a, a.answer)).join('')}` : ''}`;
}

const KIND: Record<string, string> = { person: 'Person', organisation: 'Organisation', account: 'Account' };

function people(t: Twin): string {
  if (state.person !== null) return personView(t, state.person);
  const s = state.search.trim().toLowerCase();
  const list = t.entities.filter((e) => s === '' || e.name.toLowerCase().includes(s) || (e.relation ?? '').includes(s)).slice(0, 80);
  return `
    <h2>People and organisations</h2>
    <input id="search" type="search" placeholder="Search ${t.entities.length.toLocaleString('en-IN')} names" value="${esc(state.search)}">
    ${list
      .map(
        (e) => `<button class="card ent" data-person="${esc(e.id)}">
          <span class="row"><span class="payee">${esc(e.name)}</span><span class="meta">${rupees(e.paidOut + e.paidIn)}</span></span>
          <span class="meta">${KIND[e.kind]}${e.relation ? ` · <b>${esc(e.relation)}</b>` : ''}${e.contact ? ' · in contacts' : ''} · ${e.count} payments · last ${date(e.last)}</span>
        </button>`,
      )
      .join('')}`;
}

function personView(t: Twin, id: string): string {
  const e = t.entities.find((x) => x.id === id);
  if (e === undefined) return '<p class="meta">Not found.</p>';
  const beliefs = t.beliefs.filter((b) => b.about === id);
  const qs = [...t.questions.filter((q) => q.about === id), ...t.answeredQuestions.filter((q) => q.about === id)];
  return `
    <button class="link" data-back="1">← All</button>
    <h2>${KIND[e.kind]}</h2>
    <div class="card">
      <div class="payee big">${esc(e.name)}</div>
      <div class="meta">${e.relation ? `<b>${esc(e.relation)}</b> · ` : ''}${e.contact ? `in contacts as “${esc(e.contact)}” · ` : ''}since ${date(e.first)}</div>
      <div class="stats"><span><b>${rupees(e.paidOut)}</b><br><span class="meta">sent</span></span><span><b>${rupees(e.paidIn)}</b><br><span class="meta">received</span></span><span><b>${e.count}</b><br><span class="meta">payments</span></span></div>
    </div>
    ${beliefs.length > 0 ? '<h2>What Orb believes</h2>' : ''}
    ${beliefs.map(beliefCard).join('')}
    ${qs.map((q) => questionCard(q, 'answer' in q ? (q as Question & { answer: string }).answer : undefined)).join('')}
    <h2>Timeline</h2>
    <div class="card">${e.timeline
      .map((m) => `<div class="row line"><span class="meta">${date(m.at)}</span><span class="${m.direction === 'credit' ? 'in' : ''}">${m.direction === 'credit' ? '+' : '−'}${rupees(m.amount)}</span></div>`)
      .join('')}</div>`;
}

function beliefCard(b: Twin['beliefs'][number]): string {
  const pct = Math.round(b.confidence * 100);
  return `<div class="card belief">
    <div>${esc(b.text)}</div>
    <div class="conf"><span style="width:${pct}%"></span></div>
    <div class="meta">${b.source === 'you' ? 'You told Orb' : `${pct}% sure`} · ${esc(b.because)}</div>
  </div>`;
}

function money(t: Twin): string {
  const p = state.result!.profile;
  const max = Math.max(1, ...t.spendByRelation.map((s) => s.amount));
  const personIds = new Set(t.entities.filter((e) => e.kind === 'person').map((e) => e.id));
  const active = p.subscriptions.filter((s) => s.status === 'active');
  const subs = active.filter((s) => !personIds.has(s.key));
  const regular = active.filter((s) => personIds.has(s.key));
  const relationOf = (key: string) => t.entities.find((e) => e.id === key)?.relation;
  const autopays = p.autopays.filter((a) => a.status === 'active');
  return `
    <h2>Last 30 days, by who you paid</h2>
    <div class="card">${t.spendByRelation
      .map((s) => `<div class="bar"><span class="row"><span>${esc(s.relation)}</span><span>${rupees(s.amount)}</span></span><span class="track"><span style="width:${(s.amount / max) * 100}%"></span></span></div>`)
      .join('')}
      <p class="meta">Answer “Who is … to you?” questions to label more.</p></div>
    <h2>Your normal</h2>
    <div class="card"><div class="row"><span>Usual payment</span><b>${rupees(p.debits.p50)}</b></div><div class="row"><span>90% of payments under</span><b>${rupees(p.debits.p90)}</b></div>${
      p.quietHours ? `<div class="row"><span>You rarely pay</span><b>${String(p.quietHours.from).padStart(2, '0')}:00–${String(p.quietHours.to).padStart(2, '0')}:00</b></div>` : ''
    }</div>
    ${regular.length > 0 ? `<h2>Regular payments to people (${regular.length})</h2>
    <div class="card">${regular.map((s) => `<div class="row line"><span>${esc(s.name)}${relationOf(s.key) ? ` <span class="meta">· ${esc(relationOf(s.key)!)}</span>` : ''}</span><span>${rupees(s.usualAmount)} ${s.cycle}</span></div>`).join('')}</div>` : ''}
    <h2>Subscriptions (${subs.length})</h2>
    <div class="card">${subs.map((s) => `<div class="row line"><span>${esc(s.name)}</span><span>${rupees(s.usualAmount)} ${s.cycle}</span></div>`).join('') || '<span class="meta">None found.</span>'}</div>
    <h2>Autopays (${autopays.length})</h2>
    <div class="card">${autopays.map((a) => `<div class="row line"><span>${esc(a.likelyMerchant ?? a.merchant)}</span><span>${a.amount !== undefined ? `up to ${rupees(a.amount)}` : ''}</span></div>`).join('') || '<span class="meta">None found.</span>'}</div>`;
}

interface GuardEvent {
  at: number;
  app: string;
  name: string | null;
  amount: number;
  mode: string;
  outcome: string;
  kind?: 'message';
  found?: string[];
  to?: string;
}

const FOUND: Record<string, string> = { code: 'one-time code', pin: 'PIN', card: 'card number', cvv: 'CVV', password: 'password', aadhaar: 'Aadhaar number', phrase: 'recovery phrase' };

function guardCard(): string {
  const on = native.guardOn();
  const events = native
    .guardLog()
    .split('\n')
    .flatMap((l) => {
      try {
        return l.trim() === '' ? [] : [JSON.parse(l) as GuardEvent];
      } catch {
        return [];
      }
    });
  const done = events.filter((e) => e.outcome !== 'shown').slice(-6).reverse();
  const verb = (e: GuardEvent) =>
    e.outcome === 'continued' ? (e.kind === 'message' ? 'you sent it' : 'you continued') : e.outcome === 'confirmed' ? 'you confirmed with fingerprint' : e.kind === 'message' ? "you didn't send it" : "you didn't pay";
  const what = (e: GuardEvent) =>
    e.kind === 'message' ? `${(e.found ?? []).map((f) => FOUND[f] ?? f).join(', ')} to ${esc(e.to ?? 'a chat')}` : `${rupees(e.amount)} to ${esc(e.name ?? 'someone')}`;
  let learned: Record<string, { amounts: number[]; app?: string }> = {};
  try {
    learned = JSON.parse(native.guardSeen()) as typeof learned;
  } catch {
    /* none yet */
  }
  const learnedNames = Object.entries(learned);
  const unread = native.guardUnread();
  const unreadCount = (unread.match(/^── /gm) ?? []).length;
  return `
    <h2>Pay guard</h2>
    <div class="card">
      <p>${on ? '✓ <b>On</b> for PhonePe and Google Pay.' : '○ <b>Off.</b>'} When a payment is unusual for you (someone new, much more than usual, an odd hour), Orb covers the Pay button with the reason and a short pause. Usual payments see nothing.</p>
      ${on ? '' : `<p class="meta">Settings → Accessibility → Orb pay guard → On. If it's greyed out: Settings → Apps → Orb → ⋮ → Allow restricted settings, then try again.</p><button class="primary" data-guard="1">Open Accessibility settings</button>`}
      ${done.length > 0 ? `<div class="meta" style="margin-top:10px">Recent pauses:</div>${done.map((e) => `<div class="row line"><span>${what(e)} <span class="meta">· ${esc(e.app)}</span></span><span class="meta">${verb(e)}</span></div>`).join('')}` : ''}
      ${learnedNames.length > 0 ? `<p class="meta">Learned from your UPI apps' history: ${learnedNames.slice(0, 6).map(([n, e]) => `${esc(n)} (${e.amounts.length}× up to ${rupees(Math.max(...e.amounts))})`).join(', ')}${learnedNames.length > 6 ? ` and ${learnedNames.length - 6} more` : ''}. Usual payments to them now pass.</p>` : ''}
      ${unreadCount > 0 ? `<p class="meta">${unreadCount} pay screen${unreadCount === 1 ? '' : 's'} it couldn't fully read. <button class="link" data-unread="1">${state.showUnread ? 'Hide' : 'Show'}</button> · <button class="link" data-clearunread="1">Clear</button> (send these to improve the reader)</p>${state.showUnread ? `<pre class="unread">${esc(unread)}</pre>` : ''}` : ''}
    </div>`;
}

function messageCard(): string {
  const on = native.messageGuardOn();
  return `
    <h2>Message guard · WhatsApp</h2>
    <div class="card">
      <p>${on ? '✓ <b>On.</b>' : '○ <b>Off.</b>'} Pauses <b>Send</b> when the message you're typing holds an OTP, PIN, card number, CVV, password, Aadhaar number or wallet recovery phrase; stricter with numbers not in your contacts and during calls. It reads only the message box and the chat's title, and <b>never stores what you type</b>. Needs the pay guard (Accessibility) on.</p>
      <button class="${on ? 'secondary' : 'primary'}" data-msgguard="${on ? 'off' : 'on'}">${on ? 'Turn off' : 'Turn on'}</button>
    </div>`;
}

function dataCard(): string {
  const c = state.result?.phone;
  if (c === undefined) return '';
  const m = dataMap(c);
  const dot: Record<string, string> = { money: 'money', high: 'high', medium: 'medium' };
  const withApps = m.rows.filter((r) => r.apps.length > 0);
  const none = m.rows.filter((r) => r.apps.length === 0);
  return `
    <h2>Who can see what</h2>
    <p class="meta">Every kind of personal data on this phone, and which of the ${c.apps} apps you installed can read it (system apps aren't listed). Take access away where an app doesn't need it.</p>
    ${m.widest.length > 0 ? `<div class="card"><div class="meta">Apps that reach the most:</div>${m.widest.map((w) => `<div class="row line"><span>${esc(w.app)}</span><span class="meta">${w.kinds} kind${w.kinds === 1 ? '' : 's'}${w.money > 0 ? ` · ${w.money} money-related` : ''}</span></div>`).join('')}</div>` : ''}
    ${withApps
      .map(
        (r) => `<details class="card data ${dot[r.kind.sensitivity]}">
          <summary><span class="row"><span><span class="dot"></span>${esc(r.kind.label)}</span><b>${r.apps.length}</b></span></summary>
          <p class="meta">${esc(r.kind.why)}</p>
          <p>${r.apps.map((a) => `<span class="chip${r.sideloaded.includes(a) ? ' warn' : ''}">${esc(a)}</span>`).join(' ')}</p>
          ${r.sideloaded.length > 0 ? '<p class="meta">Red: not from the Play Store.</p>' : ''}
          ${r.kind.orb ? `<p class="meta">Orb reads it for: ${esc(r.kind.orb)} (on this phone only).</p>` : ''}
          <p class="meta">Review: ${esc(r.kind.settings)}</p>
        </details>`,
      )
      .join('')}
    ${none.length > 0 ? `<p class="meta">No app you installed can read: ${none.map((r) => esc(r.kind.label.toLowerCase())).join(', ')}.</p>` : ''}`;
}

function phone(): string {
  const r = state.result!;
  const c = r.phone;
  return `${dataCard()}${guardCard()}${messageCard()}
    <h2>Phone check</h2>
    ${c === undefined ? '<div class="card meta">Not read yet.</div>' : c.findings.length === 0 ? '<div class="card">Nothing to fix.</div>' : c.findings.map((f) => `<div class="card brief ${f.level === 'serious' ? 'security' : ''}"><span class="ic">${f.level === 'serious' ? '⚠' : '·'}</span><span>${esc(f.text)}</span></div>`).join('')}
    ${r.calls ? `<h2>Calls</h2><div class="card"><div class="row"><span>Calls to you from contacts</span><b>${Math.round(r.calls.incomingFromContacts * 100)}%</b></div><div class="row"><span>Unknown numbers that keep calling</span><b>${r.calls.persistentUnknown.length}</b></div></div>` : ''}
    ${r.screen?.offHours ? `<h2>Screen</h2><div class="card"><div class="row"><span>Usually off your phone</span><b>${String(r.screen.offHours.from).padStart(2, '0')}:00–${String(r.screen.offHours.to).padStart(2, '0')}:00</b></div></div>` : ''}
    <h2>Scams</h2><div class="card">${r.scamCount} likely scam messages found in your SMS.</div>`;
}

function onboarding(a: Access): string {
  const item = (ok: boolean, what: string, why: string) => `<div class="row line"><span>${ok ? '✓' : '○'} <b>${what}</b><br><span class="meta">${why}</span></span></div>`;
  return `
    <h2>Let Orb read your phone</h2>
    <div class="card">
      <p>Orb learns who and what matters to you from what your phone already knows, then asks you to confirm. <b>Nothing leaves this phone</b>: Orb has no internet permission.</p>
      ${item(a.sms, 'Messages', 'bank alerts, autopays, scams')}
      ${item(a.contacts, 'Contacts', 'who is who')}
      ${item(a.calls, 'Call log', 'unknown callers')}
      ${item(a.usage, 'Usage access', 'when you are usually off your phone')}
      ${!(a.sms && a.contacts && a.calls) ? '<button class="primary" data-access="1">Allow messages, contacts and calls</button>' : ''}
      ${!a.usage ? '<button class="secondary" data-usage="1">Allow usage access (opens Settings)</button>' : ''}
      ${a.sms ? '<button class="secondary" data-sync="1">Continue</button>' : ''}
    </div>`;
}

function render(): void {
  const main = $('#app');
  const t = state.twin;
  const tabs: [Tab, string][] = [
    ['today', 'Today'],
    ['ask', `Ask${t && t.questions.length > 0 ? ` <i>${t.questions.length}</i>` : ''}`],
    ['people', 'People'],
    ['money', 'Money'],
    ['phone', 'Phone'],
  ];
  let body: string;
  if (state.status !== '') body = `<div class="card meta">${esc(state.status)}</div>`;
  else if (t === null) body = onboarding(access());
  else body = state.tab === 'today' ? today(t) : state.tab === 'ask' ? ask(t) : state.tab === 'people' ? people(t) : state.tab === 'money' ? money(t) : phone();
  main.innerHTML = `
    <header><span class="orb" aria-hidden="true"></span><h1>Orb</h1>${t ? '<button class="link sync" data-sync="1">Sync</button>' : ''}</header>
    ${isPhone ? '' : '<p class="meta note">Preview with invented data. On the phone, Orb reads your own.</p>'}
    ${body}
    ${t ? `<nav>${tabs.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${l}</button>`).join('')}<a href="lock.html">Lock</a></nav>` : ''}`;
  const note = document.getElementById('note') as HTMLInputElement | null;
  if (note !== null) note.focus();
  const search = document.getElementById('search') as HTMLInputElement | null;
  if (search !== null && state.search !== '') {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}

function onClick(ev: Event): void {
  const el = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (el === null) return;
  const d = el.dataset;
  if (d['tab']) {
    state.tab = d['tab'] as Tab;
    state.person = null;
  } else if (d['q'] && d['v']) {
    state.writing = null;
    return give(d['q'], d['v']);
  } else if (d['write']) state.writing = state.writing === d['write'] ? null : d['write'];
  else if (d['note']) {
    const text = (document.getElementById('note') as HTMLInputElement | null)?.value.trim() ?? '';
    state.writing = null;
    if (text !== '') return give(d['note'], `note:${text}`);
  }
  else if (d['write']) state.writing = state.writing === d['write'] ? null : d['write'];
  else if (d['note']) {
    const text = (document.getElementById('note') as HTMLInputElement | null)?.value.trim() ?? '';
    state.writing = null;
    if (text !== '') return give(d['note'], `note:${text}`);
  } else if (d['skip']) state.skipped.add(d['skip']);
  else if (d['unskip']) state.skipped.clear();
  else if (d['person']) state.person = d['person'];
  else if (d['back']) state.person = null;
  else if (d['access']) return native.requestAccess();
  else if (d['usage']) return native.requestUsageAccess();
  else if (d['guard']) return native.openGuardSettings();
  else if (d['msgguard']) native.setMessageGuard(d['msgguard'] === 'on');
  else if (d['insight']) return refreshInsights();
  else if (d['download']) native.modelDownload();
  else if (d['cloud']) {
    const f = facts();
    if (f !== null) state.cloud = { facts: f };
  } else if (d['approve'] && state.cloud) {
    // Your yes for this one task, recorded with the run; the AI app you pick does the sending.
    state.cloud = { ...state.cloud, approvedAt: Date.now() };
    native.shareText(baselinePrompt(state.cloud.facts));
  } else if (d['paste'] && state.cloud?.approvedAt !== undefined) {
    const reply = native.clipboardText();
    keep(inferenceRecord('weekly_baseline', CLOUD, state.cloud.facts, reply, Date.now(), state.cloud.approvedAt));
    state.cloud = null;
  } else if (d['cancelcloud']) state.cloud = null;
  else if (d['log']) state.showLog = true;
  else if (d['closelog']) state.showLog = false;
  else if (d['unread']) state.showUnread = !state.showUnread;
  else if (d['clearunread']) {
    native.clearGuardUnread();
    state.showUnread = false;
  }
  else if (d['sync']) return void sync();
  else return;
  render();
  if (!d['write']) window.scrollTo(0, 0);
}

export const OrbApp = {
  start(): void {
    document.addEventListener('click', onClick);
    document.addEventListener('input', (ev) => {
      const el = ev.target as HTMLInputElement;
      if (el.id === 'search') {
        state.search = el.value;
        render();
      }
    });
    const a = access();
    if (a.sms) void sync();
    else render();
  },
  /** The on-device model's reply to a task (from the Android bridge). */
  onModelReply(id: string, reply: string | null, error: string | null): void {
    const f = pendingFacts.get(id);
    pendingFacts.delete(id);
    if (state.thinking === id) state.thinking = null;
    if (f !== undefined) {
      const rec = inferenceRecord('weekly_baseline', NANO, f, reply ?? `(no reply: ${error ?? 'unknown error'})`, Date.now());
      keep(rec);
    }
    render();
  },
  onModelStatus(): void {
    if (state.twin !== null) render();
  },
  /** Called by the app after a permission prompt or on return from Settings. */
  onAccess(): void {
    // Back from Settings: the guard may have been switched on.
    if (state.twin !== null && state.tab === 'phone') render();
    if (state.twin === null && state.status === '') {
      if (access().sms) void sync();
      else render();
    }
  },
};

(globalThis as unknown as { OrbApp: typeof OrbApp }).OrbApp = OrbApp;
