// Popup entry point. Holds no state: it asks the content script what the
// current X page is, then renders one of a few states.
import { icon } from '../ui/icons.js';
import { syncView } from './bookmark-sync.js';

const X_PAGE = /^https:\/\/(x\.com|twitter\.com)\//;


const SAVE_TITLES = {
  idle: 'Save to Bookmarks',
  saving: 'Saving…',
  saved: 'Saved to Bookmarks',
  error: 'Save failed · try again'
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// Uses the running build's own icon, so a local debug build shows its DEV logo.
function brandIconUrl() {
  const path = chrome.runtime.getManifest().icons?.['32'];
  return path ? chrome.runtime.getURL(path) : '';
}

function entryLink(page, label) {
  return `<a class="section-link" href="../${page}/index.html" data-page="${page}">${label}${icon('arrow')}</a>`;
}
function renderHeader() {
  return `<header class="header"><div class="brand"><img src="${brandIconUrl()}" alt="" width="24" height="24">XTOC</div><a class="icon-btn" href="../settings/index.html" data-page="settings" aria-label="Settings" title="Settings">${icon('settings')}</a></header>`;
}
function summaryFallback(message) {
  return `<section class="home-section">${entryLink('library', 'Library')}</section><section class="home-section">${entryLink('analytics', 'Analytics')}<p class="muted-line" role="status">${message}</p></section>`;
}
let snapshot = null;
function safeLink(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.href) : ''; } catch { return ''; } }
function homeSummary() {
  if (!snapshot) return summaryFallback('Loading local summary…');
  const d = snapshot, stats = d.stats;
  const account = d.accounts.find(a => a.id === d.accountId);
  const num = value => value === null ? '–' : new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 }).format(value);
  const metrics = stats ? `<p class="summary-period">Last 7 complete days · UTC · ${stats.coverage}/7 days captured${stats.coverage < 7 ? ' · totals for captured days' : ''}</p><div class="summary-kpis">${stats.kpis.map(k => `<div><span>${escapeHtml(k.label)}</span><strong>${k.format === 'percent' && k.value !== null ? (k.value * 100).toFixed(2) + '%' : num(k.value)}</strong></div>`).join('')}</div>` : '<p class="muted-line">Connect your own X Premium analytics to see account performance.</p>';
  return `<section class="home-section">${entryLink('library', 'Library')}<p class="section-meta">${d.bookmarks} bookmarks · ${d.clips} clips</p>${d.recent.length ? d.recent.map(item => `<a class="recent-item" href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(item.title)}"><small>${item.kind}</small><span>${escapeHtml(item.title || 'Untitled')}</span></a>`).join('') : '<p class="muted-line">Save an X post or select a passage to start your library.</p>'}</section><section class="home-section">${entryLink('analytics', 'Analytics')}${d.accounts.length === 1 ? `<p class="section-meta">@${escapeHtml(account.handle || account.id)}</p>` : ''}${d.accounts.length > 1 ? `<select class="input" aria-label="Analytics account" id="summary-account">${d.accounts.map(a => `<option value="${a.id}" ${a.id === d.accountId ? 'selected' : ''}>@${escapeHtml(a.handle || a.id)}</option>`).join('')}</select>` : ''}${metrics}<p class="summary-period">${d.sync.running ? 'Syncing in an inactive tab' : d.sync.paused ? 'Sync paused' : d.sync.queued ? 'History queued: ' + d.sync.queued + ' windows' : d.sync.mode === 'background' ? 'Updates every 6 hours' : 'Manual / on-visit updates'}${d.sync.capturedAt ? ' · Last capture ' + new Date(d.sync.capturedAt).toLocaleString() : ''}</p>${d.sync.error ? `<p class="summary-error">${escapeHtml(d.sync.error)}</p>` : ''}</section>`;
}

// Bookmarks pages: import controls instead of the "no article" notice.
const SYNC_POLL_MS = 500;

function syncLead(status, view) {
  if (view.busy) return '<span class="spinner" aria-hidden="true"></span>';
  if (status.phase === 'idle') return '';
  if (status.phase === 'paused') return icon('pause');
  return icon(view.tone === 'success' ? 'check' : view.tone === 'info' ? 'import' : 'error');
}

function renderSyncButton({ command, label, icon: name, variant }) {
  const content = name ? `${icon(name)}<span>${label}</span>` : label;
  return `<button class="sync-btn btn ${variant === 'link' ? 'btn-link' : variant === 'primary' ? 'btn-primary' : 'btn-secondary'} ${variant}" type="button" data-command="${command}">${content}</button>`;
}

// A fixed skeleton that updateSync fills in. Progress polls change only the
// parts that differ: replacing a button between press and release would drop
// the click, and replacing the spinner would restart it.
const SYNC_SKELETON = `
  <section class="sync" aria-label="Bookmark import">
    <p class="sync-status" role="status" aria-live="polite" hidden><span class="sync-lead"></span><span class="sync-text"></span></p>
    <div class="sync-actions"></div>
    <p class="sync-more"></p>
    <p class="sync-hint"></p>
  </section>`;

const renderedHtml = new WeakMap();

