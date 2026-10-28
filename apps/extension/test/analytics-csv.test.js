import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAnalyticsCsv, parseCsvRows } from '../src/analytics/csv.js';
import { applyCapture, emptyAnalytics } from '../src/analytics/store.js';
import { postingGrid } from '../src/analytics/metrics.js';

const OVERVIEW = [
  'Date,Impressions,Likes,Engagements,Bookmarks,Shares,New follows,Unfollows,Replies,Reposts,Profile visits,Create Post,Video views,Media views',
  '"Sat, Oct 24, 2026",1200,30,45,2,1,4,1,5,3,10,2,0,7',
  '"Fri, Oct 23, 2026",800,20,30,1,0,2,0,3,1,6,1,0,3'
].join('\n');

const CONTENT = [
  'Post id,Date,Post text,Post Link,Impressions,Likes,Engagements,Bookmarks,Shares,New follows,Replies,Reposts,Profile visits,Detail Expands,URL Clicks,Hashtag Clicks,Permalink Clicks',
  '111,"Sat, Oct 24, 2026","@alice thanks, ""quoted"" text",https://x.com/example/status/111,500,5,12,1,0,2,1,0,4,3,0,0,1',
  '112,"Fri, Oct 23, 2026","line one\nline two",https://x.com/example/status/112,90,1,2,0,0,0,0,0,1,0,0,0,0'
].join('\n');

test('parseCsvRows handles quotes, escaped quotes, newlines and a BOM', () => {
  const rows = parseCsvRows('﻿a,b\n"x, y","say ""hi"""\n"multi\nline",2\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', '2']]);
});

test('overview CSV becomes daily metrics', () => {
  const parsed = parseAnalyticsCsv(OVERVIEW);
  assert.equal(parsed.kind, 'overview');
  assert.deepEqual(parsed.days['2026-10-24'], {
    Impressions: 1200, Likes: 30, Engagements: 45, Bookmarks: 2, Shares: 1, Follows: 4, Unfollows: 1, Replies: 5, Reposts: 3, ProfileVisits: 10, Posts: 2
  });
});

test('content CSV becomes day-precision posts with reply targets and the account handle', () => {
  const parsed = parseAnalyticsCsv(CONTENT);
  assert.equal(parsed.kind, 'content');
  assert.equal(parsed.profile.handle, 'example');
  const [reply, post] = parsed.posts;
  assert.equal(reply.kind, 'reply');
  assert.equal(reply.replyTo.handle, 'alice');
  assert.equal(reply.dayOnly, true);
  assert.equal(reply.metrics.Follows, 2);
  assert.equal(post.text, 'line one\nline two');
});

test('CSV posts keep an existing precise timestamp and stay out of the hour grid', () => {
  const precise = Date.parse('2026-10-24T09:30:00Z');
  let state = applyCapture(emptyAnalytics(), { operation: 'contentPageQuery', accountId: '1', posts: [{ id: '111', createdAt: precise, text: 'x', kind: 'post', replyTo: null, hashtags: [], links: 0, media: [], metrics: { Impressions: 100 } }], profile: { handle: 'example' } }, { now: 1 });
  const csv = parseAnalyticsCsv(CONTENT);
  state = applyCapture(state, { operation: 'contentPageQuery', accountId: '1', posts: csv.posts, profile: csv.profile }, { now: 2, source: 'csv' });
  assert.equal(state.accounts['1'].posts['111'].createdAt, precise);
  assert.equal(state.accounts['1'].posts['111'].metrics.Impressions, 500);
  const grid = postingGrid([state.accounts['1'].posts['112']]);
  assert.equal(grid.flat().reduce((n, cell) => n + cell.count, 0), 0);
});

test('unknown CSVs are rejected with a clear message', () => {
  assert.throws(() => parseAnalyticsCsv('a,b\n1,2'), /not an X Analytics export/);
  assert.throws(() => parseAnalyticsCsv(''), /empty/);
});

// The user's own exports, when present locally: counts only, never values.
const real = (name) => path.join(os.homedir(), 'Downloads', name);
for (const [name, kind] of [['account_overview_analytics.csv', 'overview'], ['account_analytics_content_2026-07-29_2026-10-26.csv', 'content']]) {
  test(`real export ${kind} parses completely`, { skip: !fs.existsSync(real(name)) }, () => {
    const text = fs.readFileSync(real(name), 'utf8');
    const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell !== '')).length - 1;
    const parsed = parseAnalyticsCsv(text);
    assert.equal(parsed.kind, kind);
    assert.equal(kind === 'overview' ? Object.keys(parsed.days).length : parsed.posts.length, rows);
  });
}

test('CSV edge cases fail with a clear message', () => {
  assert.throws(() => parseCsvRows('a,b\n"open,1'), /unclosed quote/);
  const localized = 'Date,Impressions,Unfollows\n24/10/2026,5,0';
  assert.throws(() => parseAnalyticsCsv(localized), /No rows could be read/);
  assert.deepEqual(parseCsvRows('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('a CSV import never lowers synced numbers and adds no growth snapshot', () => {
  const synced = { id: '111', createdAt: Date.parse('2026-10-24T09:30:00Z'), text: 'x', kind: 'post', replyTo: null, hashtags: [], links: 0, media: [], metrics: { Impressions: 900, Likes: 3 } };
  let state = applyCapture(emptyAnalytics(), { operation: 'contentPageQuery', accountId: '1', posts: [synced], profile: {} }, { now: 1 });
  const csv = parseAnalyticsCsv(CONTENT);
  state = applyCapture(state, { operation: 'contentPageQuery', accountId: '1', posts: csv.posts, profile: {} }, { now: 2, source: 'csv' });
  const post = state.accounts['1'].posts['111'];
  assert.equal(post.metrics.Impressions, 900);
  assert.equal(post.metrics.Follows, 2);
  assert.equal(post.snapshots.length, 1);
  state = applyCapture(state, { operation: 'accountOverviewDailyQuery', accountId: '1', days: { '2026-10-24': { Impressions: 50 } } }, { now: 3 });
  state = applyCapture(state, { operation: 'accountOverviewDailyQuery', accountId: '1', days: parseAnalyticsCsv(OVERVIEW).days }, { now: 4, source: 'csv' });
  assert.equal(state.accounts['1'].daily['2026-10-24'].Impressions, 1200);
});
