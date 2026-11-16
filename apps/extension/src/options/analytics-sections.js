// Section renderers for the Analytics page. Each takes computed results from
// src/analytics and returns HTML; every dynamic value is escaped.
import { contentPerformance, metricValue, derived, audienceGrid, breakdown, heatmapMetric, postingGrid, topSlots } from '../analytics/metrics.js';
import { growthCurve, halfLife, medianHalfLife, postDetailSeries } from '../analytics/insights.js';
import {
  barList,
  columns,
  dataTable,
  divergingColumns,
  format,
  heatmap,
  lineChart,
  sparkline
} from './analytics-charts.js';
import { esc, icon } from './ui.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEVICES = { 129032: 'iOS', 191841: 'iOS', 557701: 'iOS', 258901: 'Android', 3033300: 'Web' };
const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

const card = (title, body, { sub = '', id = '', actions = '' } = {}) => `
  <section class="card a-card"${id ? ` id="${id}"` : ''}>
    <div class="card-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="subtle">${esc(sub)}</p>` : ''}</div>${actions}</div>
    ${body}
  </section>`;

export const postUrl = (account, post) =>
  `https://x.com/${encodeURIComponent(account.handle || 'i')}/status/${encodeURIComponent(post.id)}`;

const postDate = (ms) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

export function digestCard(digest) {
  return `
    <section class="card a-digest" aria-label="Summary">
      <div class="card-head"><h2>This ${digest.days === 7 ? 'week' : `${digest.days}-day period`} in brief</h2></div>
      <ul class="a-lines">${digest.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    </section>`;
}

function deltaBadge(kpi) {
  if (kpi.change === null) return '<span class="a-delta">no comparison</span>';
  const up = kpi.change > 0;
  const tone = Math.abs(kpi.change) < 0.005 ? '' : up ? 'is-up' : 'is-down';
  const arrow = Math.abs(kpi.change) < 0.005 ? '→' : up ? '↑' : '↓';
  return `<span class="a-delta ${tone}">${arrow} ${esc(format(Math.abs(kpi.change), 'percent'))} <span class="subtle">vs previous</span></span>`;
}

export function coverageNote(summary) {
  if (summary.coverage >= summary.days) return '';
  return `<p class="hint a-coverage">${esc(`Daily totals cover ${summary.coverage} of ${summary.days} days so far. Missing days are unknown, not zero. Import an overview CSV to fill gaps. Period comparisons require complete data on both sides.`)}</p>`;
}

export function kpiTiles(summary) {
  const trend = {
    Impressions: summary.series.map((d) => (d.hasData ? d.Impressions ?? null : null)),
    ProfileVisits: summary.series.map((d) => (d.hasData ? d.ProfileVisits ?? null : null)),
    netFollows: summary.series.map((d) => (d.hasData ? derived(d).netFollows : null)),
    engagementRate: summary.series.map((d) => (d.hasData && d.Impressions ? derived(d).engagementRate : null))
  };
  return `<div class="a-kpis">${summary.kpis
    .map(
      (kpi) => `
      <div class="a-kpi">
        <span class="a-kpi-label">${esc(kpi.label)}</span>
        <span class="a-kpi-value">${esc(format(kpi.value, kpi.format === 'number' ? 'compact' : kpi.format))}</span>
        ${deltaBadge(kpi)}
        ${sparkline(trend[kpi.key] || [])}
      </div>`
    )
    .join('')}</div>`;
}

export function trendCards(summary) {
  const days = summary.series.map((d) => d.day);
  const value = (fn) => summary.series.map((d) => (d.hasData ? fn(d) : null));
  const impressions = value((d) => d.Impressions ?? null);
  const rates = value((d) => (d.Impressions ? derived(d).engagementRate : null));
  const follows = summary.series.map((d) => d.Follows ?? null);
  const unfollows = summary.series.map((d) => d.Unfollows ?? null);
  const table = dataTable(
    ['Day', 'Impressions', 'Engagement rate', 'Follows', 'Unfollows', 'Profile visits'],
    summary.series.filter((d) => d.hasData).map((d) => [d.day, format(d.Impressions), format(d.Impressions ? derived(d).engagementRate : null, 'percent'), format(d.Follows), format(d.Unfollows), format(d.ProfileVisits ?? null)])
  );
  return card(
    'Reach and growth',
    `<div class="a-trend">
       <h3>Impressions</h3>${lineChart({ days, values: impressions, label: 'Impressions' })}
       <div class="a-split">
         <div><h3>Engagement rate</h3>${lineChart({ days, values: rates, kind: 'percent', label: 'Engagement rate', height: 120 })}</div>
         <div><h3>Follows and unfollows</h3>${divergingColumns({ days, up: follows, down: unfollows, upLabel: 'Follows', downLabel: 'Unfollows' })}</div>
       </div>
       ${table}
     </div>`,
    { sub: 'Daily through yesterday, in UTC like X Analytics.' }
  );
}

