import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audienceGrid,
  breakdown,
  heatmapMetric,
  dayRange,
  derived,
  funnel,
  median,
  postList,
  postingGrid,
  sortPosts,
  summary,
  topSlots
} from '../src/analytics/metrics.js';
import {
  digest,
  digestMarkdown,
  growthCurve,
  halfLife,
  inboundLedger,
  interactionLedger,
  interpretationInput,
  weeklyCadence
} from '../src/analytics/insights.js';

const DAY = 86400000;
const today = Date.parse('2026-10-26T12:00:00Z');
const utcParts = (ms) => {
  const d = new Date(ms);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
};

// Complete days only: summaries end with yesterday (UTC).
function dailyFor(days, values) {
  return Object.fromEntries(dayRange(today - DAY, days).map((key, i) => [key, values(i)]));
}

const post = (id, createdAt, impressions, extra = {}) => ({
  id,
  createdAt,
  text: 'a post',
  kind: 'post',
  replyTo: null,
  hashtags: [],
  links: 0,
  media: [],
  metrics: { Impressions: impressions, Engagements: impressions / 10, Follows: 1, ProfileVisits: 2 },
  ...extra
});

test('median and dayRange', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.deepEqual(dayRange(today, 3), ['2026-10-24', '2026-10-25', '2026-10-26']);
});

test('summary compares the current and previous periods', () => {
  const daily = {
    ...dailyFor(14, (i) => ({ Impressions: i < 7 ? 100 : 200, Engagements: 10, Follows: 2, Unfollows: 1, ProfileVisits: 5 }))
  };
  const s = summary({ daily: { ...daily, [dayRange(today, 1)[0]]: { Impressions: 5 } } }, { days: 7, today });
  const [impressions, engagement, net, visits] = s.kpis; // today's partial day is left out
  assert.equal(impressions.value, 1400);
  assert.equal(impressions.previous, 700);
  assert.equal(impressions.change, 1);
  assert.equal(engagement.value, 70 / 1400);
  assert.equal(net.value, 7);
  assert.equal(visits.value, 35);
  assert.equal(s.series.length, 7);
});

test('summary reports no values when there is no data, not zeros', () => {
  const s = summary({ daily: {} }, { days: 7, today });
  assert.ok(s.kpis.every((k) => k.value === null && k.change === null));
});

test('derived ratios and funnel guard against division by zero', () => {
  assert.equal(derived({}).engagementRate, null);
  assert.equal(derived({ Impressions: 1000, Follows: 5, ProfileVisits: 50 }).followConversion, 0.1);
  const steps = funnel({ Impressions: 1000, ProfileVisits: 50, Follows: 5 });
  assert.deepEqual(steps.map((s) => s.stepRate), [null, 0.05, 0.1]);
});

test('postList scores posts against the author’s own previous posts of the same kind', () => {
  const posts = {};
  for (let i = 0; i < 8; i++) posts[i] = post(String(i), today - (10 - i) * DAY, 100);
  posts.big = post('big', today - DAY, 1000);
  const list = postList({ posts }, { days: 30, today });
  const big = list.find((p) => p.id === 'big');
  assert.equal(big.baseline, 100);
  assert.equal(big.multiple, 10);
  assert.equal(big.outlier, null); // MAD is zero for identical history, so no outlier labels
  assert.equal(list.find((p) => p.id === '0').baseline, null);
  assert.deepEqual(sortPosts(list, 'impressions')[0].id, 'big');
});

test('postList flags robust outliers', () => {
  const posts = {};
  for (let i = 0; i < 20; i++) posts[i] = post(String(i), today - (25 - i) * DAY, 100 + (i % 5) * 10);
  posts.viral = post('viral', today - DAY, 50000);
  const list = postList({ posts }, { days: 30, today });
  assert.equal(list.find((p) => p.id === 'viral').outlier, 'high');
});

