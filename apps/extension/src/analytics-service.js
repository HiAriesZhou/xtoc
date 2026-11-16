// Analytics ingestion and extension UI boundary. Captures are local only;
// automatic/manual sync uses the same persistent coordinator.
import { autoSyncDue, isCapturePage, isDiagnosticPath, OPERATIONS, POST_DETAIL_OPERATIONS } from './analytics/operations.js';
import { parseCapture } from './analytics/parse.js';
import { accountSummary, responseShape } from './analytics/diagnostics.js';
import { parseAnalyticsCsv } from './analytics/csv.js';
import { ANALYTICS_KEYS } from './analytics/store.js';
import { createAnalyticsRepository } from './analytics-db.js';
import { createAnalyticsSync } from './analytics-sync.js';
import { DAY, syncMode } from './analytics/schedule.js';
const KNOWN = new Set(Object.values(OPERATIONS));
const DIAGNOSTICS_KEY = 'xtocAnalyticsDiagnostics';
export function createAnalyticsService({
  storage = chrome.storage.local, session = globalThis.chrome?.storage?.session, tabs = chrome.tabs,
  alarms = globalThis.chrome?.alarms, now = Date.now,
  repository = createAnalyticsRepository({ storage }), stepTimeoutMs, settleMs,
  diagnosticsEnabled = /\(Development\)/.test(globalThis.chrome?.runtime?.getManifest?.()?.name || '')
}) {
  const tabAccounts = new Map();
  let writes = Promise.resolve();
  const enqueue = fn => { const next = writes.then(fn); writes = next.catch(() => {}); return next; };
  const read = async key => (await storage.get(key))[key];
  const readPrefs = async () => { const p = { autoSync: false, ...(await read(ANALYTICS_KEYS.prefs)) }; return { ...p, mode: syncMode(p) }; };
  const runner = createAnalyticsSync({ storage, session, tabs, alarms, repository, now, stepTimeoutMs, settleMs });
  let diagnostics = {}, seenOps = [], restored = false;
  function cleanPath(url) {
    try { const path = new URL(url).pathname; return isDiagnosticPath(path) ? path.replace(/\d{3,}/g, ':id').slice(0, 80) : '(other page)'; }
    catch { return ''; }
  }
  async function restoreDiagnostics() {
    if (restored) return; restored = true;
    try {
      const saved = await session?.get([DIAGNOSTICS_KEY, `${DIAGNOSTICS_KEY}Seen`]);
      diagnostics = { ...saved?.[DIAGNOSTICS_KEY], ...diagnostics };
      seenOps = [...(saved?.[`${DIAGNOSTICS_KEY}Seen`] || []), ...seenOps].slice(-80);
    } catch { /* diagnostics are best effort, capture is not */ }
  }
  async function note(operation, sender, outcome, body) {
    if (!diagnosticsEnabled) return;
    await restoreDiagnostics();
    diagnostics[operation] = { at: new Date(now()).toISOString(), path: cleanPath(sender.url), ...outcome, shape: responseShape(body) };
    try { await session?.set({ [DIAGNOSTICS_KEY]: diagnostics }); } catch { /* session report only */ }
  }
  async function status() {
    await runner.recover();
    const [accounts, prefs, sync] = await Promise.all([repository.accounts(), readPrefs(), read(ANALYTICS_KEYS.sync)]);
    return { data: { version: 1, accounts: Object.fromEntries(accounts.map(a => [a.id, a])) }, prefs, sync: { ...sync, running: runner.isRunning() } };
  }
  // Used inside the worker for computed AI aggregates and tests. The UI's RPC
  // returns metadata only; Options reads indexed data directly, avoiding the
  // Chrome message-size ceiling on large histories.
  async function load(options = {}) { return { ...(await status()), data: await repository.read(options) }; }
  async function capture(payload, sender) {
    const tabId = sender.tab?.id;
    if (runner.isRetired(tabId)) return { stored: false };
    if (!KNOWN.has(payload.operation)) throw new Error('Unsupported analytics operation.');
    if (!isCapturePage(sender.url, payload.operation)) {
      await note(payload.operation, sender, { accepted: false }, payload.body); return { stored: false };
    }
    await runner.recover();
    let parsed;
    try { parsed = parseCapture(payload.operation, payload.body); }
    catch (error) { await note(payload.operation, sender, { accepted: true, error: error.message }, payload.body); throw error; }
    await runner.validate(parsed, sender);
    try {
      await enqueue(async () => {
        if (runner.isRetired(tabId)) throw new Error('This sync was stopped; late capture ignored.');
        const owner = POST_DETAIL_OPERATIONS.has(parsed.operation) ? await repository.ownerOf(parsed.postId) : '';
        const hint = owner || tabAccounts.get(tabId) || runner.hint(tabId) || '';
        if (!/^\d{1,25}$/.test(parsed.accountId || hint)) throw new Error('Could not tell which X account this data belongs to.');
        await repository.apply(parsed, { now: now(), accountHint: hint });
      });
    } catch (error) { await note(payload.operation, sender, { accepted: true, error: error.message }, payload.body); throw error; }
    if (parsed.accountId && tabId !== undefined) tabAccounts.set(tabId, parsed.accountId);
    const records = Object.fromEntries(['days', 'hours', 'heatmap', 'posts', 'mentions'].filter(k => parsed[k] !== undefined).map(k => [k, Array.isArray(parsed[k]) ? parsed[k].length : Object.keys(parsed[k]).length]));
    if (parsed.rowCount !== undefined) records.rows = parsed.rowCount;
    if (parsed.dropped) records.dropped = parsed.dropped;
    records.truncated = Boolean(parsed.truncated);
    await note(payload.operation, sender, { accepted: true, error: null, records }, payload.body);
    await runner.capture(payload, parsed, sender);
    return { stored: true };
  }
  async function seen(payload, sender) {
    // Status-only error signals work in release builds as well as dev builds.
    if (KNOWN.has(payload.operation) && isCapturePage(sender.url, payload.operation)) await runner.seen(payload, sender);
    if (!diagnosticsEnabled || !isDiagnosticPath(new URL(sender.url).pathname)) return {};
    await restoreDiagnostics();
    seenOps = [...seenOps, { at: new Date(now()).toISOString(), path: cleanPath(sender.url), operation: String(payload.operation).slice(0, 80), status: Number(payload.status) || 0, contentType: String(payload.contentType || '').slice(0, 80), read: String(payload.read || '').slice(0, 20) }].slice(-80);
    try { await session?.set({ [`${DIAGNOSTICS_KEY}Seen`]: seenOps }); } catch { /* diagnostics only */ }
    return {};
  }
  async function importCsv(payload) {
    const text = String(payload.text || '');
    if (!text || text.length > 10 * 1024 * 1024) throw new Error('Choose an X Analytics CSV under 10 MB.');
    const csv = parseAnalyticsCsv(text);
    return enqueue(async () => {
      const accounts = await repository.accounts();
      const byHandle = csv.profile?.handle && accounts.find(a => a.handle?.toLowerCase() === csv.profile.handle.toLowerCase());
      if (csv.profile?.handle && !byHandle) throw new Error(`This file is for @${csv.profile.handle}. Sync that account from X first, then import it.`);
      const chosen = byHandle?.id || accounts.find(a => a.id === payload.accountId)?.id || (accounts.length === 1 ? accounts[0].id : '');
      if (!chosen) throw new Error('Sync from X once first, so XTOC knows which account this file belongs to.');
      const parsed = csv.kind === 'content' ? { operation: OPERATIONS.content, accountId: chosen, posts: csv.posts, profile: byHandle || {} }
        : { operation: OPERATIONS.overviewDaily, accountId: chosen, days: csv.days };
      await repository.apply(parsed, { now: now(), source: 'csv' });
      return { kind: csv.kind, ...(csv.kind === 'content' ? { posts: csv.posts.length } : { days: Object.keys(csv.days).length }) };
    });
  }
  tabs.onUpdated?.addListener((id, change) => { if (change.url) tabAccounts.delete(id); });
  tabs.onRemoved?.addListener(id => tabAccounts.delete(id));
  return {
    load, status, capture, seen, importCsv, recover: runner.recover, initialize: runner.initialize, tick: runner.tick,
    window: runner.window, pause: runner.pause,
    sync: (payload = {}) => runner.start('manual', payload.accountId || ''),
    async visit() {
      const p = await readPrefs();
      if (p.mode === 'background') { await runner.tick(); return { started: runner.isRunning() }; }
      const sync = (await read(ANALYTICS_KEYS.sync)) || {};
      if (p.mode !== 'visit' || !autoSyncDue({ autoSync: true, lastAttemptAt: sync.lastAttemptAt }, now())) return { started: false };
      return { started: (await runner.start('visit', p.accountId || '')).running };
    },
    async setPrefs(payload) {
      const current = await readPrefs();
      const mode = ['manual', 'visit', 'background'].includes(payload.mode) ? payload.mode : payload.autoSync === true ? 'visit' : 'manual';
      const accounts = await repository.accounts();
      const accountId = accounts.find(a => a.id === payload.accountId)?.id || current.accountId || accounts[0]?.id || '';
      if (mode === 'background' && !accountId) throw new Error('Sync your X account once before enabling background updates.');
      // Revoking background activity also cancels queued continuations.
      if (mode !== 'background') await runner.pause();
      const p = { ...current, mode, autoSync: mode === 'visit', accountId };
      await storage.set({ [ANALYTICS_KEYS.prefs]: p });
      if (mode === 'background') await runner.start('manual', accountId);
      else { if (mode === 'visit') await runner.allowVisit(); await runner.initialize(); }
      return p;
    },
    async clear(payload) {
      await runner.reset(payload.accountId);
      await enqueue(() => repository.clear(payload.accountId));
      const p = await readPrefs();
      if (!payload.accountId || p.accountId === payload.accountId) await storage.set({ [ANALYTICS_KEYS.prefs]: { mode: 'manual', autoSync: false } });
      return status();
    },
    async diagnostics() {
      await restoreDiagnostics();
      const { data, sync } = await load();
      return { generatedAt: new Date(now()).toISOString(), captures: diagnostics, seen: seenOps,
        sync: { running: sync.running, trigger: sync.trigger, lastSuccessAt: sync.lastSuccessAt, error: sync.error },
        accounts: Object.values(data.accounts).map(accountSummary) };
    },
    readOverview: accountId => repository.read({ accountId, since: now() - 8 * DAY, kinds: ['daily'] }),
    readAccount: accountId => repository.read({ accountId, since: now() - 181 * DAY })
  };
}
