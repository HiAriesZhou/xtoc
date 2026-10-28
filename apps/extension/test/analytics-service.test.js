import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsService } from '../src/analytics-service.js';
import { ACCOUNT_ID, audience, content, day0, mentions, overviewDaily, overviewHourly, tweet } from './analytics-fixtures.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function harness({ now = Date.parse('2026-10-26T12:00:00Z'), stepTimeoutMs = 200 } = {}) {
  const data = {};
  const storage = {
    async get(key) {
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    }
  };
  const listeners = { updated: [], removed: [] };
  const log = [];
  let nextId = 10;
  const tabs = {
    async create(options) {
      log.push(['create', options.url, options.active]);
      return { id: nextId++ };
    },
    async update(id, options) {
      log.push(['update', id, options.url]);
    },
    async remove(id) {
      log.push(['remove', id]);
    },
    onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
    onRemoved: { addListener: (fn) => listeners.removed.push(fn) }
  };
  const service = createAnalyticsService({ storage, tabs, now: () => now, stepTimeoutMs, settleMs: 5 });
  return { service, data, log, listeners };
}

const fromTab = (id, url = 'https://x.com/i/account_analytics') => ({ tab: { id }, url });

test('captures from any X tab are parsed and stored per account', async () => {
  const { service } = harness();
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, fromTab(1));
  const { data } = await service.load();
  assert.equal(data.accounts[ACCOUNT_ID].daily['2026-10-20'].Impressions, 1000);
  await assert.rejects(service.capture({ operation: 'HomeTimeline', body: {} }, fromTab(1)), /Unsupported/);
});

test('captures posted on other x.com pages are ignored', async () => {
  const { service } = harness();
  const result = await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, fromTab(1, 'https://x.com/home'));
  assert.deepEqual(result, { stored: false });
  assert.deepEqual((await service.load()).data.accounts, {});
});

test('a navigation clears the account hint of that tab', async () => {
  const { service, listeners } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(3));
  listeners.updated.forEach((fn) => fn(3, { url: 'https://x.com/i/account_analytics/audience' }));
  const hourly = overviewHourly();
  delete hourly.data.viewer_v2.user_results.result.id;
  await assert.rejects(service.capture({ operation: 'accountOverviewHourlyQuery', body: hourly }, fromTab(3)), /which X account/);
});

test('a later response without an account ID uses the account seen in the same tab', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(3));
  const hourly = overviewHourly();
  delete hourly.data.viewer_v2.user_results.result.id;
  await service.capture({ operation: 'accountOverviewHourlyQuery', body: hourly }, fromTab(3));
  const { data } = await service.load();
  assert.ok(data.accounts[ACCOUNT_ID].hourly);
});

test('sync visits content, audience and overview in an inactive tab, then closes it', async () => {
  const { service, log, data } = harness();
  data.xtocAnalyticsSync = { lastSuccessAt: '2026-10-25T12:00:00.000Z' }; // one content window
  assert.deepEqual(await service.sync(), { running: true });
  assert.deepEqual(log[0].slice(0, 1).concat(log[0][2]), ['create', false]);
  assert.match(log[0][1], /\/i\/account_analytics\/content\/\?type=all&from=2026-10-24&to=2026-10-26$/);
  const tab = fromTab(10);
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, tab); // not this step's query
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, tab);
  await wait(20);
  assert.deepEqual(log.at(-1), ['update', 10, 'https://x.com/i/account_analytics/audience']);
  await service.capture({ operation: 'audienceOverviewDataQuery', body: audience() }, tab);
  await wait(20);
  assert.deepEqual(log.at(-1), ['update', 10, 'https://x.com/i/account_analytics']);
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, tab);
  await wait(20);
  assert.deepEqual(log.at(-1), ['update', 10, 'https://x.com/notifications/mentions']);
  await service.capture({ operation: 'notificationsQuery', body: mentions() }, fromTab(10, 'https://x.com/notifications/mentions'));
  await wait(20);
  assert.deepEqual(log.at(-1), ['remove', 10]);
  const loaded = await service.load();
  assert.equal(loaded.sync.ok, true);
  assert.equal(loaded.sync.running, false);
  assert.equal(loaded.sync.lastSuccessAt, '2026-10-26T12:00:00.000Z');
  assert.deepEqual(loaded.sync.steps.map((s) => s.ok), [true, true, true, true]);
  assert.ok(loaded.data.accounts[ACCOUNT_ID].inbound['501']);
});

test('a missing Mentions timeline does not fail the sync', async () => {
  const { service, data } = harness({ stepTimeoutMs: 30 });
  data.xtocAnalyticsSync = { lastSuccessAt: '2026-10-25T12:00:00.000Z' };
  await service.sync();
  const tab = fromTab(10);
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, tab);
  await wait(15);
  await service.capture({ operation: 'audienceOverviewDataQuery', body: audience() }, tab);
  await wait(15);
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, tab);
  await wait(80);
  const { sync } = await service.load();
  assert.equal(sync.ok, true);
  assert.deepEqual(sync.steps.map((s) => s.ok), [true, true, true, false]);
});

