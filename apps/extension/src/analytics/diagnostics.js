// Development diagnostics for checking the parsers against real X responses.
// Shapes keep field names and value types only; summaries keep counts, date
// ranges and key names. Neither contains text, handles or metric values.
const MAX_DEPTH = 30;
const MAX_ARRAY_SAMPLE = 25;

function merge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(source)) out[key] = key in out ? merge(out[key], value) : value;
  return out;
}

export function responseShape(value, depth = 0) {
  if (depth > MAX_DEPTH) return '…';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (!value.length) return [];
    const items = value.slice(0, MAX_ARRAY_SAMPLE).map((item) => responseShape(item, depth + 1));
    return [items.reduce((acc, item) => (typeof item === 'object' ? merge(acc, item) : acc ?? item), undefined) ?? items[0]];
  }
  if (typeof value === 'object') {
    // Maps keyed by IDs (post or user IDs, timestamps) keep one merged ':id' entry.
    let byId;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const shape = responseShape(item, depth + 1);
      if (/^\d{3,}$/.test(key)) byId = typeof shape === 'object' ? merge(byId, shape) : byId ?? shape;
      else out[key] = shape;
    }
    if (byId !== undefined) out[':id'] = byId;
    return out;
  }
  return typeof value;
}

const keysOf = (records) => [...new Set(records.flatMap((record) => Object.keys(record || {})))].sort();

export function accountSummary(account) {
  const posts = Object.values(account.posts || {});
  const days = Object.keys(account.daily || {}).sort();
  return {
    days: days.length,
    dayRange: days.length ? [days[0], days.at(-1)] : [],
    hours: Object.keys(account.hourly || {}).length,
    heatmapHours: Object.keys(account.heatmap || {}).length,
    posts: posts.length,
    replies: posts.filter((post) => post.kind === 'reply').length,
    repliesWithTarget: posts.filter((post) => post.replyTo?.handle).length,
    snapshots: posts.reduce((total, post) => total + (post.snapshots?.length || 0), 0),
    postMetricKeys: keysOf(posts.map((post) => post.metrics)),
    dayMetricKeys: keysOf(Object.values(account.daily || {})),
    audience: account.audience
      ? Object.fromEntries(
          Object.entries(account.audience)
            .filter(([key]) => key !== 'capturedAt')
            .map(([key, groups]) => [key, Object.keys(groups || {}).length])
        )
      : null,
    infoKeys: Object.keys(account.info || {}).sort(),
    hasHandle: Boolean(account.handle),
    inbound: Object.keys(account.inbound || {}).length
  };
}