export function funnelCard(totals) {
  return card('Account activity', `<dl class="a-stats">${[
    ['Profile visits', metricValue(totals, 'ProfileVisits')],
    ['New follows', metricValue(totals, 'Follows')],
    ['Unfollows', metricValue(totals, 'Unfollows')]
  ].map(([name,value]) => `<div><dt>${name}</dt><dd>${format(value)}</dd></div>`).join('')}</dl>
  <p class="hint">Separate account totals. XTOC cannot attribute a follow to a profile visit.</p>`);
}

const SORTS = [
  ['impressions', 'Impressions'],
  ['multiple', '48-hour comparison'],
  ['engagementRate', 'Engagement rate'],
  ['follows', 'New follows'],
  ['bookmarks', 'Bookmarks'],
  ['profileVisits', 'Profile visits'],
  ['date', 'Newest']
];
const KINDS = [
  ['all', 'All'],
  ['post', 'Posts'],
  ['reply', 'Replies']
];

export function postsCard(account, posts, { sort, kind, limit, preview = false }) {
  const controls = preview ? '' : `
    <div class="a-controls">
      <div class="seg" role="group" aria-label="Show">${KINDS.map(([key, label]) => `<button type="button" class="seg-btn" data-kind="${key}" aria-pressed="${kind === key}">${label}</button>`).join('')}</div>
      <label class="a-sort"><span class="subtle">Sort</span>
        <select class="input input-sm" data-action="sort">${SORTS.map(([key, label]) => `<option value="${key}"${sort === key ? ' selected' : ''}>${label}</option>`).join('')}</select>
      </label>
    </div>`;
  if (!posts.length) return card('Posts', `${controls}<p class="viz-empty">No posts in this period yet.</p>`);
  const max = Math.max(...posts.map((p) => p.stats.impressions), 1);
  const rows = posts
    .slice(0, limit)
    .map(
      (post) => `
      <tr data-post="${esc(post.id)}" tabindex="0">
        <td class="a-post-text"><span class="a-post-title" title="${esc(post.text || '(no text)')}">${esc(post.text || '(no text)')}</span>
          <span class="row-meta">${esc(postDate(post.createdAt))}${post.kind === 'reply' ? ` · reply${post.replyTo?.handle ? ` to @${esc(post.replyTo.handle)}` : ''}` : ''}${post.media?.length ? ' · media' : ''}${post.links ? ' · link' : ''}</span></td>
        <td class="num"><span class="a-inline-bar" style="--w:${(post.stats.impressions / max) * 100}%"></span>${esc(format(post.stats.impressions, 'compact'))}</td>
        <td class="num">${esc(format(post.stats.engagementRate, 'percent'))}</td>
        <td class="num">${esc(format(post.metrics?.Bookmarks))}</td><td class="num">${esc(format(post.metrics?.ProfileVisits))}</td><td class="num">${esc(format(post.metrics?.Follows))}</td>
        <td class="num">${post.multiple === null ? '<span class="subtle">–</span>' : `<span class="a-multiple ${post.multiple >= 1.5 ? 'is-high' : post.multiple <= 0.5 ? 'is-low' : ''}">${esc(format(post.multiple, 'multiple'))}</span>`}</td>
      </tr>`
    )
    .join('');
  const more = preview ? '<button type="button" class="btn btn-secondary btn-sm" data-section="content">Explore all content</button>' : posts.length > limit ? `<button type="button" class="btn btn-secondary btn-sm" data-action="more-posts">Show ${Math.min(15, posts.length - limit)} more</button>` : '';
  return card(
    preview ? 'Top original posts' : 'Published content',
    `${controls}
     <div class="table-scroll"><table class="a-table a-post-table">
       <thead><tr><th scope="col">Post</th><th scope="col" class="num">Impressions</th><th scope="col" class="num">Eng. rate</th><th scope="col" class="num">Bookmarks</th><th scope="col" class="num">Visits</th><th scope="col" class="num">Follows</th><th scope="col" class="num" title="Captured impressions at 48–50 hours, compared with at least 5 prior posts of the same kind at that age">At 48h</th></tr></thead>
       <tbody>${rows}</tbody>
     </table></div>${more}`,
    { sub: `${posts.length} in this period. Captured lifetime totals, not impressions earned during this period. “At 48h” needs matching-age captures of at least 5 earlier posts of the same kind.` }
  );
}

