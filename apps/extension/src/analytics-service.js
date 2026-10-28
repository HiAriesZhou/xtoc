// Background side of XTOC Analytics: stores captures from X's own analytics
// pages and runs a sync, which opens those pages in an inactive tab so X loads
// its data and the MAIN-world tap copies it. XTOC sends no requests of its own.
import {
  autoSyncDue,
  CONTENT_PAGE_LIMIT,
  isCapturePage,
  isPremiumRedirect,
  olderContentStep,
  OPERATIONS,
  syncSteps
} from './analytics/operations.js';
import { parseCapture } from './analytics/parse.js';
import { accountSummary, responseShape } from './analytics/diagnostics.js';
import { ANALYTICS_KEYS, applyCapture, emptyAnalytics, readAnalytics } from './analytics/store.js';

// Kept under the ~30 s after which an idle MV3 worker may be stopped; a run
// lost that way is cleaned up by recover() on the next event.
const STEP_TIMEOUT_MS = 25000;
const SETTLE_MS = 2500; // let optional queries on the same page arrive
const MAX_STEPS = 8;
const KNOWN = new Set(Object.values(OPERATIONS));

const DIAGNOSTICS_KEY = 'xtocAnalyticsDiagnostics'; // session storage: shapes only

export function createAnalyticsService({
  storage = chrome.storage.local,
  session = globalThis.chrome?.storage?.session,
  tabs = chrome.tabs,
  now = Date.now,
  stepTimeoutMs = STEP_TIMEOUT_MS,
  settleMs = SETTLE_MS
}) {
  const tabAccounts = new Map(); // tabId -> account ID seen on the current page of that tab
  let run = null;
  let starting = null;
  let writes = Promise.resolve(); // analytics writes, separate from the Library queue

  // Last capture per operation, for development diagnostics: field names and
  // types, page path and outcome. Never values, so it is safe to download.
  let diagnostics = {};
  async function note(operation, sender, outcome, body) {
    let path = '';
    try {
      path = new URL(sender.url).pathname;
    } catch {
      // No page URL.
    }
    diagnostics = {
      ...diagnostics,
      [operation]: { at: new Date(now()).toISOString(), path, ...outcome, shape: body === undefined ? null : responseShape(body) }
    };
    try {
      await session?.set({ [DIAGNOSTICS_KEY]: diagnostics });
    } catch {
      // Session storage unavailable; the in-memory copy remains.
    }
  }

  function enqueue(fn) {
    const work = writes.then(fn);
    writes = work.catch(() => {});
    return work;
  }

  const read = async (key) => (await storage.get(key))[key];
  const readPrefs = async () => ({ autoSync: false, ...(await read(ANALYTICS_KEYS.prefs)) });
  const readSync = async () => (await read(ANALYTICS_KEYS.sync)) || {};
  const writeSync = (value) => storage.set({ [ANALYTICS_KEYS.sync]: value });

  async function load() {
    await recover();
    const [data, prefs, sync] = await Promise.all([read(ANALYTICS_KEYS.data), readPrefs(), readSync()]);
    return { data: readAnalytics(data), prefs, sync: { ...sync, running: Boolean(run) } };
  }

  async function store(operation, body, tabId) {
    const parsed = parseCapture(operation, body);
    await enqueue(async () => {
      const state = readAnalytics(await read(ANALYTICS_KEYS.data));
      const next = applyCapture(state, parsed, { now: now(), accountHint: tabAccounts.get(tabId) });
      try {
        await storage.set({ [ANALYTICS_KEYS.data]: next });
      } catch {
        throw new Error('Could not save analytics locally. Storage may be full.');
      }
    });
    if (parsed.accountId && tabId !== undefined) tabAccounts.set(tabId, parsed.accountId);
    return parsed;
  }

  const recordCounts = (parsed) =>
    Object.fromEntries(
      ['days', 'hours', 'heatmap', 'posts', 'mentions']
        .filter((key) => parsed[key] !== undefined)
        .map((key) => [key, Array.isArray(parsed[key]) ? parsed[key].length : Object.keys(parsed[key]).length])
    );

  async function finish(error) {
    if (!run) return;
    const done = run;
    run = null;
    clearTimeout(done.timer);
    clearTimeout(done.settle);
    tabs.remove(done.tabId).catch(() => {});
    tabAccounts.delete(done.tabId);
    const previous = await readSync();
    await writeSync({
      running: false,
      trigger: done.trigger,
      lastAttemptAt: new Date(done.startedAt).toISOString(),
      lastSuccessAt: error ? previous.lastSuccessAt || null : new Date(done.startedAt).toISOString(),
      ok: !error,
      error: error || null,
      steps: done.steps.map((step, i) => ({
        id: step.id,
        ok: !done.missed?.includes(step.id) && (i < done.index || (!error && i === done.index))
      }))
    });
  }

  function armTimer() {
    clearTimeout(run.timer);
    const step = run.steps[run.index];
    run.timer = setTimeout(() => {
      if (!step.optional) {
        finish(`X did not load the ${step.id.replace('-', ' ')} page in time. Try again, or open X Analytics once to check you are signed in.`);
        return;
      }
      run.missed = [...(run.missed || []), step.id];
      advance();
    }, stepTimeoutMs);
  }

  async function advance() {
    if (!run) return;
    run.index++;
    if (run.index >= run.steps.length) return finish(null);
    armTimer();
    try {
      await tabs.update(run.tabId, { url: run.steps[run.index].url });
    } catch {
      await finish('The sync tab was closed.');
    }
  }

  function onCapture(tabId, operation, parsed) {
    if (!run || tabId !== run.tabId || run.settle) return;
    const step = run.steps[run.index];
    if (operation !== step.expect) return;
    if (operation === OPERATIONS.content && parsed.rowCount >= CONTENT_PAGE_LIMIT && run.steps.length < MAX_STEPS) {
      const oldest = Math.min(...parsed.posts.map((post) => post.createdAt));
      const older = olderContentStep(step.range, oldest);
      if (older) run.steps.splice(run.index + 1, 0, older);
    }
    clearTimeout(run.timer);
    run.settle = setTimeout(() => {
      if (!run) return;
      run.settle = null;
      advance();
    }, settleMs);
  }

  async function startSync(trigger) {
    if (run) return { running: true };
    if (starting) return starting;
    starting = (async () => {
      const sync = await readSync();
      const steps = syncSteps(sync.lastSuccessAt, now());
      const tab = await tabs.create({ url: steps[0].url, active: false });
      run = { trigger, tabId: tab.id, steps, index: 0, startedAt: now(), timer: null, settle: null };
      // Recorded now, so a run lost with the worker still counts toward the daily limit.
      await writeSync({
        ...sync,
        running: true,
        tabId: tab.id,
        lastAttemptAt: new Date(run.startedAt).toISOString()
      });
      armTimer();
      return { running: true };
    })();
    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  // A stored running flag without a run in memory means the browser stopped
  // the worker mid-sync: close the leftover tab and report it.
  async function recover() {
    if (run || starting) return;
    const sync = await readSync();
    if (!sync.running) return;
    if (Number.isInteger(sync.tabId)) tabs.remove(sync.tabId).catch(() => {});
    await writeSync({ ...sync, running: false, ok: false, error: 'The last sync was interrupted. Try again.' });
  }

  tabs.onUpdated?.addListener((tabId, change) => {
    if (!change.url) return;
    tabAccounts.delete(tabId); // a new page may belong to another account
    if (run && tabId === run.tabId && isPremiumRedirect(change.url)) {
      finish('X Analytics needs X Premium and a signed-in account in this browser.');
    }
  });
  tabs.onRemoved?.addListener((tabId) => {
    tabAccounts.delete(tabId);
    if (run && tabId === run.tabId) {
      run.tabId = -1;
      finish('The sync tab was closed before it finished.');
    }
  });

  async function readDiagnostics() {
    try {
      const saved = (await session?.get(DIAGNOSTICS_KEY))?.[DIAGNOSTICS_KEY];
      if (saved) diagnostics = { ...saved, ...diagnostics };
    } catch {
      // Use the in-memory copy.
    }
    const { data, sync } = await load();
    return {
      generatedAt: new Date(now()).toISOString(),
      captures: diagnostics,
      sync,
      accounts: Object.values(data.accounts).map(accountSummary)
    };
  }

  return {
    load,
    recover,
    diagnostics: readDiagnostics,
    async capture(payload, sender) {
      const tabId = sender.tab?.id;
      if (!KNOWN.has(payload.operation)) throw new Error('Unsupported analytics operation.');
      // Page scripts can post messages on any x.com page; only analytics pages count.
      if (!isCapturePage(sender.url, payload.operation) && !(run && tabId === run.tabId)) {
        await note(payload.operation, sender, { accepted: false }, payload.body);
        return { stored: false };
      }
      await recover();
      let parsed;
      try {
        parsed = await store(payload.operation, payload.body, tabId);
      } catch (error) {
        await note(payload.operation, sender, { accepted: true, error: error.message }, payload.body);
        throw error;
      }
      await note(payload.operation, sender, { accepted: true, error: null, records: recordCounts(parsed) }, payload.body);
      onCapture(tabId, payload.operation, parsed);
      return { stored: true };
    },
    async visit() {
      await recover();
      if (run || starting) return { started: false };
      const [prefs, sync] = await Promise.all([readPrefs(), readSync()]);
      if (!autoSyncDue({ autoSync: prefs.autoSync, lastAttemptAt: sync.lastAttemptAt }, now())) return { started: false };
      await startSync('auto');
      return { started: true };
    },
    sync: () => startSync('manual'),
    async setPrefs(payload) {
      const prefs = { ...(await readPrefs()), autoSync: payload.autoSync === true };
      await storage.set({ [ANALYTICS_KEYS.prefs]: prefs });
      return prefs;
    },
    async clear(payload) {
      await enqueue(async () => {
        const state = readAnalytics(await read(ANALYTICS_KEYS.data));
        if (!payload.accountId) return storage.set({ [ANALYTICS_KEYS.data]: emptyAnalytics() });
        const { [payload.accountId]: _removed, ...accounts } = state.accounts;
        return storage.set({ [ANALYTICS_KEYS.data]: { ...state, accounts } });
      });
      return load();
    }
  };
}
