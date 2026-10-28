// Analytics page: reads the stored analytics, renders the sections and lets
// the user sync from X, change the period, export a digest or ask AI to
// interpret the numbers. All numbers come from src/analytics.
import { ANALYTICS_KEYS, accountList } from '../analytics/store.js';
import { postList, sortPosts, summary } from '../analytics/metrics.js';
import { digest, digestMarkdown, inboundLedger, interactionLedger, weeklyCadence } from '../analytics/insights.js';
import { noteName } from '../library/obsidian.js';
import { attachChartHover } from './analytics-charts.js';
import {
  aiCard,
  audienceCard,
  coverageNote,
  breakdownCard,
  cadenceCard,
  digestCard,
  funnelCard,
  halfLifeNote,
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
const PAGE = 25;
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
  let loaded = null; // { data, prefs, sync }
  const view = { accountId: '', days: 28, sort: 'impressions', kind: 'all', limit: PAGE, ai: { loading: false, result: null } };

  async function reload() {
    loaded = await ctx.rpc('analytics:load');
    const accounts = accountList(loaded.data);
    if (!accounts.some((a) => a.id === view.accountId)) view.accountId = accounts[0]?.id || '';
  }

  function syncLine(sync) {
    if (sync.running) return `<p class="a-sync is-running" role="status">${icon('import', 14)} Syncing from X Analytics in a background tab…</p>`;
    if (sync.error) return `<p class="a-sync is-error" role="status">${esc(sync.error)}${sync.lastSuccessAt ? ` Last successful sync ${esc(relative(sync.lastSuccessAt))}.` : ''}</p>`;
    if (sync.lastSuccessAt) return `<p class="a-sync">Synced ${esc(relative(sync.lastSuccessAt))}${loaded.prefs.autoSync ? ' · daily sync on' : ''}</p>`;
    return '';
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
            <button type="button" class="btn btn-primary" data-action="sync"${running ? ' disabled' : ''}>${running ? 'Syncing…' : 'Sync from X'}</button>
          </div>
        </header>
        ${syncLine(loaded.sync)}
      </div>`;
  }

  function empty() {
    return `${emptyState(
      'sparkles',
      'See your X Analytics, explained',
      'Requires X Premium. Sync opens X Analytics in a background tab of this browser, where you are signed in, and keeps a copy on this device. Sync uploads nothing.'
    )}
      <p class="hint a-empty-note">First sync reads the last 12 weeks of posts. Daily totals start with the 7 days X sends; each later sync adds days. Turn on daily sync in Settings to keep them continuous.</p>`;
  }

  function render() {
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
    const lifeNote = halfLifeNote(posts);
    main.innerHTML = `
      ${header(accounts)}
      <div class="a-page">
        ${digestCard(digest(account, { days: view.days, today }))}
        ${coverageNote(s)}
        ${kpiTiles(s)}
        ${trendCards(s)}
        ${funnelCard(s.current, s.derived)}
        ${postsCard(account, shown, { sort: view.sort, kind: view.kind, limit: view.limit })}
        ${lifeNote ? `<p class="hint a-life">${esc(lifeNote)}</p>` : ''}
        ${timingCard(account, posts)}
        ${breakdownCard(posts)}
        ${ledgerCard(interactionLedger(account, { days: Math.max(view.days, 28), today }))}
        ${inboundCard(inboundLedger(account, { days: Math.max(view.days, 28), today }), Boolean(account.inbound))}
        ${audienceCard(account)}
        ${cadenceCard(weeklyCadence(account, { today }))}
        ${aiCard(view.ai, ctx.ai?.configured)}
        <section class="card a-data">
          <div class="card-head"><div><h2>Data on this device</h2><p class="subtle">${esc(`${Object.keys(account.posts || {}).length} posts and ${Object.keys(account.daily || {}).length} days stored locally for @${account.handle || account.id}.`)}</p></div>
          <button type="button" class="btn btn-ghost-danger btn-sm" data-action="clear-account">Delete this account’s data</button></div>
        </section>
      </div>`;
    attachChartHover(main);
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
    const target = event.target.closest('[data-action], [data-days], [data-kind], tr[data-post]');
    if (!target) return;
    const account = accountList(loaded?.data || { accounts: {} }).find((a) => a.id === view.accountId);
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
      await ctx.rpc('analytics:sync');
      ctx.toast('Syncing in a background tab. Keep this browser signed in to X.');
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

  function onChange(event) {
    const action = event.target.dataset.action;
    if (action === 'sort') view.sort = event.target.value;
    if (action === 'account') {
      view.accountId = event.target.value;
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
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || location.hash !== '#analytics' || !main) return;
    if (!Object.keys(changes).some((key) => ANALYTICS_STORAGE.includes(key))) return;
    await reload();
    if (!ctx.isDrawerOpen()) render();
  });

  return {
    async render(container) {
      main = container;
      main.onclick = ctx.guard(onClick);
      main.onchange = onChange;
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