function setHtml(element, html) {
  if (renderedHtml.get(element) === html) return false;
  element.innerHTML = html;
  renderedHtml.set(element, html);
  return true;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function updateSync(root, status) {
  const view = syncView(status);
  const line = root.querySelector('.sync-status');
  line.hidden = !view.text;
  line.dataset.tone = view.tone;
  setHtml(root.querySelector('.sync-lead'), syncLead(status, view));
  setText(root.querySelector('.sync-text'), view.text);
  setText(root.querySelector('.sync-hint'), view.hint);
  const focused = root.contains(document.activeElement) ? document.activeElement.dataset.command : null;
  const buttons = (variant) => view.buttons.filter((button) => (button.variant === 'link') === variant)
    .map(renderSyncButton).join('');
  const replaced = [setHtml(root.querySelector('.sync-actions'), buttons(false)),
    setHtml(root.querySelector('.sync-more'), buttons(true))];
  if (focused && replaced.some(Boolean))
    (root.querySelector(`[data-command="${focused}"]`) || root.querySelector('.sync-btn'))?.focus();
}

function bodyFor(page) {
  if (page.bookmarkImport?.available) return `<div id="syncRoot">${SYNC_SKELETON}</div>`;
  if (page.kind === 'article' || page.kind === 'post') return `<section class="current-page"><p class="section-label">Current ${page.kind}</p><p class="current-title" title="${escapeHtml(page.title)}">${escapeHtml(page.title || 'X ' + page.kind)}</p><button class="btn btn-secondary btn-sm" id="saveBtn" data-state="idle">Save to Bookmarks</button></section>`;
  if (page.kind === 'unreachable') return '<p class="muted-line">Reload this X tab to enable saving. <button class="btn btn-secondary btn-sm" id="reloadBtn">Reload tab</button></p>';
  return '';
}
function render(root, page) {
 root.innerHTML = `<div class="container">${renderHeader()}<main class="body">${bodyFor(page)}<div id="home-summary">${homeSummary()}</div></main></div>`;
}
// Saved and error states are brief; the button then returns to idle. The
// tooltip and accessible name carry the outcome, so the layout never shifts.
const SAVE_RESET_MS = { saved: 1800, error: 4000 };

function setSaveState(button, state, label = SAVE_TITLES[state]) {
  clearTimeout(button.resetTimer);
  button.dataset.state = state;
  button.disabled = state === 'saving';
  button.dataset.tip = label;
  button.setAttribute('aria-label', label);
  button.textContent = label;
  if (SAVE_RESET_MS[state]) {
    button.resetTimer = setTimeout(() => setSaveState(button, 'idle'), SAVE_RESET_MS[state]);
  }
}

function bindSave(button, tabId) {
  button.addEventListener('click', async () => {
    setSaveState(button, 'saving');
    try {
      const result = await chrome.tabs.sendMessage(tabId, { action: 'captureCurrent' });
      if (!result?.ok)
        throw new Error(result?.error || 'Save failed. Reload the page and try again.');
      setSaveState(
        button,
        'saved',
        result.data?.duplicate ? 'Already in Bookmarks' : SAVE_TITLES.saved
      );
    } catch (error) {
      setSaveState(button, 'error', error.message);
    }
  });
}

function bindActions(root, page, tabId) {
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-page]');
    if (!button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const result = await chrome.runtime.sendMessage({ action: 'app:open', payload: { page:button.dataset.page, route:button.dataset.route, accountId:snapshot?.accountId } });
    if (result?.ok) window.close();
  });
  root.querySelector('#reloadBtn')?.addEventListener('click', () => { chrome.tabs.reload(tabId); window.close(); });
  root.addEventListener('change', event => { if (event.target.id === 'summary-account') loadSummary(root, event.target.value); });
  const save = root.querySelector('#saveBtn');
  if (save) bindSave(save, tabId);
  const sync = root.querySelector('#syncRoot');
  if (sync) bindSync(sync, tabId, page.bookmarkImport);
}

// Commands and progress go through the content script, which runs the same
// import as the page control. Polling stops with the popup.
function bindSync(container, tabId, initial) {
  const show = (status) => updateSync(container, status);
  show(initial);
  const failed = (error) => show({ phase: 'done', tone: 'error', commands: [],
    text: error?.message || 'Reload this tab, then try again.' });
  const request = async (command) => {
    const result = await chrome.tabs.sendMessage(tabId, { action: 'bookmarkImport', command });
    if (!result?.ok) throw new Error(result?.error || 'Reload this tab, then try again.');
    show(result.data);
  };
  container.addEventListener('click', (event) => {
    const command = event.target.closest('[data-command]')?.dataset.command;
    if (command) request(command).catch(failed);
  });
  const timer = setInterval(() => request().catch((error) => {
    clearInterval(timer);
    failed(error);
  }), SYNC_POLL_MS);
}

async function describePage(tab) {
  if (!X_PAGE.test(tab?.url || '')) return { kind: 'unsupported' };
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTOC' });
    return {
      kind: response?.pageKind || 'other',
      toc: response?.toc || [],
      isPanelVisible: Boolean(response?.isPanelVisible),
      inlineTocOff: response?.inlineToc?.autoShow === false,
      title: tab.title || '',
      bookmarkImport: response?.bookmarkImport
    };
  } catch {
    return { kind: 'unreachable' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const page = await describePage(tab);
  render(root, page);
  bindActions(root, page, tab?.id);
  loadSummary(root);
});

async function loadSummary(root, accountId) {
  const target = root.querySelector('#home-summary');
  try {
    const result = await chrome.runtime.sendMessage({ action:'popup:summary', payload:{accountId} });
    if (!result?.ok) throw Error(result?.error || 'Local summary unavailable.');
    snapshot = result.data; target.innerHTML = homeSummary();
  } catch { target.innerHTML = summaryFallback('Local summary unavailable. Open a page to continue.'); }
}
