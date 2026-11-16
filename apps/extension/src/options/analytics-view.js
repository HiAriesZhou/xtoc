// Analytics page: reads the stored analytics, renders the sections and lets
// the user sync from X, change the period, export a digest or ask AI to
// interpret the numbers. All numbers come from src/analytics.
import { createAnalyticsRepository } from '../analytics-db.js';
import { ANALYTICS_KEYS, accountList } from '../analytics/store.js';
import { postList, sortPosts, summary } from '../analytics/metrics.js';
import { digestMarkdown, inboundLedger, interactionLedger } from '../analytics/insights.js';
import { noteName } from '../library/obsidian.js';
import { attachChartHover } from './analytics-charts.js';
import {
  findingsCard,
  performanceCard,
  aiCard,
  audienceCard,
  coverageNote,
  breakdownCard,
  funnelCard,
  inboundCard,
  kpiTiles,
  ledgerCard,
  postDrawer,
  postsCard,
  timingCard,
  trendCards
} from './analytics-sections.js';
import { emptyState, esc, icon } from './ui.js';

const PERIODS = [7, 28, 90];
const PAGE = 15;
const SECTIONS = [['overview', 'Overview'], ['content', 'Content'], ['interactions', 'Interactions'], ['audience', 'Audience']];
const ANALYTICS_STORAGE = Object.values(ANALYTICS_KEYS);

const relative = (iso) => {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
};