const METRIC_UNITS = { Impressions: 'impressions', Likes: 'likes', Engagements: 'engagements', Replies: 'replies', Reposts: 'reposts', Bookmarks: 'bookmarks', Shares: 'shares', ProfileVisits: 'profile visits', Follows: 'follows' };

const slotText = (slot) => `${DAY_NAMES[slot.day]} ${hourLabel(slot.hour)}`;

export function timingCard(account, posts) {
  const originals = posts.filter((p) => p.kind !== 'reply');
  const postGrid = postingGrid(originals);
  const audienceSource = Object.keys(account.heatmap || {}).length ? account.heatmap : account.hourly || {};
  const metric = heatmapMetric(audienceSource);
  const unit = (METRIC_UNITS[metric] || metric || 'activity').toLowerCase();
  const seenGrid = audienceGrid(audienceSource, metric);
  const bestPosts = topSlots(postGrid, { minCount: 5 });
  const bestAudience = topSlots(seenGrid, { limit: 3 });
  const busiestPosting = topSlots(postGrid.map((row) => row.map((cell) => ({ ...cell, value: cell.count || null }))), { limit: 1 })[0];
  const insight = [];
  if (bestAudience.length) insight.push(`Your audience was most active (${unit}) around ${bestAudience.map(slotText).join(', ')}.`);
  if (busiestPosting) insight.push(`You post most often on ${slotText(busiestPosting)}.`);
  if (bestPosts.length) insight.push(`Posts published around ${slotText(bestPosts[0])} had the highest observed median (${bestPosts[0].count} posts; ${format(bestPosts[0].value, 'compact')} impressions).`);
  return card(
    'Publishing times',
    `${insight.length ? `<p>${esc(insight.join(' '))}</p>` : ''}
     <div class="a-split">
       <div><h3>Your posts, median impressions</h3>${heatmap(postGrid, { label: 'Post performance', unit: 'impressions' })}</div>
       <div><h3>${esc(`Audience activity, ${unit} per hour`)}</h3>${heatmap(seenGrid, { label: 'Audience activity', unit })}</div>
     </div>`,
    { sub: 'Local time. Observed patterns, not a proven best time to post. Audience activity comes from X’s hourly data for the last four weeks, for the metric selected on X’s Audience page (Likes by default).' }
  );
}

export function breakdownCard(posts) {
  const dims = breakdown(posts).filter((d) => d.groups.length > 1);
  if (!dims.length) return card('Content formats', '<p class="viz-empty">Publish a few more posts to compare formats.</p>');
  const blocks = dims
    .map(
      (dim) => `<div><h3>${esc(dim.label)}</h3>${barList(
        dim.groups.map((g) => ({ label: `${g.label} (${g.count})`, value: g.medianImpressions, note: `${format(g.medianEngagementRate, 'percent')} engagement, ${g.followsPer1k === null ? '–' : g.followsPer1k.toFixed(2)} follows per 1K impressions` })),
        { kind: 'compact', valueLabel: 'median impressions' }
      )}</div>`
    )
    .join('');
  return card('Content formats', `<div class="a-grid-2">${blocks}</div>`, { sub: 'Captured lifetime medians; sample sizes in parentheses. Different post ages and small samples limit comparisons. Media, links and length exclude replies.' });
}

