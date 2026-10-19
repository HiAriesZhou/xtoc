// X moved Bookmarks from /i/bookmarks into a tab of /i/history. Both routes are
// supported; the History page also has a Likes tab, so each post is checked.
export function isBookmarksRoute(pathname) {
  return /^\/i\/(?:bookmarks|history)(?:\/|$)/.test(pathname);
}

// X renders the bookmark action as "removeBookmark" once a post is saved. This
// does not depend on UI language or which History tab is open.
export function isBookmarkedTweet(node) {
  return Boolean(node.querySelector('[data-testid="removeBookmark"]'));
}

// Never share a boundary between accounts, folders, or History tabs. If the UI
// does not identify the account/list, import normally without an early stop.
export function importScope(doc, pathname) {
  const profile = doc.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
  const account = profile?.match(/^\/(\w{1,15})\/?$/)?.[1]?.toLowerCase();
  if (!account) return null;
  const folder = pathname.match(/^\/i\/bookmarks(?:\/(\d+))?\/?$/);
  if (folder) return `@${account}/bookmarks${folder[1] ? `/${folder[1]}` : ''}`;
  if (/^\/i\/history\/bookmarks\/?$/.test(pathname)) return `@${account}/bookmarks`;
  if (/^\/i\/history\/?$/.test(pathname)) {
    const selected = doc.querySelector('[role="tab"][aria-selected="true"]');
    if (/^\/i\/(?:history\/)?bookmarks\/?$/.test(selected?.getAttribute('href') || ''))
      return `@${account}/bookmarks`;
    // Current History tabs can be buttons without distinct URLs. Only recognize
    // explicit bookmark labels; unknown languages fall back to a full scan.
    const label = selected?.textContent?.trim().toLowerCase();
    if (['bookmarks', '书签', '書籤'].includes(label)) return `@${account}/bookmarks`;
  }
  return null;
}

export function importProgress(checkpoint) {
  const head = [];
  const observed = new Set();
  let matched = 0;
  let failed = false;
  return {
    observe(id, ready) {
      if (observed.has(id)) return false;
      observed.add(id);
      if (head.length < 5) head.push(id);
      if (!checkpoint || failed) return false;
      matched = ready && id === checkpoint.head[matched]
        ? matched + 1 : ready && id === checkpoint.head[0] ? 1 : 0;
      return matched === checkpoint.head.length;
    },
    fail() { failed = true; matched = 0; },
    checkpoint(startedAt, scope, incremental) {
      if (failed || head.length < 5) return null;
      return { scope, startedAt, head,
        covered: [...observed],
        ...(incremental ? { previousStartedAt: checkpoint.startedAt } : {}) };
    }
  };
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

// Commands each import phase accepts, from the page control or the popup. The
// first one is the main action.
export function importCommands({ phase, reason }) {
  if (phase === 'running') return ['pause', 'stop'];
  if (phase === 'paused') return ['resume', 'stop'];
  return [phase === 'done' && reason === 'limit' ? 'continue' : 'start', 'full'];
}

// One short line per import state. Reasons: end, cancelled, no-bookmarks,
// limit, page-changed, storage, error, caught-up, loading, incomplete.
export function importLabel({ phase, reason, added = 0, duplicates = 0, failed = 0 }) {
  if (phase === 'idle') return { tone: 'info', text: 'Import bookmarks' };
  // Count new imports apart from already saved ones; a combined number reads as
  // imports even when the Library does not grow.
  const saved = duplicates ? `${duplicates} already saved` : '';
  const skipped = failed ? `${failed} skipped` : '';
  if (phase === 'running') return { tone: 'info', text: join('Importing', `${added} new`, saved, skipped) };
  if (phase === 'paused') return { tone: 'info', text: join('Paused', `${added} new`, saved, skipped) };
  if (reason === 'no-bookmarks') return { tone: 'warning', text: 'No bookmarks on this tab' };
  if (reason === 'error') return { tone: 'error', text: 'Import failed · try again' };
  if (reason === 'caught-up')
    return { tone: 'success', text: added
      ? `${added} bookmark${added === 1 ? '' : 's'} imported`
      : 'Bookmarks up to date' };
  if (reason === 'loading')
    return { tone: 'warning', text: join(`${added} imported`, 'page still loading · try again') };
  if (reason === 'incomplete')
    return { tone: 'warning', text: join(`${added} imported`, 'list stalled · try again') };
  if (reason === 'storage')
    return { tone: 'error', text: join('Storage is full', `${added} imported`) };
  if (reason === 'cancelled')
    return { tone: 'info', text: join('Stopped', `${added} imported`, skipped) };
  if (reason === 'page-changed')
    return { tone: 'info', text: join('Page changed', `${added} imported`) };
  if (reason === 'limit')
    return { tone: 'info', text: join(`${added} imported`, 'continue for more') };
  if (!added && duplicates)
    return { tone: 'success', text: join(`All ${duplicates} already saved`, skipped) };
  return {
    tone: 'success',
    text: join(`${added} imported`, duplicates ? `${duplicates} already saved` : '', skipped)
  };
}

// Close the pill's "More import options" menu when a press lands outside it.
// The pill lives in a shadow root, so event.target is retargeted to the host;
// the composed path still includes the menu for presses inside it.
export function closeMenuOutside(root, event) {
  const menu = root.querySelector('.more[open]');
  if (!menu || event.composedPath().includes(menu)) return false;
  menu.open = false;
  return true;
}
