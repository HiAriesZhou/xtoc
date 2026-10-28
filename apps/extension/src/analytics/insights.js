// Higher-level readings built on metrics.js: who replies pay off with, how
// fast posts grow, posting cadence, and a plain-language weekly digest.
import { dayKey } from './parse.js';
import { DAY_MS, dayRange, derived, median, postList, rate, sum, summary, totals } from './metrics.js';

const WEEK_MS = 7 * DAY_MS;

// Replies grouped by the account replied to. "Return" is what those replies
// earned on the author's side: reach, profile visits and new follows.
export function interactionLedger(account, { days = 90, today = Date.now(), weeks = 8 } = {}) {
  const own = (account.handle || '').toLowerCase();
  const since = today - days * DAY_MS;
  const trendSince = today - weeks * WEEK_MS;
  const rows = new Map();
  for (const post of Object.values(account.posts || {})) {
    const handle = post.replyTo?.handle;
    if (post.kind !== 'reply' || !handle || handle === own) continue;
    if (post.createdAt < Math.min(since, trendSince)) continue;
    const row = rows.get(handle) || { handle, replies: 0, impressions: 0, engagements: 0, profileVisits: 0, follows: 0, lastAt: 0, weekly: Array(weeks).fill(0) };
    // The weekly trend always covers the last `weeks` weeks; totals cover `days`.
    const week = weeks - 1 - Math.floor((today - post.createdAt) / WEEK_MS);
    if (week >= 0 && week < weeks) row.weekly[week]++;
    if (post.createdAt >= since) {
      const m = post.metrics || {};
      row.replies++;
      row.impressions += m.Impressions || 0;
      row.engagements += m.Engagements || 0;
      row.profileVisits += m.ProfileVisits || 0;
      row.follows += m.Follows || 0;
      row.lastAt = Math.max(row.lastAt, post.createdAt);
    }
    rows.set(handle, row);
  }
  const inbound = inboundCounts(account, since);
  return [...rows.values()]
    .filter((row) => row.replies > 0)
    .map((row) => ({ ...row, inbound: inbound.get(row.handle) || 0 }))
    .map((row) => ({
      ...row,
      impressionsPerReply: row.impressions / row.replies,
      followsPerReply: row.follows / row.replies,
      trend: trendOf(row.weekly)
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

function inboundCounts(account, since) {
  const counts = new Map();
  for (const item of Object.values(account.inbound || {})) {
    if (item.createdAt >= since) counts.set(item.handle, (counts.get(item.handle) || 0) + 1);
  }
  return counts;
}

// Who replied to or mentioned the author, next to how often the author
// replied to them. Comes from the Mentions timeline, so it is recent only.
export function inboundLedger(account, { days = 90, today = Date.now() } = {}) {
  const since = today - days * DAY_MS;
  const own = (account.handle || '').toLowerCase();
  const rows = new Map();
  for (const item of Object.values(account.inbound || {})) {
    if (item.createdAt < since || item.handle === own) continue;
    const row = rows.get(item.handle) || { handle: item.handle, inbound: 0, replies: 0, mentions: 0, yourReplies: 0, lastAt: 0 };
    row.inbound++;
    row[item.kind === 'reply' ? 'replies' : 'mentions']++;
    row.lastAt = Math.max(row.lastAt, item.createdAt);
    rows.set(item.handle, row);
  }
  for (const post of Object.values(account.posts || {})) {
    const row = rows.get(post.replyTo?.handle);
    if (row && post.kind === 'reply' && post.createdAt >= since) row.yourReplies++;
  }
  return [...rows.values()].sort((a, b) => b.inbound - a.inbound || b.lastAt - a.lastAt);
}

// Compares the recent half of a weekly series with the earlier half.
function trendOf(weekly) {
  const half = weekly.length >> 1;
  const before = sum(weekly.slice(0, half));
  const after = sum(weekly.slice(half));
  if (!before && !after) return 'none';
  if (after > before * 1.25) return 'up';
  if (after < before * 0.75) return 'down';
  return 'flat';
}

// Hours since posting vs impressions, from the snapshots of each sync.
export function growthCurve(post) {
  return (post.snapshots || [])
    .map(([at, impressions]) => ({ hours: (at - post.createdAt) / 3600000, impressions }))
    .filter((point) => point.hours >= 0);
}

// Hours until the post had half of its latest impressions, interpolated
// between snapshots. Null when the first snapshot already passed half.
export function halfLife(post) {
  const curve = growthCurve(post);
  const latest = curve.at(-1)?.impressions || 0;
  if (curve.length < 2 || !latest) return null;
  const target = latest / 2;
  let previous = { hours: 0, impressions: 0 };
  if (curve[0].impressions >= target && curve[0].hours > 1) return null;
  for (const point of curve) {
    if (point.impressions >= target) {
      const span = point.impressions - previous.impressions;
      const share = span > 0 ? (target - previous.impressions) / span : 1;
      return previous.hours + share * (point.hours - previous.hours);
    }
    previous = point;
  }
  return null;
}

export function medianHalfLife(posts) {
  return median(posts.map(halfLife).filter((value) => value !== null));
}

// Weekly posts and reach, to see whether posting more still pays.
export function weeklyCadence(account, { weeks = 12, today = Date.now() } = {}) {
  const posts = Object.values(account.posts || {});
  return Array.from({ length: weeks }, (_, i) => {
    const end = today - (weeks - 1 - i) * WEEK_MS;
    const keys = dayRange(end, 7);
    const start = Date.parse(`${keys[0]}T00:00:00Z`);
    const stop = start + WEEK_MS;
    const week = totals(account.daily, keys);
    const authored = posts.filter((p) => p.createdAt >= start && p.createdAt < stop);
    return {
      weekStart: keys[0],
      posts: authored.filter((p) => p.kind !== 'reply').length,
      replies: authored.filter((p) => p.kind === 'reply').length,
      impressions: week.days ? week.Impressions || 0 : sum(authored.map((p) => p.metrics?.Impressions || 0)),
      follows: week.Follows || 0
    };
  });
}

const pct = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const signed = (value) => (value > 0 ? `+${value}` : String(value));
const fmt = (value) => Math.round(value || 0).toLocaleString('en-US');
const changeText = (value) =>
  value === null ? '' : ` (${value >= 0 ? 'up' : 'down'} ${Math.abs(value * 100).toFixed(0)}% from the previous period)`;

// A plain-language reading of one period. Template-based, so it never invents.
export function digest(account, { days = 7, today = Date.now() } = {}) {
  const s = summary(account, { days, today });
  const posts = postList(account, { days, today });
  const lines = [];
  const [impressions, engagement, net, visits] = s.kpis;
  if (impressions.value !== null) {
    const partial = s.coverage < days ? ` over ${s.coverage} of ${days} days with data` : '';
    lines.push(`Impressions: ${fmt(impressions.value)}${partial}${changeText(impressions.change)}.`);
    lines.push(`Engagement rate: ${pct(engagement.value)}; profile visits: ${fmt(visits.value)}; net follows: ${signed(net.value)}.`);
    const conversion = s.derived.followConversion;
    if (conversion !== null) lines.push(`${pct(conversion)} of profile visits turned into follows.`);
  }
  const originals = posts.filter((p) => p.kind !== 'reply');
  const best = [...posts].sort((a, b) => b.stats.impressions - a.stats.impressions)[0];
  if (posts.length) lines.push(`You published ${originals.length} posts and ${posts.length - originals.length} replies.`);
  if (best) {
    const multiple = best.multiple ? `, ${best.multiple.toFixed(1)}× your usual` : '';
    lines.push(`Top post: ${fmt(best.stats.impressions)} impressions${multiple}.`);
  }
  const ledger = interactionLedger(account, { days, today });
  if (ledger[0]) lines.push(`Replies to @${ledger[0].handle} earned the most reach (${fmt(ledger[0].impressions)} impressions from ${ledger[0].replies} replies).`);
  if (!lines.length) lines.push('No analytics for this period yet. Sync from Analytics to load it.');
  return { days, today, lines, summary: s, best, ledger: ledger.slice(0, 5) };
}

// Weekly digest as an Obsidian-style Markdown note.
export function digestMarkdown(account, options = {}) {
  const d = digest(account, options);
  // Same window as summary(): complete days ending yesterday (UTC).
  const end = dayKey(d.today - DAY_MS);
  const start = dayKey(d.today - d.days * DAY_MS);
  const handle = account.handle ? `@${account.handle}` : 'X account';
  const kpis = d.summary.kpis
    .map((k) => `| ${k.label} | ${k.value === null ? 'n/a' : k.format === 'percent' ? pct(k.value) : k.format === 'signed' ? signed(k.value) : fmt(k.value)} | ${k.change === null ? '' : `${(k.change * 100).toFixed(0)}%`} |`)
    .join('\n');
  const ledger = d.ledger.length
    ? d.ledger.map((row) => `| @${row.handle} | ${row.replies} | ${fmt(row.impressions)} | ${row.follows} |`).join('\n')
    : '';
  return [
    '---',
    `title: ${JSON.stringify(`${handle} analytics ${start} – ${end}`)}`,
    `period_start: ${start}`,
    `period_end: ${end}`,
    'source: "XTOC Analytics"',
    'tags:',
    '  - "x-analytics"',
    '---',
    '',
    `# ${handle} · ${start} – ${end}`,
    '',
    ...d.lines.map((line) => `- ${line}`),
    '',
    '| Metric | Value | Change |',
    '| --- | --- | --- |',
    kpis,
    ...(ledger ? ['', '## Replies that paid off', '', '| Account | Replies | Impressions | Follows |', '| --- | --- | --- | --- |', ledger] : []),
    ''
  ].join('\n');
}

// Aggregates only, for the optional AI reading: no post text, no notes.
export function interpretationInput(account, { days = 28, today = Date.now() } = {}) {
  const s = summary(account, { days, today });
  const posts = postList(account, { days, today });
  const round = (value) => (value === null ? null : Math.round(value * 10000) / 10000);
  return {
    periodDays: days,
    totals: Object.fromEntries(Object.entries(s.current).filter(([key]) => key !== 'days')),
    previousTotals: Object.fromEntries(Object.entries(s.previous).filter(([key]) => key !== 'days')),
    ratios: Object.fromEntries(Object.entries(derived(s.current)).map(([k, v]) => [k, round(v)])),
    posts: posts.length,
    replies: posts.filter((p) => p.kind === 'reply').length,
    medianImpressionsPerPost: median(posts.filter((p) => p.kind !== 'reply').map((p) => p.stats.impressions)),
    topPosts: [...posts]
      .sort((a, b) => b.stats.impressions - a.stats.impressions)
      .slice(0, 5)
      .map((p) => ({ kind: p.kind, impressions: p.stats.impressions, engagementRate: round(p.stats.engagementRate), follows: p.metrics?.Follows || 0, media: p.media, links: p.links })),
    replyTargets: interactionLedger(account, { days, today })
      .slice(0, 8)
      .map((row) => ({ replies: row.replies, impressions: row.impressions, follows: row.follows, trend: row.trend })),
    followerCount: account.info?.followers ?? null,
    followConversion: round(rate(s.current.Follows || 0, s.current.ProfileVisits || 0))
  };
}
