// Bookmark import control shown on X's Bookmarks page: a compact pill at the
// bottom centre that walks through idle → importing ↔ paused → done. Each state
// is one short line (see importLabel) plus only the buttons that apply.
import { contentId, xUrl } from '../library/model.js';
import { captureNode, sendToLibrary } from './library-capture.js';
import { closeMenuOutside, importCommands, importLabel, importProgress, importScope, isBookmarkedTweet, isBookmarksRoute } from './bookmark-import-utils.js';
import { startImportScroll } from './bookmark-import-scroll.js';

const SCAN_DELAY_MS = 1500;
const ROUTE_CHECK_MS = 1500;
const MAX_ITEMS = 1000;
const IDLE_MS = 6000; // only stationary, empty scans count towards the end
const MAX_PENDING = 32; // stop moving if local saves cannot keep up
const UNMATCHED_ROUNDS = 3; // rounds of posts without any bookmark (e.g. the Likes tab)
// X renders a post's bookmark button after mounting it. Judge a post without one
// only after this long; 0.7.0 waited the same time after every scroll.
const SETTLE_MS = 1500;

const PATHS = {
  import:
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="M12 7v6"/><path d="m9 10 3 3 3-3"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
};

const icon = (name) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
const iconButton = (action, name, label) =>
  `<button class="icon-btn" type="button" data-action="${action}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

const STYLE = `
  :host { all: initial; }
  .pill {
    --surface: #fff; --text: #0f1419; --muted: #536471; --border: #e6ecf0; --hover: #f2f5f7;
    --accent: #1d9bf0; --accent-tint: #e8f5fe; --success: #00a36c; --warning: #b86e00; --danger: #d0283c;
    position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 6px 0 16px;
    border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text);
    box-shadow: 0 8px 28px rgb(15 20 25 / 0.18);
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    animation: rise 0.2s ease-out;
  }
  .pill[data-phase='idle'] { padding-left: 4px; }
  button { font: inherit; cursor: pointer; border: 0; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .start { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px 0 12px; border-radius: 999px; background: var(--accent); color: #fff; }
  .start:hover { filter: brightness(0.94); }
  .icon-btn { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; background: none; color: var(--muted); }
  .icon-btn:hover { background: var(--hover); color: var(--text); }
  .text-btn { height: 32px; padding: 0 12px; border-radius: 999px; background: var(--accent-tint); color: var(--accent); }
  .text-btn:hover { filter: brightness(0.96); }
  .more { display: block; }
  .more summary { list-style: none; cursor: pointer; }
  .more summary::-webkit-details-marker { display: none; }
  .more summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .menu { position: absolute; bottom: calc(100% + 8px); right: 0; width: min(260px, calc(100vw - 48px)); box-sizing: border-box; padding: 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 28px rgb(15 20 25 / 0.18); }
  .menu button { display: block; width: 100%; padding: 10px; border-radius: 8px; text-align: left; background: none; color: var(--text); }
  .menu button:hover { background: var(--hover); }
  .menu small { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.4; }
  .lead { display: inline-grid; color: var(--accent); }
  .pill[data-tone='success'] .lead { color: var(--success); }
  .pill[data-tone='warning'] .lead { color: var(--warning); }
  .pill[data-tone='error'] .lead { color: var(--danger); }
  .label { padding-right: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .spinner { width: 14px; height: 14px; border: 2px solid var(--accent-tint); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent) no-repeat; background-size: 40% 100%; animation: slide 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
  @media (prefers-color-scheme: dark) {
    .pill { --surface: #15202b; --text: #f7f9f9; --muted: #8b98a5; --border: #2f3b47; --hover: #1c2834; --accent-tint: #1b3448; --success: #2fc48d; --warning: #f0a830; --danger: #ff6c7b; box-shadow: 0 8px 28px rgb(0 0 0 / 0.5); }
  }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  @media (max-width: 640px) {
    .pill { box-sizing: border-box; max-width: calc(100vw - 24px); width: max-content; height: auto; min-height: 44px; flex-wrap: wrap; justify-content: center; padding: 6px; }
    .label { white-space: normal; line-height: 1.35; }
    .pill:not([data-phase='idle']) .label { flex: 1; min-width: 180px; }
  }
`;

export function initBookmarkImport() {
  const host = document.createElement('div');
  host.id = 'xtoc-library-capture';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style><div class="pill" role="region" aria-label="XTOC bookmark import"></div>`;
  const pill = shadow.querySelector('.pill');
  const state = { phase: 'idle', reason: '', added: 0, duplicates: 0, failed: 0, lastError: '' };
  let paused = false;
  let stopped = false;
  let dismissed = false;
  let active = false;
  let continuation = null;

  const moreMenu = () => `<details class="more"><summary class="icon-btn" aria-label="More import options" title="More import options">${icon('more')}</summary><div class="menu"><button type="button" data-action="full">Scan all bookmarks<small>Check older bookmarks too. Already saved items are skipped.</small></button></div></details>`;

  function body() {
    const { tone } = importLabel(state);
    const label = '<span class="label" role="status" aria-live="polite"></span>';
    if (state.phase === 'idle') {
      return `<button class="start" type="button" data-action="start" title="Import your bookmarks. On later imports, stop when you reach previously imported bookmarks.">${icon('import')}<span class="label"></span></button>${moreMenu()}${iconButton('close', 'close', 'Hide')}`;
    }
    if (state.phase === 'running') {
      return `<span class="lead"><span class="spinner"></span></span>${label}${iconButton('pause', 'pause', 'Pause')}${iconButton('stop', 'stop', 'Stop')}<span class="progress"></span>`;
    }
    if (state.phase === 'paused') {
      return `<span class="lead">${icon('pause')}</span>${label}${iconButton('resume', 'play', 'Resume')}${iconButton('stop', 'stop', 'Stop')}`;
    }
    const library =
      state.reason === 'no-bookmarks'
        ? ''
        : '<button class="text-btn" type="button" data-action="library">Open Library</button>';
    const more = state.reason === 'limit' ? '<button class="text-btn" type="button" data-action="continue">Continue</button>' : '';
    return `<span class="lead">${icon(tone === 'success' ? 'check' : 'alert')}</span>${label}${more}${library}${moreMenu()}${iconButton('close', 'close', 'Close')}`;
  }

  // Rebuild on phase changes; while importing only the count text changes,
  // so focus stays on the Pause/Stop buttons.
  function render() {
    const { tone, text } = importLabel(state);
    if (pill.dataset.phase !== state.phase || pill.dataset.reason !== state.reason) {
      pill.dataset.phase = state.phase;
      pill.dataset.reason = state.reason;
      pill.innerHTML = body();
    }
    pill.dataset.tone = tone;
    const label = pill.querySelector('.label');
    label.textContent = text;
    label.title = state.failed && state.lastError ? `Skipped: ${state.lastError}` : '';
  }

  const delay = (ms = SCAN_DELAY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

  // Wait for the first unread post to settle. Comparing the entire virtual list
  // would restart this wait whenever scrolling mounts another post at its tail.
  // Retain the maximum wait when X has not supplied another batch yet.
  async function waitForPosts(seen, current) {
    let previous = '';
    for (let elapsed = 0; elapsed < SCAN_DELAY_MS && !stopped && !paused && current(); elapsed += 250) {
      await delay(250);
      const first = [...document.querySelectorAll('article[data-testid="tweet"] time')]
        .map((time) => time.closest('a')?.href).filter((url) => xUrl(url))
        .map(contentId).find((id) => !seen.has(id));
      if (first && first === previous) return;
      previous = first;
    }
  }

  // Snapshot previews before X can recycle their DOM nodes. Only this bounded
  // queue separates scrolling from the serial background writer.
  function collectVisible({ seen, pending, queued, unsettled, progress, limit }) {
    let settling = false;
    for (const node of document.querySelectorAll('article[data-testid="tweet"]')) {
      const link = node.querySelector('time')?.closest('a')?.href;
      if (!link || !xUrl(link)) {
        if (isBookmarkedTweet(node)) progress.fail();
        continue;
      }
      const id = contentId(link);
      if (seen.has(id) || queued.has(id)) continue;
      if (pending.length >= MAX_PENDING || seen.size + pending.length >= limit) return false;
      const bookmarked = isBookmarkedTweet(node);
      if (!bookmarked) {
        // Hold scrolling so X cannot recycle the post before its state is known.
        if (!unsettled.has(id)) unsettled.set(id, performance.now());
        if (performance.now() - unsettled.get(id) < SETTLE_MS) {
          settling = true;
          continue;
        }
      }
      unsettled.delete(id);
      let payload, error;
      if (bookmarked) {
        try { payload = captureNode(node, link, true); }
        catch (caught) { error = caught; }
      }
      pending.push({ id, bookmarked, payload, error });
      queued.add(id);
    }
    return !settling && pending.length < MAX_PENDING && seen.size + pending.length < limit;
  }

  async function importPending({ seen, pending, queued, runStart, nextPosition, progress, current }) {
    let found = 0;
    let matched = 0;
    const candidates = pending.slice();
    const ids = candidates.filter((item) => item.bookmarked).map((item) => item.id);
    const ready = new Set();
    if (ids.length && current() && !stopped) {
      const statuses = await sendToLibrary('import:status', { ids });
      statuses.filter((item) => item.ready).forEach((item) => ready.add(item.id));
    }
    for (const { id, bookmarked, payload, error } of candidates) {
      if (stopped || paused || !current()) break;
      pending.shift();
      queued.delete(id);
      seen.add(id);
      found++;
      if (!bookmarked) {
        // Every post on a bookmarks list should be bookmarked; anything else
        // makes this run's coverage doubtful, so it must not set a boundary.
        progress.fail();
        continue;
      }
      matched++;
      try {
        const position = nextPosition();
        if (ready.has(id)) state.duplicates++;
        else {
          if (error) throw error;
          payload.bookmark.sortKey = runStart - position;
          const result = await sendToLibrary('library:capture', payload);
          result.duplicate ? state.duplicates++ : state.added++;
        }
        if (progress.observe(id, ready.has(id))) return { found, matched, caughtUp: true };
      } catch (error) {
        progress.fail();
        state.failed++;
        // Keep the first reason: later failures in one run usually repeat it.
        if (!state.lastError) {
          state.lastError = error.message;
          console.warn('XTOC bookmark import skipped a post:', error);
        }
        if (/save locally/i.test(error.message)) return { found, matched, storageFull: true };
      }
      render();
    }
    return { found, matched, storageFull: false };
  }

  async function run(full = false, resume = false) {
    if (active) return;
    active = true;
    let stopScroll;
    try {
      const previous = resume ? continuation : null;
      continuation = null;
      Object.assign(state, { phase: 'running', reason: '', ...(!previous ? { added: 0, duplicates: 0, failed: 0, lastError: '' } : {}) });
      paused = stopped = false;
      render();
      const route = location.href;
      const scope = importScope(document, location.pathname);
      const current = () => route === location.href && scope === importScope(document, location.pathname);
      if (previous && (previous.route !== route || previous.scope !== scope)) {
        Object.assign(state, { phase: 'done', reason: 'page-changed' });
        render();
        return;
      }
      const seen = previous?.seen || new Set();
      const limit = seen.size + MAX_ITEMS;
      const runStart = previous?.runStart || Date.now();
      const checkpoint = scope && !full && !previous ? await sendToLibrary('import:checkpoint', { scope }) : null;
      const progress = previous?.progress || importProgress(checkpoint);
      // An import boundary is meaningful only when scanning from the list's top.
      while (paused && !stopped && current()) await delay();
      if (!previous && !stopped && current()) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        await waitForPosts(seen, current);
      }
      let position = previous?.position || 0;
      let idleMs = 0;
      let lastScroll = window.scrollY;
      const pending = [];
      const queued = new Set();
      const unsettled = new Map();
      const collect = () => collectVisible({ seen, pending, queued, unsettled, progress, limit });
      let scrollError;
      stopScroll = startImportScroll({
        canAdvance: () => !paused && !stopped && current() && collect(),
        onError: (error) => { scrollError = error; stopped = true; }
      });
      let unmatched = 0;
      let reason = 'end';
      while (!stopped && current() && isBookmarksRoute(location.pathname)) {
        // Hidden tabs run no animation frames, so nothing scrolls or loads there.
        // Hold like a pause instead of counting that time towards the end.
        if (paused || document.hidden) {
          idleMs = 0;
          lastScroll = window.scrollY;
          await delay(100);
          continue;
        }
        collect();
        const round = await importPending({ seen, pending, queued, runStart, nextPosition: () => position++, progress, current });
        if (paused) continue;
        if (round.caughtUp) {
          reason = 'caught-up';
          break;
        }
        if (round.storageFull) {
          reason = 'storage';
          break;
        }
        idleMs = round.found || window.scrollY !== lastScroll ? 0 : idleMs + 100;
        lastScroll = window.scrollY;
        if (round.found) unmatched = round.matched ? 0 : unmatched + 1;
        if (unmatched >= UNMATCHED_ROUNDS && !state.added && !state.duplicates) {
          reason = 'no-bookmarks';
          break;
        }
        if (seen.size >= limit) {
          reason = 'limit';
          break;
        }
        const loading = Boolean(document.querySelector('[data-testid="primaryColumn"] [role="progressbar"]'));
        if (idleMs >= IDLE_MS && !loading) {
          const atBottom = window.scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
          if (!atBottom) reason = 'incomplete';
          break;
        }
        if (idleMs >= IDLE_MS * 3) { reason = 'loading'; break; }
        // The animation keeps moving while this consumer waits or saves. A full
        // pending queue pauses motion before any unread preview leaves the DOM.
        await delay(100);
      }
      stopScroll();
      if (scrollError) throw scrollError;
      if (stopped) reason = 'cancelled';
      if (!current()) reason = 'page-changed';
      if (reason === 'limit') continuation = { seen, runStart, position, progress, route, scope };
      // A stable, unloaded bottom is an observed end, not a server completeness
      // guarantee. Scan all bookmarks remains available to recover historical omissions.
      if (scope && !state.failed && ['end', 'caught-up'].includes(reason)) {
        const next = progress.checkpoint(runStart, scope, reason === 'caught-up');
        if (next) await sendToLibrary('import:finish', next);
      }
      Object.assign(state, { phase: 'done', reason });
      render();
    } finally { stopScroll?.(); active = false; }
  }

  const actions = {
    start: () => run(),
    full: () => run(true),
    continue: () => run(false, true),
    pause: () => {
      paused = true;
      state.phase = 'paused';
      render();
    },
    resume: () => {
      paused = false;
      state.phase = 'running';
      render();
    },
    stop: () => {
      stopped = true;
      paused = false;
    },
    library: () => chrome.runtime.sendMessage({ action: 'openLibrary' }),
    close: () => {
      dismissed = true;
      host.remove();
      Object.assign(state, { phase: 'idle', reason: '' });
    }
  };

  function dispatch(action) {
    Promise.resolve(actions[action]?.()).catch(() => {
      Object.assign(state, { phase: 'done', reason: 'error' });
      render();
    });
  }
  pill.addEventListener('click', (event) => dispatch(event.target.closest('[data-action]')?.dataset.action));
  pill.addEventListener('keydown', (event) => {
    const menu = pill.querySelector('.more[open]');
    if (event.key === 'Escape' && menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  // Capture phase, like the Library dropdowns, so X's own handlers cannot hide the press.
  const onOutsidePointer = (event) => closeMenuOutside(pill, event);
  document.addEventListener('pointerdown', onOutsidePointer, true);

  // Show only on the Bookmarks page; leaving it stops an import and resets a dismissal.
  function refresh() {
    if (isBookmarksRoute(location.pathname)) {
      if (!dismissed && !host.isConnected) document.body.append(host);
      return;
    }
    stopped = true;
    dismissed = false;
    host.remove();
    if (state.phase === 'done') {
      Object.assign(state, { phase: 'idle', reason: '' });
      render();
    }
  }

  function status() {
    const { tone, text } = importLabel(state);
    return { available: isBookmarksRoute(location.pathname), phase: state.phase, reason: state.reason,
      tone, text, commands: importCommands(state) };
  }

  // The popup drives the same import as the pill. Starting from the popup
  // brings a hidden pill back so progress and controls stay on the page.
  function perform(command) {
    if (!isBookmarksRoute(location.pathname) || !importCommands(state).includes(command))
      throw new Error('This import action is not available now.');
    dismissed = false;
    refresh();
    dispatch(command);
    return status();
  }

  render();
  refresh();
  const timer = setInterval(refresh, ROUTE_CHECK_MS);
  return {
    status,
    perform,
    destroy() {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      host.remove();
    }
  };
}