test('sync fails clearly on a Premium/login redirect, a timeout or a closed tab', async () => {
  const first = harness();
  await first.service.sync();
  first.listeners.updated.forEach((fn) => fn(10, { url: 'https://x.com/i/premium_sign_up' }));
  await wait(10);
  assert.match((await first.service.load()).sync.error, /needs X Premium/);

  const second = harness({ stepTimeoutMs: 20 });
  await second.service.sync();
  await wait(60);
  const timedOut = (await second.service.load()).sync;
  assert.match(timedOut.error, /did not load the content page/);
  assert.equal(timedOut.lastSuccessAt, null);

  const third = harness();
  await third.service.sync();
  third.listeners.removed.forEach((fn) => fn(10));
  await wait(10);
  assert.match((await third.service.load()).sync.error, /closed before it finished/);
});

test('only one sync runs at a time', async () => {
  const { service, log } = harness();
  await Promise.all([service.sync(), service.sync(), service.visit()]);
  assert.equal(log.filter((entry) => entry[0] === 'create').length, 1);
});

test('auto sync starts on an X visit only when enabled and due', async () => {
  const { service, log } = harness();
  assert.deepEqual(await service.visit(), { started: false });
  await service.setPrefs({ autoSync: true });
  assert.deepEqual(await service.visit(), { started: true });
  assert.equal(log.filter((entry) => entry[0] === 'create').length, 1);
});

test('clear removes one account or everything', async () => {
  const { service } = harness();
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, fromTab(1));
  assert.deepEqual(Object.keys((await service.clear({ accountId: '999' })).data.accounts), [ACCOUNT_ID]);
  assert.deepEqual((await service.clear({ accountId: ACCOUNT_ID })).data.accounts, {});
  assert.deepEqual((await service.clear({})).data.accounts, {});
});

test('a run lost with the worker is cleaned up on the next event and still counts as an attempt', async () => {
  const { service, data, log } = harness();
  data.xtocAnalyticsSync = { running: true, tabId: 44, lastAttemptAt: '2026-10-26T11:59:00.000Z' };
  await service.setPrefs({ autoSync: true });
  assert.deepEqual(await service.visit(), { started: false }); // attempted a minute ago
  assert.deepEqual(log.at(-1), ['remove', 44]);
  assert.match(data.xtocAnalyticsSync.error, /interrupted/);
  assert.equal(data.xtocAnalyticsSync.running, false);
});

test('starting a sync records the attempt immediately', async () => {
  const { service, data } = harness();
  await service.sync();
  assert.equal(data.xtocAnalyticsSync.lastAttemptAt, '2026-10-26T12:00:00.000Z');
  assert.equal(data.xtocAnalyticsSync.running, true);
});

test('diagnostics record shapes and outcomes per operation, without values', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0, text: 'private words' })]) }, fromTab(1));
  await service.capture({ operation: 'accountOverviewDailyQuery', body: overviewDaily() }, fromTab(1, 'https://x.com/home'));
  await assert.rejects(service.capture({ operation: 'audienceOverviewDataQuery', body: { data: null } }, fromTab(1)));
  const report = await service.diagnostics();
  assert.deepEqual(report.captures.contentPageQuery.records, { posts: 1, rows: 1, dropped: {}, postDays: ['2026-10-20', '2026-10-20'] });
  assert.equal(report.captures.contentPageQuery.path, '/i/account_analytics');
  assert.equal(report.captures.accountOverviewDailyQuery.accepted, false);
  assert.match(report.captures.audienceOverviewDataQuery.error, /no analytics data/);
  assert.equal(report.accounts[0].posts, 1);
  assert.doesNotMatch(JSON.stringify(report), /private words|example/);
});

test('seen operation names are kept for diagnostics, capped', async () => {
  const { service } = harness();
  for (let i = 0; i < 90; i++) await service.seen({ operation: `Op${i}`, status: 200, contentType: 'application/json', read: 'not captured' }, fromTab(1, 'https://x.com/notifications/mentions'));
  const report = await service.diagnostics();
  assert.equal(report.seen.length, 80);
  assert.deepEqual(Object.keys(report.seen.at(-1)).sort(), ['at', 'contentType', 'operation', 'path', 'read', 'status']);
  assert.equal(report.seen.at(-1).path, '/notifications/mentions');
});

test('NotificationsTimeline without an account ID is stored for the only account', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(1));
  const body = { data: { viewer: { timeline: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: '801', core: { user_results: { result: { legacy: { screen_name: 'zed' } } } }, legacy: { created_at: 'Tue Oct 28 08:00:00 +0000 2026' } } } } } }] }] } } } };
  await service.capture({ operation: 'NotificationsTimeline', body }, fromTab(5, 'https://x.com/notifications/mentions'));
  const { data } = await service.load();
  assert.equal(data.accounts[ACCOUNT_ID].inbound['801'].handle, 'zed');
});

test('the first sync reads 12 weeks of content in three windows', async () => {
  const { service, log } = harness();
  await service.sync();
  const tab = fromTab(10);
  for (let i = 0; i < 3; i++) {
    await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: String(i + 1), createdAt: day0 })]) }, tab);
    await wait(20);
  }
  const urls = log.filter((entry) => entry[0] !== 'remove').map((entry) => entry.at(-1) === false ? entry[1] : entry[2]);
  assert.deepEqual(urls.slice(0, 4).map((url) => url.replace(/^https:\/\/x\.com/, '')), [
    '/i/account_analytics/content/?type=all&from=2026-09-29&to=2026-10-26',
    '/i/account_analytics/content/?type=all&from=2026-09-01&to=2026-09-28',
    '/i/account_analytics/content/?type=all&from=2026-08-04&to=2026-08-31',
    '/i/account_analytics/audience'
  ]);
});
