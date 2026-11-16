import test, { afterEach } from 'node:test';
import 'fake-indexeddb/auto';
import { createAnalyticsRepository } from '../src/analytics-db.js';
import assert from 'node:assert/strict';
import { createAnalyticsService } from '../src/analytics-service.js';
import { ACCOUNT_ID, audience, content, day0, mentions, overviewDaily, overviewHourly, tweet } from './analytics-fixtures.js';

const active = [];
afterEach(async () => { for (const service of active.splice(0)) await service.pause(); });
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
  const service = createAnalyticsService({ diagnosticsEnabled: true, repository: createAnalyticsRepository({ storage, name: crypto.randomUUID() }), storage, tabs, now: () => now, stepTimeoutMs, settleMs: 5 });
  active.push(service);
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
  assert.deepEqual(report.captures.contentPageQuery.records, { posts: 1, rows: 1, dropped: {}, truncated: false });
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

test('mentions outside a sync are not guessed onto a stored account', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(1));
  const body = { data: { viewer: { timeline: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: '801', core: { user_results: { result: { legacy: { screen_name: 'zed' } } } }, legacy: { created_at: 'Tue Oct 28 08:00:00 +0000 2026' } } } } } }] }] } } } };
  await assert.rejects(service.capture({ operation: 'NotificationsTimeline', body }, fromTab(5, 'https://x.com/notifications/mentions')), /which X account/);
  const { data } = await service.load();
  assert.deepEqual(data.accounts[ACCOUNT_ID].inbound, {});
});

test('deleting analytics data makes the next sync backfill again', async () => {
  const { service, data } = harness();
  data.xtocAnalyticsSync = { lastSuccessAt: '2026-10-26T11:00:00.000Z', lastAttemptAt: '2026-10-26T11:00:00.000Z', ok: true };
  await service.clear({});
  assert.equal(data.xtocAnalyticsSync.lastSuccessAt, null);
  const { sync } = await service.load();
  assert.equal(sync.lastSuccessAt, null);
});

test('CSV import fills the account matched by the Post Link handle', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(1));
  const csv = 'Post id,Date,Post text,Post Link,Impressions,Likes,Engagements,Bookmarks,Shares,New follows,Replies,Reposts,Profile visits,Detail Expands,URL Clicks,Hashtag Clicks,Permalink Clicks\n9,"Fri, Oct 23, 2026",hi,https://x.com/example/status/9,70,1,2,0,0,0,0,0,1,0,0,0,0';
  assert.deepEqual(await service.importCsv({ text: csv }), { kind: 'content', posts: 1 });
  const { data } = await service.load();
  assert.equal(data.accounts[ACCOUNT_ID].posts['9'].metrics.Impressions, 70);
  await assert.rejects(service.importCsv({ text: 'a,b\n1,2' }), /not an X Analytics export/);
});

test('CSV import needs a known account', async () => {
  const { service } = harness();
  await assert.rejects(service.importCsv({ text: 'Date,Impressions,Unfollows\n2026-10-23,5,0' }), /Sync from X once first/);
});

test('post details go to the account that has the post, even in a new tab', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '55', createdAt: day0 })]) }, fromTab(1));
  const { postSeries } = await import('./analytics-fixtures.js');
  await service.capture({ operation: 'postDetailsProviderFirst48HoursDataQuery', body: postSeries('55', day0) }, fromTab(9, 'https://x.com/i/account_analytics/content/55'));
  const { data } = await service.load();
  assert.ok(data.accounts[ACCOUNT_ID].postDetails['55'].first48);
});

test('diagnostics paths never name a post, and other pages are not recorded', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(1, 'https://x.com/i/account_analytics/content/2112458505273983418'));
  await service.seen({ operation: 'X', status: 200 }, fromTab(1, 'https://x.com/someone/status/123456'));
  const report = await service.diagnostics();
  assert.equal(report.captures.contentPageQuery.path, '/i/account_analytics/content/:id');
  assert.equal(report.seen.length, 0);
});

test('diagnostics are off unless enabled (release builds)', async () => {
  const off = createAnalyticsService({ storage: { async get() { return {}; }, async set() {} }, tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener() {} } } });
  await off.seen({ operation: 'X' }, fromTab(1, 'https://x.com/notifications'));
  assert.deepEqual((await off.diagnostics()).seen, []);
});

test('a CSV for an account XTOC has not synced is refused, not merged elsewhere', async () => {
  const { service } = harness();
  await service.capture({ operation: 'contentPageQuery', body: content([tweet({ id: '1', createdAt: day0 })]) }, fromTab(1));
  const csv = 'Post id,Date,Post text,Post Link,Impressions,Likes,Engagements,Bookmarks,Shares,New follows,Replies,Reposts,Profile visits,Detail Expands,URL Clicks,Hashtag Clicks,Permalink Clicks\n9,"Fri, Oct 23, 2026",hi,https://x.com/someone_else/status/9,70,1,2,0,0,0,0,0,1,0,0,0,0';
  await assert.rejects(service.importCsv({ text: csv, accountId: ACCOUNT_ID }), /@someone_else/);
});

test('UI status contains only metadata even with a history above the Chrome message limit', async () => {
  const largePost = { text: 'x'.repeat(280), snapshots: Array.from({ length: 20 }, (_, i) => [1794800000000 + i * 3600000, 10000 + i, 100 + i]) };
  assert.ok(Buffer.byteLength(JSON.stringify(largePost)) * 100000 > 64 * 1024 * 1024);
  const service = createAnalyticsService({
    storage: { get: async () => ({}), set: async () => {} }, tabs: {},
    repository: { accounts: async () => [{ id: '123', handle: 'fixture', counts: { posts: 100000 } }], read: async () => { throw Error('UI status must not load history'); } }
  });
  const result = await service.status();
  assert.equal(result.data.accounts['123'].counts.posts, 100000);
  assert.equal(result.data.accounts['123'].posts, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1024);
});
