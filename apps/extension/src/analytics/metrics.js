// Deterministic analysis over stored analytics. Every number shown in the
// Analytics page comes from here; AI may only interpret these results.
import { dayKey } from './parse.js';

export const DAY_MS = 86400000;
const BASELINE_POSTS = 30;
const MIN_BASELINE = 5;
const OUTLIER_Z = 3.5;

export const sum = (values) => values.reduce((total, value) => total + (value || 0), 0);
export const rate = (part, whole) => (whole > 0 ? part / whole : null);

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Day keys (UTC, like X's own analytics) ending at `end`, oldest first.
export function dayRange(end, days) {
  const last = Date.parse(`${dayKey(end)}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => dayKey(last - (days - 1 - i) * DAY_MS));
}

export function totals(daily = {}, keys) {
  const out = { days: 0 };
  for (const key of keys) {
    const day = daily[key];
    if (!day) continue;
    out.days++;
    for (const [name, value] of Object.entries(day)) out[name] = (out[name] || 0) + value;
  }
  return out;
}

// Ratios that explain a period: reach → attention → follow.
export function derived(t) {
  const impressions = t.Impressions || 0;
  return {
    engagementRate: rate(t.Engagements || 0, impressions),
    profileVisitRate: rate(t.ProfileVisits || 0, impressions),
    followConversion: rate(t.Follows || 0, t.ProfileVisits || 0),
    followsPer1k: impressions > 0 ? ((t.Follows || 0) / impressions) * 1000 : null,
    netFollows: (t.Follows || 0) - (t.Unfollows || 0),
    bookmarkRate: rate(t.Bookmarks || 0, impressions),
    replyRate: rate(t.Replies || 0, impressions)
  };
}

const change = (current, previous) =>
  current === null || previous === null || previous === 0 ? null : (current - previous) / Math.abs(previous);

export const KPI_DEFS = [
  { key: 'Impressions', label: 'Impressions', format: 'number' },
  { key: 'engagementRate', label: 'Engagement rate', format: 'percent' },
  { key: 'netFollows', label: 'Net follows', format: 'signed' },
  { key: 'ProfileVisits', label: 'Profile visits', format: 'number' }
];

const kpiValue = (key, t, d) => (key in d ? d[key] : t.days ? t[key] || 0 : null);

// Periods end with the last complete UTC day, so today's partial numbers do
// not make the current period look worse than the previous one.
export function summary(account, { days = 28, today = Date.now() } = {}) {
  const end = today - DAY_MS;
  const currentKeys = dayRange(end, days);
  const previousKeys = dayRange(end - days * DAY_MS, days);
  const current = totals(account.daily, currentKeys);
  const previous = totals(account.daily, previousKeys);
  const cd = derived(current);
  const pd = derived(previous);
  return {
    days,
    coverage: current.days, // days of the period that have data
    current,
    previous,
    derived: cd,
    previousDerived: pd,
    kpis: KPI_DEFS.map((def) => {
      const value = current.days ? kpiValue(def.key, current, cd) : null;
      const before = previous.days ? kpiValue(def.key, previous, pd) : null;
      return { ...def, value, previous: before, change: change(value, before) };
    }),
    series: currentKeys.map((key) => ({ day: key, ...(account.daily?.[key] || {}), hasData: Boolean(account.daily?.[key]) }))
  };
}

// Funnel steps with the share that survives each step.
export function funnel(t) {
  const steps = [
    { key: 'Impressions', label: 'Impressions', value: t.Impressions || 0 },
    { key: 'ProfileVisits', label: 'Profile visits', value: t.ProfileVisits || 0 },
    { key: 'Follows', label: 'New follows', value: t.Follows || 0 }
  ];
  return steps.map((step, i) => ({ ...step, stepRate: i ? rate(step.value, steps[i - 1].value) : null }));
}

export function postStats(post) {
  const m = post.metrics || {};
  return {
    impressions: m.Impressions || 0,
    engagementRate: rate(m.Engagements || 0, m.Impressions || 0),
    followsPer1k: m.Impressions ? ((m.Follows || 0) / m.Impressions) * 1000 : null,
    profileVisitRate: rate(m.ProfileVisits || 0, m.Impressions || 0),
    bookmarkRate: rate(m.Bookmarks || 0, m.Impressions || 0)
  };
}

const sortedPosts = (account) =>
  Object.values(account.posts || {}).sort((a, b) => a.createdAt - b.createdAt);

// Each post is compared with the median of the author's own previous posts of
// the same kind (posts vs replies reach very different audiences).
function withBaselines(posts) {
  const history = {}; // local per-kind lists, built in time order
  return posts.map((post, i) => {
    const own = (history[post.kind] ||= []);
    const pool = own.length >= MIN_BASELINE ? own : posts.slice(0, i);
    const window = pool.slice(-BASELINE_POSTS).map((p) => p.metrics?.Impressions || 0);
    const baseline = window.length >= MIN_BASELINE ? median(window) : null;
    own.push(post);
    const stats = postStats(post);
    return { ...post, stats, baseline, multiple: baseline ? stats.impressions / baseline : null };
  });
}

// Robust outliers on log impressions (median absolute deviation).
function markOutliers(posts) {
  const logs = posts.map((p) => Math.log1p(p.stats.impressions));
  const center = median(logs);
  const mad = median(logs.map((value) => Math.abs(value - center)));
  if (!mad) return posts.map((p) => ({ ...p, outlier: null }));
  return posts.map((p, i) => {
    const z = (0.6745 * (logs[i] - center)) / mad;
    return { ...p, outlier: z > OUTLIER_Z ? 'high' : z < -OUTLIER_Z ? 'low' : null };
  });
}

export function postList(account, { days = 28, today = Date.now(), kind = 'all' } = {}) {
  const since = today - days * DAY_MS;
  const all = withBaselines(sortedPosts(account));
  const inRange = all.filter((p) => p.createdAt >= since && (kind === 'all' || p.kind === kind));
  return markOutliers(inRange).sort((a, b) => b.createdAt - a.createdAt);
}

const SORTERS = {
  impressions: (p) => p.stats.impressions,
  engagementRate: (p) => p.stats.engagementRate ?? -1,
  follows: (p) => p.metrics?.Follows || 0,
  multiple: (p) => p.multiple ?? -1,
  date: (p) => p.createdAt
};

export const sortPosts = (posts, by = 'impressions') =>
  [...posts].sort((a, b) => (SORTERS[by] || SORTERS.impressions)(b) - (SORTERS[by] || SORTERS.impressions)(a));

const groupStats = (posts) => ({
  count: posts.length,
  medianImpressions: median(posts.map((p) => p.metrics?.Impressions || 0)),
  medianEngagementRate: median(posts.map((p) => postStats(p).engagementRate).filter((v) => v !== null)),
  followsPer1k: rate(sum(posts.map((p) => p.metrics?.Follows || 0)) * 1000, sum(posts.map((p) => p.metrics?.Impressions || 0)))
});

const LENGTH_BUCKETS = [
  { key: 'short', label: 'Under 80 characters', max: 80 },
  { key: 'medium', label: '80–200 characters', max: 200 },
  { key: 'long', label: 'Over 200 characters', max: Infinity }
];

const visibleLength = (post) => post.text.replace(/^(@\w+\s+)+/, '').replace(/https?:\/\/\S+/g, '').trim().length;

export const BREAKDOWNS = [
  {
    key: 'kind',
    label: 'Format',
    groups: [
      { key: 'post', label: 'Posts', test: (p) => p.kind === 'post' },
      { key: 'reply', label: 'Replies', test: (p) => p.kind === 'reply' },
      { key: 'community', label: 'Community posts', test: (p) => p.kind === 'community' }
    ]
  },
  {
    key: 'media',
    label: 'Media',
    groups: [
      { key: 'text', label: 'Text only', test: (p) => !p.media?.length },
      { key: 'photo', label: 'With image', test: (p) => p.media?.includes('photo') && !p.media.some((t) => t !== 'photo') },
      { key: 'video', label: 'With video or GIF', test: (p) => p.media?.some((t) => t === 'video' || t === 'animated_gif') }
    ]
  },
  {
    key: 'link',
    label: 'Links',
    groups: [
      { key: 'nolink', label: 'No link', test: (p) => !p.links },
      { key: 'link', label: 'With link', test: (p) => p.links > 0 }
    ]
  },
  {
    key: 'length',
    label: 'Length',
    groups: LENGTH_BUCKETS.map((bucket, i) => ({
      key: bucket.key,
      label: bucket.label,
      test: (p) => {
        const length = visibleLength(p);
        return length < bucket.max && (i === 0 || length >= LENGTH_BUCKETS[i - 1].max);
      }
    }))
  }
];

// Original posts only for media/link/length, so replies do not drown the signal.
export function breakdown(posts) {
  return BREAKDOWNS.map((dimension) => {
    const pool = dimension.key === 'kind' ? posts : posts.filter((p) => p.kind !== 'reply');
    return {
      key: dimension.key,
      label: dimension.label,
      groups: dimension.groups
        .map((group) => ({ key: group.key, label: group.label, ...groupStats(pool.filter(group.test)) }))
        .filter((group) => group.count > 0)
    };
  });
}

export const localParts = (ms) => {
  const date = new Date(ms);
  return { day: date.getDay(), hour: date.getHours() };
};

const emptyGrid = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));

// Weekday × hour of the author's own posts, by median impressions.
export function postingGrid(posts, parts = localParts) {
  const grid = emptyGrid();
  for (const post of posts) {
    if (post.dayOnly) continue; // imported from CSV: no time of day
    const { day, hour } = parts(post.createdAt);
    grid[day][hour].push(post.metrics?.Impressions || 0);
  }
  return grid.map((row) => row.map((values) => ({ count: values.length, value: median(values) })));
}

// Weekday × hour of when the audience saw the author's content (X's hourly
// heatmap, or the hourly overview). Averaged per occurrence of each slot.
// X's audience heatmap returns only the metric selected on its page (Likes
// by default), so use Impressions when present and otherwise what X sent.
// Hours kept from an earlier capture can carry another metric, so take the
// metric present in the most hours (Impressions wins a tie).
export function heatmapMetric(hourly = {}) {
  const counts = {};
  for (const values of Object.values(hourly)) for (const name of Object.keys(values || {})) counts[name] = (counts[name] || 0) + 1;
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (b === 'Impressions') - (a === 'Impressions') || a.localeCompare(b));
  return names[0] || null;
}

export function audienceGrid(hourly = {}, metric = heatmapMetric(hourly), parts = localParts) {
  const grid = emptyGrid();
  for (const [key, values] of Object.entries(hourly)) {
    const ms = Date.parse(`${key}:00:00Z`);
    if (!Number.isFinite(ms) || values?.[metric] === undefined) continue;
    const { day, hour } = parts(ms);
    grid[day][hour].push(values[metric]);
  }
  return grid.map((row) =>
    row.map((values) => ({ count: values.length, value: values.length ? sum(values) / values.length : null }))
  );
}

export function topSlots(grid, { minCount = 1, limit = 3 } = {}) {
  return grid
    .flatMap((row, day) => row.map((cell, hour) => ({ day, hour, ...cell })))
    .filter((cell) => cell.count >= minCount && cell.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