export function ledgerCard(rows) {
  if (!rows.length) return card('Reply performance', '<p class="viz-empty">No replies to other accounts in this period.</p>');
  const body = rows
    .slice(0, 15)
    .map(
      (row) => `
      <tr>
        <td><a href="https://x.com/${encodeURIComponent(row.handle)}" target="_blank" rel="noopener noreferrer">@${esc(row.handle)}</a></td>
        <td class="num">${row.replies}</td>
        <td class="a-spark-cell">${sparkline(row.weekly, { width: 48, height: 16 })}<span class="a-trend-word ${row.trend}">${{ up: 'more', down: 'less', flat: 'steady', none: '' }[row.trend]}</span></td>
        <td class="num">${esc(format(row.impressions, 'compact'))}<span class="a-sub">${esc(format(row.impressionsPerReply, 'compact'))}/reply</span></td>
        <td class="num">${row.inbound ? esc(format(row.inbound)) : '<span class="subtle">–</span>'}</td>
        <td class="num" title="${esc(`${format(row.profileVisits)} profile visits`)}">${esc(format(row.follows))}<span class="a-sub">${esc(`${row.followsPerReply === null ? '–' : row.followsPerReply.toFixed(2)}/reply`)}</span></td>
      </tr>`
    )
    .join('');
  return card(
    'Reply performance',
    `<div class="table-scroll"><table class="a-table">
      <thead><tr><th scope="col">Account</th><th scope="col" class="num">Replies</th><th scope="col">Last 8 weeks</th><th scope="col" class="num">Impressions</th><th scope="col" class="num" title="Their replies and mentions of you in the same period, from your Mentions timeline">They → you</th><th scope="col" class="num">New follows</th></tr></thead>
      <tbody>${body}</tbody></table></div>`,
    { sub: 'Captured lifetime results of replies published in the selected period. Self-replies excluded; the trend separately covers 8 weeks.' }
  );
}

export function inboundCard(rows, hasData) {
  if (!hasData) return card('Who engages with you', '<p class="viz-empty">Sync once to read your Mentions timeline.</p>');
  if (!rows.length) return card('Who engages with you', '<p class="viz-empty">No replies or mentions from others in this period.</p>');
  const body = rows
    .slice(0, 12)
    .map(
      (row) => `
      <tr>
        <td><a href="https://x.com/${encodeURIComponent(row.handle)}" target="_blank" rel="noopener noreferrer">@${esc(row.handle)}</a></td>
        <td class="num">${row.replies}</td>
        <td class="num">${row.mentions}</td>
        <td class="num">${row.yourReplies || '<span class="subtle">0</span>'}</td>
        <td>${row.yourReplies ? '' : '<span class="subtle">No outgoing reply captured</span>'}</td>
      </tr>`
    )
    .join('');
  return card(
    'Who engages with you',
    `<div class="table-scroll"><table class="a-table">
      <thead><tr><th scope="col">Account</th><th scope="col" class="num">Replies to you</th><th scope="col" class="num">Mentions</th><th scope="col" class="num">Your replies</th><th scope="col"><span class="visually-hidden">Status</span></th></tr></thead>
      <tbody>${body}</tbody></table></div>`,
    { sub: 'From captured Mentions only; older activity may be missing. Outgoing counts do not establish whether a specific message was answered. “Your replies” counts your replies to them in the same period.' }
  );
}

