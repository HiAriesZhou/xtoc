import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsSync } from '../src/analytics-sync.js';
import { ALARM_NAME, BATCH_MS, CONTINUE_DELAY, DAY, SYNC_INTERVAL, coverageFor, daysBetween, planSync, refinements, syncMode, windowTask } from '../src/analytics/schedule.js';
const active = [];
afterEach(async () => { for (const runner of active.splice(0)) await runner.pause(); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await wait(5); } assert.fail('condition did not settle'); }
function harness({ mode = 'manual', tasks, now = Date.parse('2026-11-16T12:00:00Z'), data = {}, sessions = {}, tabMap = new Map(), stepTimeoutMs = 10000, failNavigation = false } = {}) {
  let clock = now, nextId = 10;
  const events = { updated: [], removed: [] }, log = [], scheduled = new Map();
  const area = values => ({ get: async key => ({ [key]: structuredClone(values[key]) }), set: async patch => Object.assign(values, structuredClone(patch)), remove: async key => { delete values[key]; } });
  data.xtocAnalyticsPrefs ||= { mode, accountId: '123' };
  data.xtocAnalyticsSync ||= { version: 2, activeAccountId: '123', accounts: { '123': { pending: tasks || [], windows: {}, failures: 0 } } };
  const tabs = {
    create: async options => { log.push(['create', options]); const tab = { id: nextId++, ...options }; tabMap.set(tab.id, tab); return tab; },
    update: async (id, options) => { log.push(['update', id, options]); if (failNavigation === true || typeof failNavigation === 'number' && log.filter(e => e[0] === 'update').length === failNavigation) throw Error('navigation failed'); Object.assign(tabMap.get(id), options); },
    get: async id => { if (!tabMap.has(id)) throw Error('closed'); return tabMap.get(id); },
    remove: async id => { log.push(['remove', id]); tabMap.delete(id); events.removed.forEach(fn => fn(id)); },
    onUpdated: { addListener: fn => events.updated.push(fn) }, onRemoved: { addListener: fn => events.removed.push(fn) }
  };
  const alarms = { create: async (name, options) => scheduled.set(name, options), clear: async name => scheduled.delete(name) };
  const runner = createAnalyticsSync({ storage: area(data), session: area(sessions), repository: { accounts: async () => [{ id: '123', handle: 'fixture' }] }, tabs, alarms, now: () => clock, stepTimeoutMs, settleMs: 1 });
  active.push(runner);
  const state = () => data.xtocAnalyticsSync, q = () => state().accounts['123'];
  const sender = () => ({ tab: { id: state().active?.tabId || 10 }, documentId: state().active?.taskId, url: state().active?.url || 'https://x.com/i/account_analytics/overview' });
  async function prepare() {
    const from = sender(), task = await runner.window('analytics:window', {}, from);
    await runner.window('analytics:window-identity', { id: task.id }, from);
    await runner.window('analytics:window-armed', { id: task.id }, from);
    await runner.window('analytics:window-ready', { id: task.id }, from);
    return { from, task };
  }
  async function complete() {
    const { from, task } = await prepare();
    const parsed = task.kind === 'overview' ? { days: Object.fromEntries(daysBetween(task.from, task.to).map(day => [day, { Impressions: 1 }])) } : { posts: [], rowCount: 0, dropped: {} };
    await runner.capture({ requestedAt: clock, range: { from: task.from, to: task.to } }, { operation: task.expect, accountId: '123', ...parsed }, from);
    await until(() => !runner.isRunning() || state().active.taskId !== task.id);
  }
  return { runner, data, sessions, tabMap, log, scheduled, events, state, q, sender, prepare, complete, advance: ms => { clock += ms; }, now: () => clock };
}
const task = (day = '2026-11-15', kind = 'overview') => windowTask(kind, day, day);

test('plan prioritizes 56 complete days, then recent, daily, and one-year windows', () => {
  const tasks = planSync({}, Date.parse('2026-11-16T12:00:00Z'));
  assert.equal(tasks[0].kind, 'overview');
  assert.equal(tasks[0].from, '2026-10-19'); assert.equal(tasks[1].from, '2026-09-21');
  assert.equal(tasks.find(t => t.cadence === 'recent').to, '2026-11-16');
  assert.equal(tasks.filter(t => t.kind === 'content').at(-1).from, '2025-11-16');
  assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length);
  assert.ok(tasks.some(t => t.kind === 'overview' && t.cadence === 'daily'));
  assert.equal(syncMode({ autoSync: true }), 'visit'); assert.equal(syncMode({}), 'manual');
});