test('breakdown groups by format, media, links and length', () => {
  const posts = [
    post('1', today, 100),
    post('2', today, 300, { media: ['photo'] }),
    post('3', today, 50, { links: 1 }),
    post('4', today, 10, { kind: 'reply' })
  ];
  const result = Object.fromEntries(breakdown(posts).map((d) => [d.key, d]));
  assert.deepEqual(result.kind.groups.map((g) => [g.key, g.count]), [['post', 3], ['reply', 1]]);
  assert.deepEqual(result.media.groups.map((g) => [g.key, g.count]), [['text', 2], ['photo', 1]]);
  assert.deepEqual(result.link.groups.map((g) => [g.key, g.medianImpressions]), [['nolink', 200], ['link', 50]]);
});

test('postingGrid and audienceGrid place values by weekday and hour', () => {
  const monday9 = Date.parse('2026-10-26T09:00:00Z');
  const grid = postingGrid([post('1', monday9, 100), post('2', monday9 + 60000, 300)], utcParts);
  assert.deepEqual(grid[1][9], { count: 2, value: 200 });
  const heat = audienceGrid({ '2026-10-26T09': { Impressions: 40 }, '2026-10-19T09': { Impressions: 20 } }, 'Impressions', utcParts);
  assert.deepEqual(heat[1][9], { count: 2, value: 30 });
  assert.deepEqual(topSlots(heat)[0], { day: 1, hour: 9, count: 2, value: 30 });
});

test('interactionLedger sums the return of replies per account and skips self-replies', () => {
  const posts = {
    a: post('a', today - DAY, 500, { kind: 'reply', replyTo: { handle: 'alice' }, metrics: { Impressions: 500, Follows: 3, ProfileVisits: 9 } }),
    b: post('b', today - 2 * DAY, 300, { kind: 'reply', replyTo: { handle: 'alice' }, metrics: { Impressions: 300, Follows: 1 } }),
    c: post('c', today - DAY, 900, { kind: 'reply', replyTo: { handle: 'bob' }, metrics: { Impressions: 900 } }),
    d: post('d', today - DAY, 999, { kind: 'reply', replyTo: { handle: 'me' } }),
    e: post('e', today - 200 * DAY, 999, { kind: 'reply', replyTo: { handle: 'old' } })
  };
  const rows = interactionLedger({ handle: 'Me', posts }, { today });
  assert.deepEqual(rows.map((r) => r.handle), ['bob', 'alice']);
  const alice = rows[1];
  assert.equal(alice.replies, 2);
  assert.equal(alice.impressions, 800);
  assert.equal(alice.follows, 4);
  assert.equal(alice.followsPerReply, 2);
  assert.equal(alice.weekly.at(-1), 2);
  assert.equal(alice.trend, 'up');
});

test('growthCurve and halfLife interpolate between snapshots', () => {
  const created = Date.parse('2026-10-20T00:00:00Z');
  const p = { createdAt: created, snapshots: [[created + 3600000, 100], [created + 3 * 3600000, 300], [created + 10 * 3600000, 400]] };
  assert.deepEqual(growthCurve(p).map((x) => x.hours), [1, 3, 10]);
  assert.equal(halfLife(p), 2); // 200 of 400 reached between hour 1 (100) and hour 3 (300)
  assert.equal(halfLife({ createdAt: created, snapshots: [[created + 3600000, 10]] }), null);
  assert.equal(halfLife({ createdAt: created, snapshots: [[created + 48 * 3600000, 900], [created + 50 * 3600000, 1000]] }), null);
});

test('weeklyCadence counts posts and replies per week', () => {
  const posts = { 1: post('1', today - DAY, 100), 2: post('2', today - DAY, 100, { kind: 'reply' }) };
  const weeks = weeklyCadence({ posts, daily: {} }, { weeks: 2, today });
  assert.equal(weeks.length, 2);
  assert.deepEqual([weeks[1].posts, weeks[1].replies, weeks[1].impressions], [1, 1, 200]);
});