export function createAnalyticsView(ctx) {
  let main = null;
  const repository = createAnalyticsRepository({ storage: chrome.storage.local });
  let reloadId = 0;
  let loaded = null; // { data, prefs, sync }
  const view = { accountId: '', days: 28, section: 'overview', sort: 'impressions', kind: 'post', limit: PAGE, ai: { loading: false, result: null } };

  async function reload() {
    const id = ++reloadId;
    const next = await ctx.rpc('analytics:load');
    const accounts = accountList(next.data);
    if (!accounts.some(a => a.id === view.accountId)) view.accountId = accounts[0]?.id || '';
    if (view.accountId) {
      const data = await repository.read({ accountId: view.accountId, since: Date.now() - 181 * 86400000 });
      next.data.accounts[view.accountId] = data.accounts[view.accountId];
    }
    if (id === reloadId) loaded = next;
  }

  function syncLine(sync) {
    const q = sync.accounts?.[view.accountId] || sync.accounts?.pending || {};
    const checked = Object.keys(q.windows || {}).length;
    const pending = q.pending?.length || 0;
    const partial = Object.values(q.windows || {}).filter(w => w.status === 'partial' || w.status === 'unavailable').length;
    const status = sync.running ? 'Syncing in an inactive tab' : q.paused ? 'Sync paused' : pending ? 'History sync queued' : 'Sync idle';
    const freshness = q.lastCaptureAt ? `Last capture ${relative(new Date(q.lastCaptureAt).toISOString())}` : sync.lastSuccessAt ? `Last capture ${relative(sync.lastSuccessAt)}` : 'No captures yet';
    return `<p class="a-sync" role="status">${esc(status)} · ${esc(freshness)}${loaded.prefs.mode === 'background' ? ' · updates every 6 hours' : ''}</p>
      ${checked || pending ? `<p class="hint a-sync-detail">${checked} windows checked · ${pending} queued${partial ? ` · ${partial} with gaps or limits` : ''}. Checked windows do not imply complete metrics.</p>` : ''}
      ${q.error || sync.error ? `<p class="a-sync is-error">${esc(q.error || sync.error)}</p>` : ''}`;
  }

  function header(accounts) {
    const account = accounts.find((a) => a.id === view.accountId);
    const picker =
      accounts.length > 1
        ? `<select class="input input-sm" data-action="account" aria-label="Account">${accounts
            .map((a) => `<option value="${esc(a.id)}"${a.id === view.accountId ? ' selected' : ''}>@${esc(a.handle || a.id)}</option>`)
            .join('')}</select>`
        : account?.handle
          ? `<span class="subtle">@${esc(account.handle)}</span>`
          : '';
    const running = Boolean(loaded.sync.running);
    return `
      <div class="page-top">
        <header class="page-head">
          <div class="page-title"><h1>Analytics</h1>${picker}</div>
          <div class="inline-actions">
            ${accounts.length ? `<div class="seg" role="group" aria-label="Period">${PERIODS.map((d) => `<button type="button" class="seg-btn" data-days="${d}" aria-pressed="${view.days === d}">${d}D</button>`).join('')}</div>` : ''}
            ${accounts.length ? `<button type="button" class="btn btn-secondary" data-action="digest">${icon('download', 15)}Digest</button>` : ''}
            <button type="button" class="btn btn-secondary" data-action="pause-sync">Pause sync</button>
            <button type="button" class="btn btn-primary" data-action="sync"${running ? ' disabled' : ''}>${running ? 'Syncing…' : 'Sync from X'}</button>
          </div>
        </header>
        <div class="a-sync-wrap">${syncLine(loaded.sync)}</div>
      </div>`;
  }

  function empty() {
    return `${emptyState(
      'sparkles',
      'See your X Analytics, explained',
      'Requires X Premium. Sync opens X Analytics in a background tab of this browser, where you are signed in, and keeps a copy on this device. Sync uploads nothing.'
    )}
      <p class="hint a-empty-note">Sync checks history in date windows, prioritizing the last 56 daily totals. It continues in small batches until complete or paused. Enable updates every 6 hours in Settings to keep recent data fresh.</p>`;
  }

  function render() {
    const focused = main.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = focused?.dataset.days ? `[data-days="${focused.dataset.days}"]` : focused?.dataset.kind ? `[data-kind="${focused.dataset.kind}"]` : focused?.dataset.action ? `[data-action="${focused.dataset.action}"]` : null;
    if (!loaded) {
      main.innerHTML = '<div class="page-top"><header class="page-head"><div class="page-title"><h1>Analytics</h1></div></header></div>';
      return;
    }
    const accounts = accountList(loaded.data);
    const account = accounts.find((a) => a.id === view.accountId);
    if (!account) {
      main.innerHTML = header(accounts) + empty();
      return;
    }
    const today = Date.now();
    const s = summary(account, { days: view.days, today });
    const posts = postList(account, { days: view.days, today, kind: 'all' });
    const shown = sortPosts(view.kind === 'all' ? posts : posts.filter((p) => p.kind === view.kind), view.sort);
    const originals = posts.filter(p => p.kind !== 'reply');
    const replies = posts.filter(p => p.kind === 'reply');
    const content = view.section === 'overview'
      ? `${kpiTiles(s)}<div class="a-overview-grid">${trendCards(s)}<div class="a-side">${findingsCard(posts, s)}${funnelCard(s.current)}</div></div>${performanceCard(originals)}${postsCard(account, sortPosts(originals), { ...view, limit: 5, preview: true })}${aiCard(view.ai, ctx.ai?.configured)}`
      : view.section === 'content'
        ? `<div class="a-grid-2">${performanceCard(originals)}${performanceCard(replies, 'Replies')}</div>${postsCard(account, shown, view)}${breakdownCard(posts)}`
        : view.section === 'interactions'
          ? `${ledgerCard(interactionLedger(account, { days: view.days, today }))}${inboundCard(inboundLedger(account, { days: view.days, today }), Boolean(account.inbound))}`
          : `${audienceCard(account)}${timingCard(account, posts)}`;
    main.innerHTML = `
      ${header(accounts)}
      <div class="a-page">
        <nav class="a-tabs" aria-label="Analytics sections">${SECTIONS.map(([key,label]) => `<button type="button" data-section="${key}" aria-current="${view.section === key ? 'page' : 'false'}">${label}</button>`).join('')}</nav>
        <div class="a-period"><strong>${esc(s.start)} – ${esc(s.end)} · UTC</strong><span>${view.section === 'audience' ? 'Audience: latest captured X snapshot; its range is set on X.' : 'Complete days. Posts: captured lifetime results of content published in this window.'}</span></div>
        ${view.section === 'overview' ? coverageNote(s) : ''}
        ${content}
        <details class="a-data-details"><summary>Data sources &amp; imports</summary>
        <section class="card a-data">
          <div class="card-head"><div><h2>Data on this device</h2><p class="subtle">${esc(`${account.counts?.posts ?? Object.keys(account.posts || {}).length} posts and ${account.counts?.daily ?? Object.keys(account.daily || {}).length} days stored locally for @${account.handle || account.id}.`)}</p></div>
          <div class="inline-actions"><label class="btn btn-secondary btn-sm">Import X CSV<input type="file" accept=".csv,text/csv" multiple hidden data-action="import-csv" /></label>
          <button type="button" class="btn btn-ghost-danger btn-sm" data-action="clear-account">Delete this account’s data</button></div></div>
          <p class="hint">If sync stops working, import the account overview or content CSV exported from X Analytics instead.</p>
        </section></details>
      </div>`;
    attachChartHover(main);
    if (focusSelector) main.querySelector(focusSelector)?.focus({ preventScroll: true });
  }

  function downloadDigest(account) {
    const markdown = digestMarkdown(account, { days: view.days, today: Date.now() });
    const name = noteName(`${account.handle || 'x'} analytics ${new Date().toISOString().slice(0, 10)}`, 'xtoc-analytics');
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${name}.md` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function interpret(account) {
    view.ai = { loading: true, result: view.ai.result };
    render();
    try {
      view.ai = { loading: false, result: await ctx.rpc('analytics:interpret', { accountId: account.id, days: view.days }) };
    } catch (error) {
      view.ai = { loading: false, result: null };
      ctx.toast(error.message, 'error');
    }
    render();
  }

  async function onClick(event) {
    const target = event.target.closest('[data-action], [data-days], [data-kind], [data-section], tr[data-post]');
    if (!target) return;
    const account = accountList(loaded?.data || { accounts: {} }).find((a) => a.id === view.accountId);
    if (target.dataset.section) {
      view.section = target.dataset.section;
      ctx.closeDrawer();
      render();
      main.querySelector(`[data-section="${view.section}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.days) {
      view.days = Number(target.dataset.days);
      view.limit = PAGE;
      view.ai = { loading: false, result: null };
      return render();
    }
    if (target.dataset.kind) {
      view.kind = target.dataset.kind;
      view.limit = PAGE;
      return render();
    }
    if (target.dataset.post && account) {
      const post = postList(account, { days: 3650 }).find((p) => p.id === target.dataset.post);
      if (post) ctx.openDrawer(postDrawer(account, post, account.postDetails?.[post.id] || null));
      return;
    }
    const action = target.dataset.action;
    if (action === 'sync') {
      loaded.sync = { ...loaded.sync, running: true, error: null };
      render();
      await ctx.rpc('analytics:sync', { accountId: view.accountId });
      ctx.toast('Syncing in a background tab. Keep this browser signed in to X.');
    } else if (action === 'pause-sync') {
      await ctx.rpc('analytics:pause');
      await reload(); render();
    } else if (action === 'more-posts') {
      view.limit += PAGE;
      render();
    } else if (action === 'digest' && account) {
      downloadDigest(account);
    } else if (action === 'interpret' && account) {
      await interpret(account);
    } else if (action === 'clear-account' && account) {
      if (!confirm(`Delete XTOC's local analytics for @${account.handle || account.id}? X keeps its own data.`)) return;
      loaded = await ctx.rpc('analytics:clear', { accountId: account.id });
      view.accountId = '';
      await reload();
      render();
    }
  }

  const MAX_CSV_BYTES = 10 * 1024 * 1024;

  async function importFiles(input) {
    const files = [...input.files];
    input.value = ''; // the same file can be chosen again
    try {
      for (const file of files) {
        if (file.size > MAX_CSV_BYTES) throw new Error(`${file.name} is larger than 10 MB.`);
        const result = await ctx.rpc('analytics:importCsv', { text: await file.text(), accountId: view.accountId });
        ctx.toast(result.kind === 'content' ? `Imported ${result.posts} posts from ${file.name}.` : `Imported ${result.days} days from ${file.name}.`);
      }
    } finally {
      await reload();
      render();
    }
  }

  async function onChange(event) {
    const action = event.target.dataset.action;
    if (action === 'import-csv') return ctx.guard(() => importFiles(event.target))();
    if (action === 'sort') view.sort = event.target.value;
    if (action === 'account') {
      view.accountId = event.target.value;
      await reload();
      view.ai = { loading: false, result: null };
    }
    if (action === 'sort' || action === 'account') render();
  }

  function onKeydown(event) {
    const row = event.target.closest('tr[data-post]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      row.click();
    }
  }

  // Captures and sync progress arrive while the page is open.
  let reloadTimer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || location.hash !== '#analytics' || !main) return;
    if (!Object.keys(changes).some(key => ANALYTICS_STORAGE.includes(key))) return;
    if (changes[ANALYTICS_KEYS.revision] || changes[ANALYTICS_KEYS.data]) {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => ctx.guard(async () => { await reload(); if (location.hash === '#analytics' && !ctx.isDrawerOpen()) render(); })(), 500);
    } else ctx.guard(async () => {
      const next = await ctx.rpc('analytics:load');
      if (!loaded || location.hash !== '#analytics') return;
      loaded.sync = next.sync; loaded.prefs = next.prefs;
      const line = main.querySelector('.a-sync-wrap');
      if (line) line.innerHTML = syncLine(next.sync);
      const button = main.querySelector('[data-action="sync"]');
      if (button) { button.disabled = Boolean(next.sync.running); button.textContent = next.sync.running ? 'Syncing…' : 'Sync from X'; }
    })();
  });

  return {
    async render(container) {
      main = container;
      main.onclick = ctx.guard(onClick);
      main.onchange = ctx.guard(onChange);
      main.oninput = null;
      main.onkeydown = onKeydown;
      render();
      try {
        await reload();
      } catch (error) {
        ctx.toast(error.message, 'error');
      }
      if (location.hash === '#analytics') render();
    }
  };
}
