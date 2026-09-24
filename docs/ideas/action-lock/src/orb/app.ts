// The Orb app screen (imperative shell). Reads the phone through the Android
// bridge, builds the twin with the tested core, and shows it. Bundled into
// android/app/src/main/assets/index.html by `npm run build:android`.

import { runImport, type ImportInput, type ImportResult } from '../import/run.ts';
import { answer, buildTwin, type AnswerEvent, type Entity, type Question, type Twin } from './twin.ts';
import { demoSources } from './demo.ts';

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
}

/** In a browser there is no phone: invented sample data, answers kept in this tab. */
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
} = { tab: 'today', result: null, answers: [], twin: null, person: null, search: '', skipped: new Set(), status: '' };

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
}

function give(question: string, value: string): void {
  const e = answer(question, value, Date.now(), state.answers.length);
  native.appendAnswer(JSON.stringify(e));
  rebuild();
  render();
}

// ── Views ──────────────────────────────────────────────────────────────────

function questionCard(q: Question, current?: string): string {
  return `<div class="card q">
    <p class="qtext">${esc(q.text)}</p>
    <p class="meta">Because ${esc(q.because)}.</p>
    <div class="opts">${q.options
      .map((o) => `<button class="opt${o.value === current ? ' on' : ''}" data-q="${esc(q.id)}" data-v="${esc(o.value)}">${esc(o.label)}</button>`)
      .join('')}</div>
    ${current === undefined ? `<button class="link" data-skip="${esc(q.id)}">Not now</button>` : ''}
  </div>`;
}

function nextQuestion(t: Twin): Question | undefined {
  return t.questions.find((q) => !state.skipped.has(q.id));
}

function today(t: Twin): string {
  const q = nextQuestion(t);
  const icon: Record<string, string> = { money: '₹', due: '⏰', security: '⚠', question: '?' };
  return `
    <h2>Today</h2>
    ${t.brief.length === 0 ? '<div class="card meta">Nothing needs you today.</div>' : ''}
    ${t.brief.map((b) => `<div class="card brief ${b.kind}"><span class="ic">${icon[b.kind]}</span><span>${esc(b.text)}</span></div>`).join('')}
    ${q ? `<h2>One question</h2>${questionCard(q)}` : ''}
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

function phone(): string {
  const r = state.result!;
  const c = r.phone;
  return `
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
  } else if (d['q'] && d['v']) return give(d['q'], d['v']);
  else if (d['skip']) state.skipped.add(d['skip']);
  else if (d['unskip']) state.skipped.clear();
  else if (d['person']) state.person = d['person'];
  else if (d['back']) state.person = null;
  else if (d['access']) return native.requestAccess();
  else if (d['usage']) return native.requestUsageAccess();
  else if (d['sync']) return void sync();
  else return;
  render();
  window.scrollTo(0, 0);
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
  /** Called by the app after a permission prompt or on return from Settings. */
  onAccess(): void {
    if (state.twin === null && state.status === '') {
      if (access().sms) void sync();
      else render();
    }
  },
};

(globalThis as unknown as { OrbApp: typeof OrbApp }).OrbApp = OrbApp;