const dimensionRows = (map = {}, labelOf) =>
  Object.entries(map)
    .map(([key, values]) => ({ label: labelOf(key), value: values.Impressions || 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

const ageLabel = (key) => key.replace(/^Age/, '').replace(/(\d+)[Tt]o(\d+)/, '$1–$2').replace(/^Over(\d+)/, '$1+');

export function audienceCard(account) {
  const audience = account.audience;
  if (!audience) return card('Audience', '<p class="viz-empty">Sync once to load audience data.</p>');
  const network = audience.network || {};
  const inNet = network.inNetwork?.Impressions || 0;
  const outNet = network.outNetwork?.Impressions || 0;
  const reach = inNet + outNet ? `<p>${esc(`${format(outNet / (inNet + outNet), 'percent')} of impressions reached people who do not follow you.`)}</p>` : '';
  const devices = {};
  for (const [id, values] of Object.entries(audience.device || {})) {
    const name = DEVICES[id] || 'Other';
    devices[name] = { Impressions: (devices[name]?.Impressions || 0) + (values.Impressions || 0) };
  }
  const blocks = [
    ['Countries', dimensionRows(audience.country, (code) => regionNames?.of(code) || code).slice(0, 6)],
    ['Age', dimensionRows(audience.age, ageLabel)],
    ['Gender', dimensionRows(audience.gender, (key) => key)],
    ['Device', dimensionRows(devices, (key) => key)]
  ]
    .filter(([, rows]) => rows.length)
    .map(([title, rows]) => `<div><h3>${title}</h3>${barList(rows, { kind: 'compact', valueLabel: 'impressions' })}</div>`)
    .join('');
  const followers = account.info?.followers;
  const meta = [
    followers !== undefined && `${format(followers)} followers`,
    account.info?.verifiedFollowers !== undefined && `${format(account.info.verifiedFollowers)} verified`,
    account.info?.realtimeActive !== undefined && `${account.info.realtimeApproximate ? '~' : ''}${format(account.info.realtimeActive)} active in the last day`
  ].filter(Boolean);
  return card('Audience', `${reach}<div class="a-grid-2">${blocks || '<p class="viz-empty">No audience breakdown yet.</p>'}</div>`, {
    sub: meta.join(' · ') || 'Who saw your posts in X’s selected period.'
  });
}

export function cadenceCard(weeks) {
  const labels = weeks.map((w) => w.weekStart);
  return card(
    'Posting rhythm',
    `<div class="a-split">
       <div><h3>Posts per week</h3>${columns({ labels, values: weeks.map((w) => w.posts), label: 'Posts' })}</div>
       <div><h3>Impressions per week</h3>${columns({ labels, values: weeks.map((w) => w.impressions), kind: 'compact', label: 'Impressions' })}</div>
     </div>
     ${dataTable(['Week of', 'Posts', 'Replies', 'Impressions', 'Follows'], weeks.map((w) => [w.weekStart, w.posts, w.replies, format(w.impressions), w.follows]))}`,
    { sub: 'Last 12 weeks. Two charts, one scale each.' }
  );
}

export function aiCard(aiState, configured) {
  const button = configured
    ? `<button type="button" class="btn btn-secondary btn-sm" data-action="interpret"${aiState.loading ? ' disabled' : ''}>${icon('sparkles', 14)}${aiState.loading ? 'Reading…' : aiState.result ? 'Read again' : 'Explain with AI'}</button>`
    : '<a class="btn btn-ghost btn-sm" href="../settings/index.html">Set up AI in Settings</a>';
  const result = aiState.result
    ? `<div class="suggestion"><p>${esc(aiState.result.summary)}</p>
        ${aiState.result.findings.length ? `<h3>Findings</h3><ul>${aiState.result.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${aiState.result.actions.length ? `<h3>Try next</h3><ul>${aiState.result.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <p class="hint">${esc(aiState.result.model || '')} · AI can be wrong; the numbers above are computed by XTOC.</p></div>`
    : '';
  return card('AI reading', `${result}<p class="hint">Optional. Sends only this period’s aggregate numbers to your AI provider: no post text, handles or notes.</p>`, { actions: button });
}

function postDetailBlock(account, post, detail) {
  const link = `<a class="source" href="https://x.com/i/account_analytics/content/${encodeURIComponent(post.id)}" target="_blank" rel="noopener noreferrer">${esc(detail ? 'Refresh from this post’s X analytics' : 'Open this post’s X analytics to add hourly detail')} ${icon('external', 13)}</a>`;
  if (!detail) return link;
  const points = postDetailSeries(detail.first48, 'Impressions');
  const parts = [];
  if (points.length) {
    const total = points.reduce((sum, p) => sum + p.value, 0);
    const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);
    let running = 0;
    const half = points.find((p) => (running += p.value) >= total / 2);
    // CSV posts have only a day, so hours are counted from the first hour X reported.
    const startAt = post.dayOnly ? points[0].at : post.createdAt;
    const hoursAfter = (p) => Math.max(0, Math.round((p.at - startAt) / 3600000));
    const since = post.dayOnly ? 'into the series' : 'after posting';
    parts.push(`<div><h3>First 48 hours</h3>${sparkline(points.map((p) => p.value), { width: 320, height: 48 })}
      <p class="subtle">${esc(`${format(total)} impressions in the first 48 hours; the busiest hour was ${hoursAfter(peak)} h ${since} (${format(peak.value)}), and half arrived within ${hoursAfter(half)} h.`)}</p></div>`);
  }
  const audience = detail.audience || {};
  const rows = (map, labelOf) =>
    Object.entries(map || {})
      .map(([key, values]) => ({ label: labelOf(key), value: values.Impressions || 0 }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  const countries = rows(audience.country, (code) => regionNames?.of(code) || code);
  if (countries.length) parts.push(`<div><h3>Who saw it</h3>${barList(countries, { kind: 'compact', valueLabel: 'impressions' })}</div>`);
  return parts.join('') + link;
}

export function postDrawer(account, post, detail = null) {
  const m = post.metrics || {};
  const curve = growthCurve(post);
  const life = halfLife(post);
  const stats = [
    ['Impressions', format(m.Impressions)],
    ['Engagements', format(m.Engagements)],
    ['Engagement rate', format(post.stats?.engagementRate ?? null, 'percent')],
    ['Likes', format(m.Likes)],
    ['Replies', format(m.Replies)],
    ['Reposts', format(m.Reposts)],
    ['Bookmarks', format(m.Bookmarks)],
    ['Shares', format(m.Shares)],
    ['Profile visits', format(m.ProfileVisits)],
    ['New follows', format(m.Follows)],
    ['Link clicks', format(m.UrlClicks)],
    ['Detail expands', format(m.DetailExpands)]
  ];
  const growth =
    curve.length >= 2
      ? `<div><h3>Growth since posting</h3>${barList(
          curve.slice(-8).map((point) => ({ label: point.hours < 48 ? `${Math.round(point.hours)} h` : `${Math.round(point.hours / 24)} d`, value: point.impressions })),
          { kind: 'compact', valueLabel: 'impressions' }
        )}${life !== null ? `<p class="subtle">${esc(`Reached half of its impressions about ${life < 48 ? `${life.toFixed(1)} hours` : `${(life / 24).toFixed(1)} days`} after posting.`)}</p>` : ''}</div>`
      : '<p class="hint">Growth appears after XTOC has synced this post more than once.</p>';
  return `
    <header class="drawer-head"><span class="eyebrow">Post analytics</span>
      <button class="icon-btn icon-btn-md" type="button" aria-label="Close" data-tip="Close" data-action="close-drawer">${icon('close')}</button>
    </header>
    <div class="drawer-body">
      <blockquote class="quote">${esc(post.text || '(no text)')}</blockquote>
      <a class="source" href="${esc(postUrl(account, post))}" target="_blank" rel="noopener noreferrer">${esc(postDate(post.createdAt))} ${icon('external', 13)}</a>
      ${post.multiple !== null && post.multiple !== undefined ? `<p>${esc(`${format(post.multiple, 'multiple')} the median impressions at 48–50 hours across ${post.baselineCount} earlier ${post.kind === 'reply' ? 'replies' : 'posts'} with matching-age captures.`)}</p>` : ''}
      <dl class="a-stats">${stats.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
      ${growth}
      ${postDetailBlock(account, post, detail)}
    </div>`;
}

export const halfLifeNote = (posts) => {
  const value = medianHalfLife(posts);
  return value === null ? '' : `Your posts typically reach half their impressions within ${value < 48 ? `${value.toFixed(1)} hours` : `${(value / 24).toFixed(1)} days`}.`;
};

export function performanceCard(posts, label = 'Original posts') {
  const p = contentPerformance(posts);
  if (!p.measured) return card(label, '<p class="viz-empty">No captured impressions for this group yet.</p>');
  return card(label, `<dl class="a-performance">
    <div><dt>Published</dt><dd>${format(p.count)}</dd></div>
    <div><dt>Median impressions</dt><dd>${format(p.median, 'compact')}</dd></div>
    <div><dt>Top post share</dt><dd>${format(p.topShare, 'percent')}</dd></div>
    <div><dt>Average without top post</dt><dd>${format(p.withoutTop, 'compact')}</dd></div>
  </dl><p class="hint">${p.measured} of ${p.count} posts have captured impressions. Lifetime values; older posts have had more time to accumulate views.</p>`);
}

export function findingsCard(posts, summary) {
  const originals = posts.filter(p => p.kind !== 'reply');
  const p = contentPerformance(originals);
  const lines = [];
  if (p.measured >= 5 && p.topShare !== null) lines.push(`${format(p.topShare, 'percent')} of captured original-post impressions came from one post. Compare the median (${format(p.median)}) with that top result before repeating its format.`);
  if (originals.length) lines.push(`${originals.length} original posts and ${posts.length-originals.length} replies were published in the selected window. Review them separately: they reach different audiences.`);
  if (!summary.comparable) lines.push('A period-on-period growth comparison is not available yet. Import daily overview data for both periods to make it comparable.');
  if (!lines.length) lines.push('Review content by bookmarks, profile visits or follows to match the outcome you care about.');
  return card('What to look at', `<ul class="a-lines">${lines.slice(0,3).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`, {sub:'Computed from captured data. Patterns are observations, not causal explanations.'});
}