test('digest and Markdown summarize the period without inventing data', () => {
  const daily = dailyFor(14, () => ({ Impressions: 100, Engagements: 5, Follows: 1, ProfileVisits: 4 }));
  const account = { handle: 'example', daily, posts: { 1: post('1', today - DAY, 700) } };
  const d = digest(account, { days: 7, today });
  assert.ok(d.lines[0].startsWith('Impressions: 700'));
  assert.ok(d.lines.some((line) => line.includes('25.0% of profile visits')));
  const md = digestMarkdown(account, { days: 7, today });
  assert.match(md, /^---\ntitle: "@example analytics 2026-10-19 – 2026-10-25"/);
  assert.match(md, /\| Impressions \| 700 \| 0% \|/);
  const empty = digest({ daily: {}, posts: {} }, { days: 7, today });
  assert.deepEqual(empty.lines, ['No analytics for this period yet. Sync from Analytics to load it.']);
});

test('interpretationInput contains aggregates only, never post text or handles', () => {
  const account = {
    handle: 'example',
    daily: dailyFor(28, () => ({ Impressions: 100 })),
    posts: { 1: post('1', today - DAY, 700, { text: 'secret draft words' }), 2: post('2', today - DAY, 70, { kind: 'reply', replyTo: { handle: 'alice' } }) }
  };
  const json = JSON.stringify(interpretationInput(account, { today }));
  assert.doesNotMatch(json, /secret draft|alice|example/);
  assert.match(json, /"posts":2/);
});

test('interactionLedger trends cover 8 weeks even when totals cover a shorter period', () => {
  const reply = (id, daysAgo) =>
    post(id, today - daysAgo * DAY, 100, { kind: 'reply', replyTo: { handle: 'alice' }, metrics: { Impressions: 100 } });
  const posts = { a: reply('a', 50), b: reply('b', 45), c: reply('c', 40), d: reply('d', 2) };
  const [alice] = interactionLedger({ handle: 'me', posts }, { days: 7, today });
  assert.equal(alice.replies, 1);
  assert.equal(alice.impressions, 100);
  assert.equal(alice.weekly.reduce((a, b) => a + b, 0), 4);
  assert.equal(alice.trend, 'down');
  assert.deepEqual(interactionLedger({ posts: { a: reply('a', 50) } }, { days: 7, today }), []);
});

test('inboundLedger shows who engages with you and whether you replied', () => {
  const inbound = {
    1: { id: '1', handle: 'alice', createdAt: today - DAY, kind: 'reply' },
    2: { id: '2', handle: 'alice', createdAt: today - 2 * DAY, kind: 'mention' },
    3: { id: '3', handle: 'bob', createdAt: today - DAY, kind: 'reply' },
    4: { id: '4', handle: 'old', createdAt: today - 200 * DAY, kind: 'reply' }
  };
  const posts = { r: post('r', today - DAY, 10, { kind: 'reply', replyTo: { handle: 'bob' } }) };
  const rows = inboundLedger({ handle: 'me', inbound, posts }, { days: 30, today });
  assert.deepEqual(rows.map((r) => [r.handle, r.inbound, r.replies, r.mentions, r.yourReplies]), [
    ['alice', 2, 1, 1, 0],
    ['bob', 1, 1, 0, 1]
  ]);
  const ledger = interactionLedger({ handle: 'me', inbound, posts }, { days: 30, today });
  assert.equal(ledger[0].inbound, 1);
});

test('audienceGrid falls back to the metric X returned (the heatmap defaults to Likes)', () => {
  const grid = audienceGrid({ '2026-10-26T09': { Likes: 4 } }, undefined, utcParts);
  assert.deepEqual(grid[1][9], { count: 1, value: 4 });
  assert.equal(heatmapMetric({ a: { Likes: 1 } }), 'Likes');
  assert.equal(heatmapMetric({ a: { Likes: 1, Impressions: 3 } }), 'Impressions');
  assert.equal(heatmapMetric({}), null);
});

test('summary reports how many days of the period have data', () => {
  const daily = dailyFor(7, () => ({ Impressions: 10 }));
  const s = summary({ daily }, { days: 28, today });
  assert.equal(s.coverage, 7);
});

test('heatmapMetric takes the metric present in most hours', () => {
  const hourly = { a: { Likes: 1 }, b: { Likes: 2 }, c: { Likes: 3, Impressions: 9 } };
  assert.equal(heatmapMetric(hourly), 'Likes');
  assert.equal(heatmapMetric({ a: { Likes: 1, Impressions: 2 } }), 'Impressions');
});