test('coverage distinguishes missing, zero, dropped, and capped responses', () => {
  const window = windowTask('overview', '2026-11-14', '2026-11-15');
  const covered = coverageFor(window, { days: { '2026-11-14': { Impressions: 0 } } });
  assert.deepEqual(covered.missingDays, ['2026-11-15']); assert.equal(covered.metricDays.Impressions, 1);
  assert.equal(covered.status, 'partial'); assert.equal(refinements(window, covered)[0].refined, true);
  assert.deepEqual(refinements({ ...window, refined: true }, covered), []);
  assert.equal(coverageFor(task(undefined, 'content'), { rowCount: 0, dropped: {} }).status, 'complete');
  assert.equal(coverageFor(task(undefined, 'content'), { rowCount: 1, dropped: { invalid: 1 } }).status, 'partial');
  const capped = coverageFor({ ...window, kind: 'content' }, { rowCount: 1000 });
  assert.equal(capped.truncated, true); assert.equal(refinements({ ...window, kind: 'content' }, capped).length, 2);
  assert.deepEqual(refinements(task(), { truncated: true, missingDays: [] }), []);
});

test('single inactive tab and durable queue advance only on verified capture', async () => {
  const h = harness({ tasks: [task(), task('2026-11-14')] });
  await Promise.all([h.runner.start(), h.runner.start()]);
  assert.deepEqual(h.log[0], ['create', { url: 'about:blank', active: false }]);
  assert.equal(h.log.filter(e => e[0] === 'create').length, 1);
  assert.equal(h.scheduled.get(ALARM_NAME).when, h.now() + BATCH_MS);
  const { from, task: current } = await h.prepare();
  const parsed = { accountId: '123', operation: current.expect, days: { '2026-11-15': { Impressions: 1 } } };
  await h.runner.capture({ requestedAt: h.now() - 1 }, parsed, from);
  assert.equal(h.q().pending.length, 2);
  await h.runner.capture({ requestedAt: h.now(), range: { from: '2026-11-14', to: '2026-11-14' } }, parsed, from);
  assert.equal(h.q().pending.length, 2);
  await h.runner.capture({ requestedAt: h.now(), range: { from: current.from, to: current.to } }, parsed, { ...from, documentId: 'stale' });
  assert.equal(h.q().pending.length, 2);
  await h.runner.capture({ requestedAt: h.now(), range: { from: current.from, to: '2026-11-16' } }, parsed, from);
  assert.equal(h.q().pending.length, 1); assert.equal(h.q().windows[current.id].status, 'complete');
  await until(() => h.state().active.taskId !== current.id);
  await h.complete();
  assert.equal(h.state().running, false); assert.equal(h.tabMap.size, 0); assert.equal(h.scheduled.size, 0);
});

test('partial response queues missing days without replacing stored checkpoint', async () => {
  const w = windowTask('overview', '2026-11-14', '2026-11-15');
  const h = harness({ tasks: [w] }); await h.runner.start(); const { from } = await h.prepare();
  await h.runner.capture({ requestedAt: h.now(), range: w }, { operation: w.expect, accountId: '123', days: { '2026-11-15': { Impressions: 0 } } }, from);
  assert.equal(h.q().windows[w.id].status, 'partial');
  assert.equal(h.q().pending[0].from, '2026-11-14');
});

test('each batch stops at eight pages and resumes in fifteen minutes', async () => {
  const tasks = Array.from({ length: 9 }, (_, i) => task(`2026-11-${String(15 - i).padStart(2, '0')}`));
  const h = harness({ tasks }); await h.runner.start();
  for (let i = 0; i < 8; i++) await h.complete();
  assert.equal(h.log.filter(e => e[0] === 'update').length, 8);
  assert.equal(h.q().pending.length, 1); assert.equal(h.scheduled.get(ALARM_NAME).when, h.now() + CONTINUE_DELAY);
  h.advance(CONTINUE_DELAY); await h.runner.tick(); assert.equal(h.runner.isRunning(), true);
  await h.complete(); assert.equal(h.q().pending.length, 0);
});

test('batch wall-clock limit preserves the next window', async () => {
  const h = harness({ tasks: [task(), task('2026-11-14')] }); await h.runner.start();
  h.advance(BATCH_MS); await h.complete();
  assert.equal(h.runner.isRunning(), false); assert.equal(h.q().pending.length, 1);
});

test('restart recovers unfinished window and only closes its matching session-owned tab', async () => {
  const h = harness({ tasks: [task()] }); await h.runner.start();
  const saved = structuredClone(h.data), sessions = structuredClone(h.sessions), tabMap = new Map(h.tabMap);
  await h.runner.pause();
  const next = harness({ data: saved, sessions, tabMap }); await next.runner.initialize();
  assert.equal(next.q().pending.length, 1); assert.equal(next.q().errorKind, 'interrupted');
  assert.equal(next.tabMap.size, 0); assert.equal(next.scheduled.get(ALARM_NAME).when, next.now() + CONTINUE_DELAY);
  const changed = harness({ data: { ...saved, xtocAnalyticsSync: { ...saved.xtocAnalyticsSync, running: true, active: { tabId: 10, token: 'old' } } }, sessions: { xtocAnalyticsOwnedTab: { tabId: 10, token: 'old', url: task().url } }, tabMap: new Map([[10, { url: 'https://x.com/home' }]]) });
  await changed.runner.initialize(); assert.equal(changed.tabMap.size, 1);
});

