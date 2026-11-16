// Persistent, single-tab sync orchestration. A committed capture is the only
// event that advances the queue. MV3 restarts can safely replay the last task.
import { ANALYTICS_KEYS } from './analytics/store.js';
import { MENTION_OPERATIONS, isPremiumRedirect, isAnalyticsPage } from './analytics/operations.js';
import { ALARM_NAME, BATCH_MS, BATCH_PAGES, CONTINUE_DELAY, DAY, SYNC_INTERVAL, coverageFor, isoDay, planSync, refinements, retryDelay, syncMode } from './analytics/schedule.js';
const OWN_TAB = 'xtocAnalyticsOwnedTab';
const MAX_DAILY_PAGES = 48;
export function createAnalyticsSync({ storage, session, repository, tabs, alarms, now = Date.now, stepTimeoutMs = 45000, settleMs = 1500 }) {
  let run = null;
  const retired = new Map();
  let pending = Promise.resolve();
  const serial = fn => { const next = pending.then(fn); pending = next.catch(() => {}); return next; };
  const read = async key => (await storage.get(key))[key];
  const prefs = async () => (await read(ANALYTICS_KEYS.prefs)) || {};
  const state = async () => ({ version: 2, accounts: {}, ...(await read(ANALYTICS_KEYS.sync)) });
  const save = s => storage.set({ [ANALYTICS_KEYS.sync]: s });
  const queue = (s, id) => (s.accounts[id || 'pending'] ||= { pending: [], windows: {}, failures: 0 });
  async function schedule(s) {
    if (!alarms) return;
    const p = await prefs();
    const id = s.activeAccountId || p.accountId || 'pending';
    const q = queue(s, id);
    const enabled = syncMode(p) === 'background' && id !== 'pending';
    if (q.paused || !(enabled || q.continue && q.pending.length) && !run) { await alarms.clear(ALARM_NAME); return; }
    const when = run ? now() + BATCH_MS : Math.max(now() + 1000, q.nextAttemptAt || (enabled ? (q.lastRecentAt || 0) + SYNC_INTERVAL : now() + CONTINUE_DELAY));
    await alarms.create(ALARM_NAME, { when });
  }
  async function closeOwned(tabId, token) {
    const owned = session ? (await session.get(OWN_TAB))[OWN_TAB] : null;
    if (owned?.tabId === tabId && owned.token === token) {
      try {
        const tab = tabs.get ? await tabs.get(tabId) : { url: owned.url };
        // Never close a user-navigated tab or an ID recycled after restart.
        const actual = new URL(tab.pendingUrl || tab.url);
        const expected = new URL(owned.url);
        if (owned.allowBlank && actual.href === 'about:blank' || actual.origin === expected.origin && actual.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '')) await tabs.remove(tabId);
      } catch { /* the owned tab already closed */ }
      await session.remove?.(OWN_TAB);
    }
  }
  async function finish(s, error = null, kind = '', paused = false) {
    const current = run;
    run = null;
    if (current) { retired.set(current.tabId, now() + 60000); clearTimeout(current.timer); clearTimeout(current.settle); }
    const q = queue(s, current?.accountId || s.activeAccountId);
    if (error) {
      q.failures = (q.failures || 0) + 1;
      q.error = error; q.errorKind = kind; q.paused = paused;
      q.nextAttemptAt = now() + retryDelay(q.failures);
    } else {
      q.error = null; q.errorKind = ''; q.failures = 0;
      q.nextAttemptAt = now() + (q.pending.length ? CONTINUE_DELAY : SYNC_INTERVAL);
      if (!q.pending.length) { q.continue = false; q.historyCheckedAt = now(); }
    }
    s.running = false; s.active = null; s.error = q.error;
    s.ok = !error && !q.pending.length;
    await save(s);
    if (current) await closeOwned(current.tabId, current.token);
    await schedule(s);
  }
  async function recoverInternal() {
    const s = await state();
    if (run || !s.running) return s;
    const active = s.active;
    if (active) await closeOwned(active.tabId, active.token);
    s.running = false; s.active = null;
    const q = queue(s, s.activeAccountId);
    q.error = 'Sync was interrupted. Saved windows are kept; the unfinished window will resume.';
    q.errorKind = 'interrupted'; q.nextAttemptAt = now() + CONTINUE_DELAY;
    s.error = q.error;
    await save(s); await schedule(s);
    return s;
  }
  async function next(s) {
    if (!run) return;
    const q = queue(s, run.accountId);
    if (!q.pending.length || run.pages >= BATCH_PAGES || now() - run.startedAt >= BATCH_MS) return finish(s);
    const today = isoDay(now());
    if (s.budget?.day !== today) s.budget = { day: today, pages: 0 };
    if (s.budget.pages >= MAX_DAILY_PAGES) {
      await finish(s);
      q.nextAttemptAt = Date.parse(`${today}T00:00:00Z`) + DAY;
      q.error = 'Daily page budget reached. Saved progress resumes tomorrow.';
      s.error = q.error; await save(s); await schedule(s); return;
    }
    const task = q.pending[0];
    run.task = task; run.armedAt = null; run.ready = false; run.identityVerified = false; run.candidate = null; run.documentId = null;
    run.pages++; s.budget.pages++;
    s.active = { tabId: run.tabId, token: run.token, taskId: task.id, url: task.url };
    await save(s);
    await session?.set({ [OWN_TAB]: { tabId: run.tabId, token: run.token, url: task.url, allowBlank: run.pages === 1 } });
    clearTimeout(run.timer);
    run.timer = setTimeout(() => serial(async () => {
      if (run?.task.id === task.id) await finish(await state(), 'X did not return a verified date window. Saved data is kept; retry is scheduled.', 'timeout');
    }), stepTimeoutMs);
    try {
      await tabs.update(run.tabId, { url: task.url });
      await session?.set({ [OWN_TAB]: { tabId: run.tabId, token: run.token, url: task.url } });
      await schedule(s);
    }
    catch { await finish(s, 'The sync tab could not be loaded.', 'network'); }
  }
  async function startInternal(trigger, accountId = '') {
    if (run) return { running: true };
    const s = await recoverInternal();
    const p = await prefs();
    const accounts = await repository.accounts();
    const id = accountId || s.activeAccountId || p.accountId || accounts[0]?.id || '';
    if (accountId && !accounts.some(a => a.id === accountId)) throw new Error('Sync that X account once first.');
    const q = queue(s, id);
    if (trigger !== 'manual' && (q.paused || q.nextAttemptAt > now())) return { running: false };
    if (trigger !== 'manual' && !q.continue && syncMode(p) !== 'background' && trigger !== 'visit') return { running: false };
    if (!q.pending.length) {
      q.pending = planSync(q, now());
      q.historyStartedAt ||= now();
    }
    // Refresh recent data ahead of a long-running history queue when due.
    if (q.historyStartedAt && q.lastRecentAt && now() - q.lastRecentAt >= SYNC_INTERVAL) {
      const fresh = planSync({ ...q, lastWeeklyAt: now() }, now()).filter(t => t.cadence === 'recent' || t.cadence === 'daily');
      const ids = new Set(fresh.map(t => t.id));
      q.pending = [...fresh, ...q.pending.filter(t => !ids.has(t.id))];
    }
    q.paused = false; q.continue = true; q.error = null;
    s.activeAccountId = id; s.trigger = trigger; s.lastAttemptAt = new Date(now()).toISOString(); s.error = null;
    await save(s);
    const today = isoDay(now());
    if (s.budget?.day === today && s.budget.pages >= MAX_DAILY_PAGES) {
      q.nextAttemptAt = Date.parse(`${today}T00:00:00Z`) + DAY;
      q.error = 'Daily page budget reached. Saved progress resumes tomorrow.';
      s.error = q.error; s.running = false; s.active = null;
      await save(s); await schedule(s); return { running: false };
    }
    let tab;
    try { tab = await tabs.create({ url: 'about:blank', active: false }); }
    catch { await finish(s, 'Could not open an inactive X tab.', 'network'); return { running: false }; }
    run = { tabId: tab.id, token: crypto.randomUUID(), accountId: id, startedAt: now(), pages: 0, trigger };
    s.running = true;
    await next(s);
    return { running: Boolean(run) };
  }
  function matchesTask(payload, parsed, sender) {
    if (!run || sender.tab?.id !== run.tabId) return false;
    const task = run.task;
    if (task.kind === 'mentions' ? !MENTION_OPERATIONS.has(parsed.operation) : parsed.operation !== task.expect) return false;
    if (run.documentId && sender.documentId && run.documentId !== sender.documentId) return false;
    if (!task.from) return true;
    if (!run.armedAt || !Number.isFinite(payload.requestedAt) || payload.requestedAt < run.armedAt) return false;
    if (payload.range && (payload.range.from !== task.from || ![task.to, isoDay(Date.parse(task.to) + DAY)].includes(payload.range.to))) return false;
    const dates = task.kind === 'overview' ? Object.keys(parsed.days || {}) : (parsed.posts || []).map(post => isoDay(post.createdAt));
    return (dates.length > 0 || Boolean(payload.range)) && dates.every(day => day >= task.from && day <= task.to);
  }
  async function completeCandidate() {
    if (!run?.candidate || !run.ready || run.settle) return;
    const { parsed } = run.candidate;
    const task = run.task;
    const s = await state();
    const q = queue(s, run.accountId);
    const coverage = coverageFor(task, parsed);
    q.windows[task.id] = { ...coverage, kind: task.kind, checkedAt: now() };
    q.pending.shift();
    const extra = refinements(task, coverage).filter(t => !q.pending.some(p => p.id === t.id) && !q.windows[t.id]);
    if (coverage.truncated) q.pending.unshift(...extra);
    else {
      const weekly = q.pending.findIndex(t => t.cadence === 'weekly');
      q.pending.splice(weekly < 0 ? q.pending.length : weekly, 0, ...extra);
    }
    q.lastCaptureAt = now();
    for (const cadence of ['recent', 'daily', 'weekly']) {
      if (task.cadence === cadence && !q.pending.some(t => t.cadence === cadence)) q[`last${cadence[0].toUpperCase() + cadence.slice(1)}At`] = now();
    }
    s.lastSuccessAt = new Date(now()).toISOString();
    await save(s); // capture was committed by the caller before this checkpoint
    clearTimeout(run.timer);
    run.settle = setTimeout(() => serial(async () => {
      if (!run || run.task.id !== task.id) return;
      run.settle = null;
      await next(await state());
    }), settleMs);
  }
  async function validate(parsed, sender) {
    if (!run || sender.tab?.id !== run.tabId) return;
    if (parsed.accountId && run.accountId && parsed.accountId !== run.accountId) {
      await finish(await state(), 'The signed-in X account changed. Select the matching account and sync manually.', 'account', true);
      throw new Error('The signed-in X account changed; capture was not saved.');
    }
  }
  async function captureInternal(payload, parsed, sender) {
    if (!run || sender.tab?.id !== run.tabId) return;
    await validate(parsed, sender);
    if (!run) return;
    if (!run.accountId && parsed.accountId) {
      const s = await state();
      const q = queue(s, '');
      s.accounts[parsed.accountId] = q; delete s.accounts.pending;
      run.accountId = parsed.accountId; s.activeAccountId = parsed.accountId;
      await save(s);
    }
    if (!matchesTask(payload, parsed, sender)) return;
    run.candidate = { parsed };
    await completeCandidate();
  }
  async function windowInternal(action, payload, sender) {
    if (!run || sender.tab?.id !== run.tabId) return null;
    if (!isAnalyticsPage(sender.url) && run.task.kind !== 'mentions') return null;
    if (action === 'analytics:window') {
      run.documentId = sender.documentId || null;
      const account = (await repository.accounts()).find(a => a.id === run.accountId);
      return { ...run.task, handle: account?.handle || '' };
    }
    if (payload.id !== run.task.id || run.documentId && sender.documentId && run.documentId !== sender.documentId) return null;
    if (action === 'analytics:window-identity') { run.identityVerified = true; return {}; }
    if (action === 'analytics:window-armed') { run.armedAt = now(); run.ready = false; run.candidate = null; return {}; }
    if (action === 'analytics:window-ready') { run.ready = true; await completeCandidate(); return {}; }
    if (action === 'analytics:window-error') {
      if (payload.code === 'range-unavailable') {
        const s = await state(), q = queue(s, run.accountId);
        q.windows[run.task.id] = { kind: run.task.kind, from: run.task.from, to: run.task.to, status: 'unavailable', checkedAt: now() };
        q.pending.shift(); await save(s); return next(s);
      }
      await finish(await state(), String(payload.error || 'X’s date controls changed.').slice(0, 180), 'controls', true);
    }
    return {};
  }
  async function pauseInternal() {
    const s = await state();
    const q = queue(s, s.activeAccountId);
    q.paused = true; q.continue = false;
    await finish(s);
    q.paused = true; await save(s); await alarms?.clear(ALARM_NAME);
  }
  tabs.onUpdated?.addListener((id, change) => {
    if (run?.tabId !== id || !change.url) return;
    if (isPremiumRedirect(change.url)) serial(async () => {
      if (run?.tabId === id) await finish(await state(), 'Sign in to X with Premium, then resume sync.', 'login', true);
    });
  });
  tabs.onRemoved?.addListener(id => {
    if (run?.tabId === id) serial(async () => {
      if (run?.tabId === id) await finish(await state(), 'Sync paused because its tab was closed.', 'closed', true);
    });
  });
  return {
    start: (trigger = 'manual', accountId = '') => serial(() => startInternal(trigger, accountId)),
    validate: async (parsed, sender) => {
      await serial(() => validate(parsed, sender));
      // Identity-less operations (notably mentions) must wait for the native
      // profile link check before borrowing the sync account. Do not hold the
      // coordinator lock while the content script sends that confirmation.
      if (!parsed.accountId && run?.tabId === sender.tab?.id) {
        const token = run.token, deadline = Date.now() + 13000;
        while (run?.token === token && !run.identityVerified && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        if (run?.token !== token || !run.identityVerified) throw new Error('The sync account could not be verified.');
      }
    },
    capture: (payload, parsed, sender) => serial(() => captureInternal(payload, parsed, sender)),
    window: (action, payload, sender) => serial(() => windowInternal(action, payload, sender)),
    pause: () => serial(pauseInternal),
    recover: () => serial(recoverInternal),
    initialize: () => serial(async () => { const s = await recoverInternal(); await schedule(s); }),
    tick: () => serial(async () => {
      const s = await recoverInternal();
      if (run) return schedule(s);
      const p = await prefs();
      const id = s.activeAccountId || p.accountId || '';
      const q = queue(s, id);
      if (!q.paused && now() >= (q.nextAttemptAt || 0) && (q.continue && q.pending.length || syncMode(p) === 'background')) await startInternal(q.pending.length ? 'resume' : 'background', id);
      else await schedule(s);
    }),
    seen: (payload, sender) => serial(async () => {
      if (run?.tabId === sender.tab?.id && [401, 403, 429].includes(Number(payload.status))) await finish(await state(), Number(payload.status) === 429 ? 'X limited requests. Sync will retry later.' : 'X requires you to sign in or confirm access. Resume after checking X.', Number(payload.status) === 429 ? 'rate' : 'login', Number(payload.status) !== 429);
    }),
    hint: tabId => run?.tabId === tabId ? run.accountId : '',
    isOwned: tabId => run?.tabId === tabId,
    isRetired: tabId => (retired.get(tabId) || 0) > now(),
    allowVisit: () => serial(async () => { const s = await state(); const q = queue(s, s.activeAccountId); q.paused = false; q.nextAttemptAt = 0; await save(s); }),
    isRunning: () => Boolean(run),
    reset: accountId => serial(async () => {
      await pauseInternal(); const s = await state();
      if (accountId) delete s.accounts[accountId]; else s.accounts = {};
      if (!accountId || s.activeAccountId === accountId) s.activeAccountId = '';
      s.lastSuccessAt = null; s.error = null; await save(s);
    })
  };
}
