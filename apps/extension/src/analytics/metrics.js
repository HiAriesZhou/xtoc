// Deterministic analysis over stored analytics. Every number shown in the
// Analytics page comes from here; AI may only interpret these results.
import { dayKey } from './parse.js';

export const DAY_MS = 86400000;
const BASELINE_POSTS = 30;
const MIN_BASELINE = 5;
const OUTLIER_Z = 3.5;

export const sum = (values) => values.reduce((total, value) => total + (value || 0), 0);
export const rate = (part, whole) => (Number.isFinite(part) && Number.isFinite(whole) && whole > 0 ? part / whole : null);

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
  const out = { days: 0, metricDays: {} };
  for (const key of keys) {
    const day = daily[key];
    if (!day) continue;
    out.days++;
    for (const [name, value] of Object.entries(day)) {
      if (!Number.isFinite(value)) continue;
      out[name] = (out[name] || 0) + value;
      out.metricDays[name] = (out.metricDays[name] || 0) + 1;
    }
  }
  return out;
}

// Missing fields remain unknown, including totals whose metric coverage is incomplete.
export const metricValue = (totals, key) =>
  totals.metricDays && totals.metricDays[key] !== totals.days ? null : totals[key] ?? null;

export function periodBounds(today, days) {
  const end = Date.parse(`${dayKey(today)}T00:00:00Z`);
  return { start: end - days * DAY_MS, end };
}

export function derived(t) {
  const value = (key) => metricValue(t, key);
  const impressions = value('Impressions');
  const follows = value('Follows'), unfollows = value('Unfollows');
  return {
    engagementRate: rate(value('Engagements'), impressions),
    profileVisitRate: rate(value('ProfileVisits'), impressions),
    followsPer1k: rate(follows === null ? null : follows * 1000, impressions),
    netFollows: follows === null || unfollows === null ? null : follows - unfollows,
    bookmarkRate: rate(value('Bookmarks'), impressions),
    replyRate: rate(value('Replies'), impressions)
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

const kpiValue = (key, t, d) => (key in d ? d[key] : t.days ? metricValue(t, key) : null);

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
    start: currentKeys[0],
    end: currentKeys.at(-1),
    comparable: current.days === days && previous.days === days,
    coverage: current.days, // days of the period that have data
    current,
    previous,
    derived: cd,
    previousDerived: pd,
    kpis: KPI_DEFS.map((def) => {
      const value = current.days ? kpiValue(def.key, current, cd) : null;
      const before = previous.days ? kpiValue(def.key, previous, pd) : null;
      return { ...def, value, previous: before, change: current.days === days && previous.days === days ? change(value, before) : null };
    }),
    series: currentKeys.map((key) => ({ day: key, ...(account.daily?.[key] || {}), hasData: Boolean(account.daily?.[key]) }))
  };
}

// Funnel steps with the share that survives each step.
export function funnel(t) {
  const steps = [
    { key: 'Impressions', label: 'Impressions', value: metricValue(t, 'Impressions') },
    { key: 'ProfileVisits', label: 'Profile visits', value: metricValue(t, 'ProfileVisits') },
    { key: 'Follows', label: 'New follows', value: metricValue(t, 'Follows') }
  ];
  return steps.map((step, i) => ({ ...step, stepRate: i ? rate(step.value, steps[i - 1].value) : null }));
}

export function postStats(post) {
  const m = post.metrics || {};
  return {
    impressions: m.Impressions ?? null,
    engagementRate: rate(m.Engagements, m.Impressions),
    followsPer1k: rate(m.Follows === undefined ? null : m.Follows * 1000, m.Impressions),
    profileVisitRate: rate(m.ProfileVisits, m.Impressions),
    bookmarkRate: rate(m.Bookmarks, m.Impressions)
  };
}

// Compare only captures taken 48–50 hours after publication, never lifetime totals.
export function impressionsAt48h(post) {
  if (post.dayOnly) return null;
  const point = (post.snapshots || []).filter(([at, n]) => Number.isFinite(n) && at >= post.createdAt + 2 * DAY_MS && at <= post.createdAt + 2 * DAY_MS + 7200000).sort((a,b) => a[0]-b[0])[0];
  return point?.[1] ?? null;
}

const sortedPosts = (account) =>
  Object.values(account.posts || {}).sort((a, b) => a.createdAt - b.createdAt);

// Each post is compared with the median of the author's own previous posts of
// the same kind (posts vs replies reach very different audiences).
function withBaselines(posts) {
  const history = {}; // local per-kind lists, built in time order
  return posts.map((post, i) => {
    const own = (history[post.kind] ||= []);
    const window = own.map(impressionsAt48h).filter(Number.isFinite).slice(-BASELINE_POSTS);
    const baseline = window.length >= MIN_BASELINE ? median(window) : null;
    own.push(post);
    const stats = postStats(post);
    const at48h = impressionsAt48h(post);
    return { ...post, stats, baseline, baselineCount: window.length, at48h, multiple: baseline && at48h !== null ? at48h / baseline : null };
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
  const { start: since, end } = periodBounds(today, days);
  const all = withBaselines(sortedPosts(account));
  const inRange = all.filter((p) => p.createdAt >= since && p.createdAt < end && (kind === 'all' || p.kind === kind));
  return markOutliers(inRange).sort((a, b) => b.createdAt - a.createdAt);
}

const SORTERS = {
  impressions: (p) => p.stats.impressions,
  engagementRate: (p) => p.stats.engagementRate ?? -1,
  follows: (p) => p.metrics?.Follows ?? -1,
  bookmarks: (p) => p.metrics?.Bookmarks ?? -1,
  profileVisits: (p) => p.metrics?.ProfileVisits ?? -1,
  multiple: (p) => p.multiple ?? -1,
  date: (p) => p.createdAt
};

export const sortPosts = (posts, by = 'impressions') =>
  [...posts].sort((a, b) => (SORTERS[by] || SORTERS.impressions)(b) - (SORTERS[by] || SORTERS.impressions)(a));

const groupStats = (posts) => ({
  count: posts.length,
  medianImpressions: median(posts.map((p) => p.metrics?.Impressions).filter(Number.isFinite)),
  medianEngagementRate: median(posts.map((p) => postStats(p).engagementRate).filter((v) => v !== null)),
  followsPer1k: posts.every(p => Number.isFinite(p.metrics?.Follows) && Number.isFinite(p.metrics?.Impressions)) ? rate(sum(posts.map(p => p.metrics.Follows)) * 1000, sum(posts.map(p => p.metrics.Impressions))) : null
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
    if (post.dayOnly || !Number.isFinite(post.metrics?.Impressions)) continue; // no observation or time of day
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

// Distribution is over captured lifetime impressions of posts published in the window.
export function contentPerformance(posts) {
  const known = posts.map(p => p.stats.impressions).filter(Number.isFinite).sort((a,b)=>b-a);
  const total = sum(known);
  return { count: posts.length, measured: known.length, total, median: median(known),
    topShare: rate(known[0], total), topFiveShare: rate(sum(known.slice(0,5)), total),
    withoutTop: known.length > 1 ? sum(known.slice(1)) / (known.length-1) : null };
}
