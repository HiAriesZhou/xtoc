import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture } from '../src/analytics/parse.js';
import { accountList, applyCapture, emptyAnalytics, readAnalytics } from '../src/analytics/store.js';
import { ACCOUNT_ID, audience, content, day0, mentions, overviewDaily, overviewHourly, tweet } from './analytics-fixtures.js';

const apply = (state, operation, body, options) => applyCapture(state, parseCapture(operation, body), options);

test('readAnalytics tolerates missing, old and damaged values', () => {
  assert.deepEqual(readAnalytics(undefined), emptyAnalytics());
  assert.deepEqual(readAnalytics({ version: 99, accounts: {} }), emptyAnalytics());
  const kept = readAnalytics({ version: 1, accounts: { 123: { id: '123' }, __proto__x: {}, abc: { id: 'abc' }, 456: 'bad' } });
  assert.deepEqual(Object.keys(kept.accounts), ['123']);
});

test('applyCapture merges days, keeps newer values and does not mutate input', () => {
  const now = day0 + 5 * 86400000;
  const first = apply(emptyAnalytics(), 'accountOverviewDailyQuery', overviewDaily({ days: 2 }), { now });
  const frozen = structuredClone(first);
  const second = apply(first, 'accountOverviewDailyQuery', overviewDaily({ days: 1, start: day0 + 86400000 }), { now });
  assert.deepEqual(first, frozen);
  const account = second.accounts[ACCOUNT_ID];
  assert.equal(account.daily['2026-10-20'].Impressions, 1000);
  assert.equal(account.daily['2026-10-21'].Impressions, 1000); // overwritten by the newer capture
  assert.equal(account.info.followers, 500);
  assert.deepEqual(account.followers['2026-10-25'], { followers: 500, verifiedFollowers: 12 });
});

test('content captures set the profile and record growth snapshots only when numbers change', () => {
  const t1 = day0 + 3600000;
  const t2 = day0 + 7200000;
  let state = apply(emptyAnalytics(), 'contentPageQuery', content([tweet({ id: '1', createdAt: day0, impressions: 100 })]), { now: t1 });
  state = apply(state, 'contentPageQuery', content([tweet({ id: '1', createdAt: day0, impressions: 100 })]), { now: t2 });
  state = apply(state, 'contentPageQuery', content([tweet({ id: '1', createdAt: day0, impressions: 250 })]), { now: t2 + 1 });
  const account = state.accounts[ACCOUNT_ID];
  assert.equal(account.handle, 'example');
  const post = account.posts['1'];
  assert.equal(post.firstSeenAt, t1);
  assert.equal(post.metrics.Impressions, 250);
  assert.deepEqual(post.snapshots.map((s) => s[1]), [100, 250]);
});

test('snapshots stay bounded and keep the first and latest', () => {
  let state = emptyAnalytics();
  for (let i = 0; i < 60; i++) {
    state = apply(state, 'contentPageQuery', content([tweet({ id: '1', createdAt: day0, impressions: 100 + i })]), { now: day0 + i * 3600000 });
  }
  const snapshots = state.accounts[ACCOUNT_ID].posts['1'].snapshots;
  assert.ok(snapshots.length <= 40);
  assert.equal(snapshots[0][1], 100);
  assert.equal(snapshots.at(-1)[1], 159);
});

test('hourly and heatmap data expire, audience is replaced', () => {
  const now = day0 + 100 * 86400000;
  let state = apply(emptyAnalytics(), 'accountOverviewHourlyQuery', overviewHourly(), { now });
  assert.deepEqual(state.accounts[ACCOUNT_ID].hourly, {});
  state = apply(state, 'audienceOverviewDataQuery', audience(), { now: day0 + 86400000 });
  assert.equal(state.accounts[ACCOUNT_ID].audience.capturedAt, day0 + 86400000);
  assert.equal(state.accounts[ACCOUNT_ID].heatmap['2026-10-20T00'].Impressions, 77);
});

test('responses without an account ID use the tab hint, or fail clearly', () => {
  const body = overviewHourly();
  delete body.data.viewer_v2.user_results.result.id;
  assert.throws(() => apply(emptyAnalytics(), 'accountOverviewHourlyQuery', body), /which X account/);
  const state = apply(emptyAnalytics(), 'accountOverviewHourlyQuery', body, { accountHint: '777', now: day0 });
  assert.deepEqual(accountList(state).map((a) => a.id), ['777']);
});

test('the store caps the number of accounts', () => {
  let state = emptyAnalytics();
  for (let i = 1; i <= 10; i++) state = applyCapture(state, { operation: 'activeFollowersTileQuery', accountId: String(i), account: {} }, { now: day0 });
  assert.throws(() => applyCapture(state, { operation: 'activeFollowersTileQuery', accountId: '11', account: {} }, { now: day0 }), /up to 10/);
  assert.doesNotThrow(() => applyCapture(state, { operation: 'activeFollowersTileQuery', accountId: '3', account: {} }, { now: day0 }));
});

test('mentions are stored as inbound interactions, skipping the account itself', () => {
  let state = apply(emptyAnalytics(), 'contentPageQuery', content([tweet({ id: '1', createdAt: day0 })]), { now: day0 });
  state = apply(state, 'notificationsQuery', mentions(), { now: day0 });
  assert.deepEqual(Object.keys(state.accounts[ACCOUNT_ID].inbound).sort(), ['501', '502']);
});