test('account mismatch pauses before accepting a capture', async () => {
  const h = harness({ tasks: [task()] }); await h.runner.start();
  await assert.rejects(h.runner.validate({ accountId: '456' }, h.sender()), /account changed/);
  assert.equal(h.q().paused, true); assert.equal(h.q().pending.length, 1); assert.equal(h.scheduled.size, 0);
});

test('identity-less capture waits for native profile verification', async () => {
  const h = harness({ tasks: [task()] }); await h.runner.start(); const from = h.sender();
  const current = await h.runner.window('analytics:window', {}, from);
  let accepted = false;
  const validating = h.runner.validate({}, from).then(() => { accepted = true; });
  await wait(10); assert.equal(accepted, false);
  await h.runner.window('analytics:window-identity', { id: current.id }, from);
  await validating; assert.equal(accepted, true);
});

test('rate limit backs off, login pauses, and disabling cancels continuations', async () => {
  const h = harness({ mode: 'background', tasks: [task()] }); await h.runner.start();
  await h.runner.seen({ status: 429 }, h.sender());
  assert.equal(h.q().errorKind, 'rate'); assert.equal(h.q().nextAttemptAt, h.now() + CONTINUE_DELAY);
  h.advance(CONTINUE_DELAY); await h.runner.tick();
  await h.runner.seen({ status: 403 }, h.sender());
  assert.equal(h.q().paused, true); assert.equal(h.scheduled.size, 0);
  await h.runner.start(); await h.runner.pause(); h.advance(DAY); await h.runner.tick();
  assert.equal(h.runner.isRunning(), false); assert.equal(h.q().continue, false);
});

test('background completion schedules six-hour updates; manual and legacy visit do not', async () => {
  for (const mode of ['background', 'manual', 'visit']) {
    const h = harness({ mode, tasks: [task()] }); await h.runner.start(); await h.complete();
    assert.equal(h.scheduled.get(ALARM_NAME)?.when, mode === 'background' ? h.now() + SYNC_INTERVAL : undefined);
  }
});

test('recent refresh takes priority over an unfinished history queue after six hours', async () => {
  const h = harness({ mode: 'background', tasks: [task('2026-01-01')] });
  Object.assign(h.q(), { historyStartedAt: h.now() - DAY, lastRecentAt: h.now() - SYNC_INTERVAL, lastDailyAt: h.now(), lastWeeklyAt: h.now() });
  await h.runner.start(); assert.equal(h.q().pending[0].cadence, 'recent');
  assert.ok(h.q().pending.some(t => t.from === '2026-01-01'));
});

test('unsupported date remains explicit and does not block later windows', async () => {
  const h = harness({ tasks: [task('2025-11-15'), task()] }); await h.runner.start(); const { from, task: current } = await h.prepare();
  await h.runner.window('analytics:window-error', { id: current.id, code: 'range-unavailable' }, from);
  assert.equal(h.q().windows[current.id].status, 'unavailable'); assert.equal(h.q().pending.length, 1);
});

test('timeout preserves pending work and schedules bounded retry', async () => {
  const h = harness({ tasks: [task()], stepTimeoutMs: 15 }); await h.runner.start();
  await until(() => !h.runner.isRunning());
  assert.equal(h.q().pending.length, 1); assert.equal(h.q().errorKind, 'timeout'); assert.equal(h.tabMap.size, 0);
});


test('spent daily budget does not create an orphan blank tab', async () => {
  const h = harness({ tasks: [task()] });
  h.state().budget = { day: '2026-11-16', pages: 48 };
  await h.runner.start();
  assert.equal(h.runner.isRunning(), false);
  assert.equal(h.log.filter(e => e[0] === 'create').length, 0);
  assert.equal(h.tabMap.size, 0);
  assert.equal(h.q().pending.length, 1);
  assert.equal(h.q().nextAttemptAt, Date.parse('2026-11-17T00:00:00Z'));
});

test('failed first navigation closes its owned blank tab', async () => {
  const h = harness({ tasks: [task()], failNavigation: true }); await h.runner.start();
  assert.equal(h.runner.isRunning(), false);
  assert.equal(h.tabMap.size, 0);
  assert.equal(h.q().errorKind, 'network');
  assert.equal(h.q().pending.length, 1);
});


test('failed subsequent navigation closes the previous controlled page', async () => {
  const audience = { id: 'audience', kind: 'audience', url: 'https://x.com/i/account_analytics/audience', expect: 'audienceOverviewDataQuery' };
  const h = harness({ tasks: [task(), audience], failNavigation: 2 });
  await h.runner.start(); await h.complete();
  assert.equal(h.runner.isRunning(), false);
  assert.equal(h.tabMap.size, 0);
  assert.equal(h.q().errorKind, 'network');
  assert.equal(h.q().pending[0].id, 'audience');
});


test('a user-navigated sync tab is neither overwritten nor closed', async () => {
  const h = harness({ tasks: [task(), task('2026-11-14')] }); await h.runner.start();
  h.tabMap.get(10).url = 'https://x.com/home';
  await h.complete();
  assert.equal(h.tabMap.get(10).url, 'https://x.com/home');
  assert.equal(h.q().errorKind, 'navigation');
  assert.equal(h.log.filter(e => e[0] === 'update').length, 1);
});
