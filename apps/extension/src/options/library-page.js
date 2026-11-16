// Library shell: hash routing between Clips, Bookmarks, Analytics and Settings, shared
// state loading, the detail drawer and status toasts.
import { clipGroups, KEYS } from '../library/model.js';
import { createClipsView } from './clips-view.js';
import { createBookmarksView } from './bookmarks-view.js';
import { createSettingsView } from './settings-view.js';
import { createAnalyticsView } from './analytics-view.js';

const moduleName = location.pathname.split('/')[1];
const isLibrary = moduleName === 'library';
const ROUTES = isLibrary ? ['bookmarks', 'clips'] : moduleName === 'analytics' ? ['analytics', 'data'] : ['settings'];
const routes = isLibrary ? [['bookmarks','Bookmarks'],['clips','Clips']] : moduleName === 'analytics' ? [['analytics','Analytics'],['data','Data & Sync']] : [['settings','Settings']];
document.title = `XTOC ${moduleName[0].toUpperCase() + moduleName.slice(1)}`;
document.body.insertAdjacentHTML('afterbegin', `<header class="global-nav"><a class="brand" href="../library/index.html"><img id="brandIcon" alt="" width="24" height="24">XTOC</a><nav aria-label="XTOC"><a href="../library/index.html" ${isLibrary ? 'aria-current="page"' : ''}>Library</a><a href="../analytics/index.html" ${moduleName === 'analytics' ? 'aria-current="page"' : ''}>Analytics</a><a href="../settings/index.html" ${moduleName === 'settings' ? 'aria-current="page"' : ''}>Settings</a></nav></header><div class="app"><aside class="sidebar"><nav class="nav" aria-label="${moduleName}">${routes.map(([route,label]) => `<a href="#${route}" data-route="${route}">${label}${isLibrary ? `<span class="nav-count" id="count-${route}"></span>` : ''}</a>`).join('')}</nav></aside><main class="main" id="main"></main><aside class="drawer" id="drawer" aria-label="Details" hidden></aside></div><div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.action !== 'app:locate' || message.page !== moduleName) return false;
  chrome.tabs.getCurrent().then(tab => respond({ id:tab.id, windowId:tab.windowId })); return true;
});
const TOAST_MS = 3200;

const main = document.getElementById('main');
const drawer = document.getElementById('drawer');
const toastEl = document.getElementById('toast');
let toastTimer = null;

async function rpc(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, payload });
  if (!response?.ok) throw new Error(response?.error || 'XTOC is unavailable. Reload this page.');
  return response.data;
}

const ctx = {
  state: { articles: {}, clips: {}, bookmarks: {} },
  ai: { configured: false },
  dirty: false,
  rpc,
  toast(message, tone = 'info') {
    toastEl.textContent = message;
    toastEl.dataset.tone = tone;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), TOAST_MS);
  },
  // Wraps a handler so failures surface as an error toast.
  guard(fn) {
    return async (...args) => {
      try {
        await fn(...args);
      } catch (error) {
        ctx.toast(error.message, 'error');
      }
    };
  },
  confirmDiscard() {
    if (ctx.dirty && !confirm('Discard unsaved changes?')) return false;
    ctx.dirty = false;
    return true;
  },
  openDrawer(html) {
    drawer.innerHTML = html;
    drawer.hidden = false;
    ctx.dirty = false;
    drawer.querySelector('form')?.addEventListener('input', () => (ctx.dirty = true));
    return drawer;
  },
  isDrawerOpen: () => !drawer.hidden,
  closeDrawer() {
    drawer.hidden = true;
    drawer.innerHTML = '';
    ctx.dirty = false;
  },
  async reload() {
    ctx.state = await rpc('library:load');
    renderCounts();
  },
  render: () => render()
};

const views = {
  clips: createClipsView(ctx),
  bookmarks: createBookmarksView(ctx),
  analytics: createAnalyticsView(ctx),
  settings: createSettingsView(ctx),
  data: createSettingsView(ctx, { analyticsOnly: true })
};

const currentRoute = () => {
  const route = location.hash.slice(1);
  return ROUTES.includes(route) ? route : ROUTES[0];
};

function renderCounts() {
  if (!isLibrary) return;
  const clipCount = clipGroups(ctx.state).reduce((sum, group) => sum + group.excerpts.length, 0);
  document.getElementById('count-clips').textContent = clipCount || '';
  document.getElementById('count-bookmarks').textContent =
    Object.keys(ctx.state.bookmarks).length || '';
}

function render() {
  const route = currentRoute();
  main.classList.toggle('main-analytics', route === 'analytics');
  document.body.classList.toggle('analytics-active', route === 'analytics');
  document.querySelectorAll('[data-route]').forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.querySelector('.viz-tip')?.setAttribute('hidden', '');
  if (isLibrary) chrome.storage.local.set({ xtocLibraryRoute: route });
  views[route].render(main);
}

document.querySelector('.global-nav').addEventListener('click', event => { if (event.target.closest('a') && !ctx.confirmDiscard()) event.preventDefault(); });
let lastRoute = currentRoute();
window.addEventListener('hashchange', () => {
  if (!ctx.confirmDiscard()) {
    history.replaceState(null, '', `#${lastRoute}`);
    return;
  }
  lastRoute = currentRoute();
  ctx.closeDrawer();
  render();
});

drawer.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="close-drawer"]') && ctx.confirmDiscard()) {
    ctx.closeDrawer();
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !drawer.hidden && ctx.confirmDiscard()) {
    ctx.closeDrawer();
    render();
  }
});

// Saves from X tabs show up live unless an edit is in progress.
// Only library keys matter here; settings such as AI preferences do not re-render.
const LIBRARY_KEYS = Object.values(KEYS);
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (!isLibrary || area !== 'local' || ctx.dirty) return;
  if (!Object.keys(changes).some((key) => LIBRARY_KEYS.includes(key))) return;
  await ctx.reload();
  render();
});

// Shadow under the sticky page header once content scrolls beneath it.
window.addEventListener(
  'scroll',
  () => main.querySelector('.page-top')?.classList.toggle('is-stuck', window.scrollY > 0),
  { passive: true }
);

window.addEventListener('beforeunload', (event) => {
  if (ctx.dirty) event.preventDefault();
});

const brandIcon = chrome.runtime.getManifest().icons?.['32'];
if (brandIcon) document.getElementById('brandIcon').src = chrome.runtime.getURL(brandIcon);

try {
  ctx.ai = await rpc('ai:status');
  if (isLibrary) {
    if (!location.hash) { const saved = await chrome.storage.local.get('xtocLibraryRoute'); if (ROUTES.includes(saved.xtocLibraryRoute)) history.replaceState(null, '', `#${saved.xtocLibraryRoute}`); }
    await ctx.reload();
  }
} catch (error) {
  ctx.toast(error.message, 'error');
}
render();
