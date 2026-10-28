import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture } from '../src/analytics/parse.js';
import { applyCapture, emptyAnalytics } from '../src/analytics/store.js';
import { postDetailSeries } from '../src/analytics/insights.js';
import { day0, postAudience, postSeries } from './analytics-fixtures.js';

test('per-post series and audience parse without an account ID', () => {
  const first = parseCapture('postDetailsProviderFirst48HoursDataQuery', postSeries('55', day0));
  assert.equal(first.accountId, '');
  assert.equal(first.postId, '55');
  assert.deepEqual(first.series['2026-10-20T02'], { Impressions: 30, Likes: 2 });
  const audience = parseCapture('postDetailsProviderAudienceQuery', postAudience('55'));
  assert.deepEqual(audience.audience.age, { Age25to34: { Impressions: 30 } });
  assert.deepEqual(audience.audience.country, { JP: { Impressions: 12 } });
  assert.throws(() => parseCapture('postDetailsProviderAudienceQuery', { data: {} }), /no post analytics/);
});

test('per-post details are stored under the post and read back as hourly points', () => {
  let state = applyCapture(emptyAnalytics(), parseCapture('postDetailsProviderFirst48HoursDataQuery', postSeries('55', day0)), { now: day0, accountHint: '1' });
  state = applyCapture(state, parseCapture('postDetailsProviderAudienceQuery', postAudience('55')), { now: day0 + 1, accountHint: '1' });
  const detail = state.accounts['1'].postDetails['55'];
  assert.ok(detail.first48['2026-10-20T00']);
  assert.ok(detail.audience.age);
  const points = postDetailSeries(detail.first48, 'Impressions');
  assert.deepEqual(points.map((p) => p.value), [10, 20, 30]);
});
