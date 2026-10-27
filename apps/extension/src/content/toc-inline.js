// Quiet article contents that looks like part of X: a module at the top of X's
// right column on article pages, or a card beside the Focus mode column.
import { areTocEntriesEqual } from './navigation-utils.js';
import { INLINE_TOC_STYLES } from './toc-inline-styles.js';
import {
  chooseTocPlacement,
  countSections,
  gutterCardGeometry,
  isFocusRoute,
  pickAccentColor,
  pickTocTheme
} from './toc-placement.js';
import { TocTracker, markActiveItem, renderTocList } from './toc-view.js';

export const INLINE_TOC_ID = 'xtoc-inline-toc';

const SIDEBAR_SELECTOR = '[data-testid="sidebarColumn"]';
const FOCUS_COLUMN_SELECTOR = '[data-testid="twitterArticleReadView"]';
const ACCENT_SOURCES = `${SIDEBAR_SELECTOR} a span, ${FOCUS_COLUMN_SELECTOR} a`;
// X sets its font on text elements, not on <body>, so it is not inherited.
const FONT_SOURCES = `${SIDEBAR_SELECTOR} h2 span, ${SIDEBAR_SELECTOR} span, ${FOCUS_COLUMN_SELECTOR} span`;
const FALLBACK_FONT =
  'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SEARCH_BAR_HEIGHT = 53; // X's fixed search bar, the sticky offset fallback
// Measured on x.com: the spacer below the search bar already leaves 12px above
// the first module, and modules have a 16px bottom margin and no top margin.
const MODULE_INSET = 12;
const MODULE_GAP = 16;
const GUTTER_TOP = 56; // where the Focus mode column starts
const LIST_RESERVE = 96; // head, paddings and breathing room below the card
const MIN_LIST_HEIGHT = 160;
const HIDE_NOTICE_MS = 4000;

const CHEVRON =
  '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const MORE =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

// X's right column holds one list of modules (search bar, spacer, modules,
// footer). Climb from a module, not down from the column: the column's outer
// wrapper also has two children, a spacer and the sticky container.
function findSidebarList() {
  const sidebar = document.querySelector(SIDEBAR_SELECTOR);
  let row = sidebar?.querySelector('aside, section, nav');
  while (row && row !== sidebar) {
    const list = row.parentElement;
    if (list && list !== sidebar && list.children.length >= 3) return list;
    row = list;
  }
  return null;
}

const isFixed = (element) => getComputedStyle(element).position === 'fixed';

// The first module after the search bar and its spacer.
function findFirstModule(list) {
  return (
    [...list.children].find(
      (child) => child.id !== INLINE_TOC_ID && !isFixed(child) && child.textContent.trim()
    ) || null
  );
}

function stickyTop(list) {
  const search = [...list.children].find(isFixed);
  const bottom = search ? Math.round(search.getBoundingClientRect().bottom) : 0;
  return bottom > 0 ? bottom : SEARCH_BAR_HEIGHT;
}

function focusGutter() {
  const column = document.querySelector(FOCUS_COLUMN_SELECTOR);
  if (!column) return null;
  return gutterCardGeometry({
    columnRight: column.getBoundingClientRect().right,
    viewportWidth: document.documentElement.clientWidth
  });
}

const sectionLabel = (count) => `${count} ${count === 1 ? 'section' : 'sections'}`;

export class InlineToc {
  // getHeaders: () => heading entries; onSelect: (index) => jump; onCollapse:
  // (collapsed) => persist; onPopOut, onOpenLibrary, onHide: menu actions;
  // onSettled: () => run update() again once the hide notice is gone.
  constructor({ getHeaders, onSelect, onCollapse, onPopOut, onOpenLibrary, onHide, onSettled }) {
    this.callbacks = { onSelect, onCollapse, onPopOut, onOpenLibrary, onHide, onSettled };
    this.host = null;
    this.root = null;
    this.placement = 'none';
    this.toc = [];
    this.collapsed = false;
    this.hideTimer = null;
    this.accentSampled = false;
    this.tracker = new TocTracker({ getHeaders, onChange: (index) => this.highlight(index) });
    this.handleOutsidePointer = (event) => {
      if (!event.composedPath().includes(this.host)) this.closeMenu(false);
    };
  }

  get isMounted() {
    return Boolean(this.host?.isConnected);
  }

  // state: { toc, pageKind, prefs: { autoShow, collapsed }, poppedOut }.
  // Idempotent: runs after every page change, resize and preference change.
  update({ toc, pageKind, prefs, poppedOut }) {
    // The hide notice stays for its few seconds unless the reader leaves the article.
    if (this.hideTimer) {
      if (pageKind === 'article') return;
      this.finishHide();
    }
    const sidebarList = findSidebarList();
    const gutter = focusGutter();
    const placement = chooseTocPlacement({
      pageKind,
      focusRoute: isFocusRoute(window.location.href),
      hasSidebar: Boolean(sidebarList),
      gutter,
      sectionCount: countSections(toc),
      autoShow: prefs.autoShow,
      poppedOut
    });
    if (placement === 'none') {
      this.unmount();
      return;
    }

    if (!this.host) this.create();
    const tocChanged = !areTocEntriesEqual(this.toc, toc);
    if (tocChanged || !this.root.querySelector('.card')) this.renderCard(toc);
    this.setCollapsed(prefs.collapsed);
    this.applyTheme();
    if (placement === 'sidebar') this.placeInSidebar(sidebarList);
    else this.placeInGutter(gutter);
    this.placement = placement;
    if (!this.tracker.running || tocChanged) this.tracker.start();
  }

  create() {
    this.host = document.createElement('div');
    this.host.id = INLINE_TOC_ID;
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  renderCard(toc) {
    this.toc = toc.map((entry) => ({ ...entry }));
    const count = countSections(toc);
    this.root.innerHTML = `
      <style>${INLINE_TOC_STYLES}</style>
      <nav class="card" aria-label="Article contents">
        <div class="head">
          <button class="toggle" type="button" aria-expanded="true" aria-controls="xtoc-inline-list">
            <span class="title">Contents</span>
            <span class="count">${sectionLabel(count)}</span>
            ${CHEVRON}
          </button>
          <button class="more" type="button" aria-label="Contents options" aria-haspopup="menu" aria-expanded="false">${MORE}</button>
          <div class="menu" role="menu" hidden>
            <button type="button" role="menuitem" data-action="popout">Pop out contents</button>
            <button type="button" role="menuitem" data-action="library">Open Library</button>
            <button type="button" role="menuitem" data-action="hide">Hide on articles</button>
          </div>
        </div>
        <div class="curtain"><div class="curtain-inner">
          <div class="body" id="xtoc-inline-list">${renderTocList(toc)}</div>
        </div></div>
      </nav>`;
    this.tracker.reset();
  }

  // Replaces the list with a short message, for example after the extension
  // was updated and this page lost its connection.
  showStatus(text) {
    if (!this.isMounted) return;
    this.tracker.stop();
    this.setCollapsed(false);
    this.root.querySelector('.count').textContent = '';
    const body = this.root.querySelector('.body');
    body.innerHTML = '<p class="notice" role="status" tabindex="-1"></p>';
    const notice = body.firstElementChild;
    // Filled after insertion so screen readers announce it.
    requestAnimationFrame(() => {
      notice.textContent = text;
    });
    this.toc = [];
    return notice;
  }

  setCollapsed(collapsed) {
    this.collapsed = collapsed;
    const card = this.root.querySelector('.card');
    card.classList.toggle('collapsed', collapsed);
    this.root.querySelector('.toggle').setAttribute('aria-expanded', String(!collapsed));
    this.root.querySelector('.body').toggleAttribute('inert', collapsed);
  }

  // X's theme and accent are page settings, so read them from the page.
  applyTheme() {
    const background = getComputedStyle(document.body).backgroundColor;
    const theme = pickTocTheme({
      background,
      colorScheme: getComputedStyle(document.documentElement).colorScheme
    });
    const unchanged =
      this.host.dataset.theme === theme && this.host.dataset.background === background;
    if (unchanged && this.accentSampled) return;
    // Links can render after the module; sample again until some exist.
    const accentCandidates = [...document.querySelectorAll(ACCENT_SOURCES)]
      .slice(0, 40)
      .map((element) => getComputedStyle(element).color);
    this.accentSampled = accentCandidates.length > 0;
    const textSample = document.querySelector(FONT_SOURCES);
    this.host.style.fontFamily = textSample
      ? getComputedStyle(textSample).fontFamily
      : FALLBACK_FONT;
    this.host.dataset.theme = theme;
    this.host.dataset.background = background;
    this.host.style.setProperty('--xtoc-bg', background);
    this.host.style.setProperty('--xtoc-accent', pickAccentColor(accentCandidates));
  }

  // Sticks below X's search bar; the modules after it slide underneath.
  placeInSidebar(list) {
    const anchor = findFirstModule(list);
    if (this.host.parentElement !== list || this.host.nextElementSibling !== anchor) {
      list.insertBefore(this.host, anchor);
    }
    const top = stickyTop(list);
    // The next module keeps its own top margin; together they make X's gap.
    const anchorMargin = anchor ? Number.parseFloat(getComputedStyle(anchor).marginTop) || 0 : 0;
    Object.assign(this.host.style, {
      position: 'sticky',
      top: `${top}px`,
      left: '',
      width: '',
      zIndex: '1',
      // Pulled up over the spacer's inset, so the card sits where X's first
      // module did, at rest and when stuck, with an opaque band above it.
      margin: `-${MODULE_INSET}px 0 0`,
      padding: `${MODULE_INSET}px 0 ${Math.max(0, MODULE_GAP - anchorMargin)}px`,
      background: 'var(--xtoc-bg)'
    });
    this.setListMax(window.innerHeight - top - LIST_RESERVE);
  }

  placeInGutter(gutter) {
    if (this.host.parentElement !== document.body) document.body.appendChild(this.host);
    Object.assign(this.host.style, {
      position: 'fixed',
      top: `${GUTTER_TOP}px`,
      left: `${gutter.left}px`,
      width: `${gutter.width}px`,
      // Above the article text, below X's own menus and dialogs.
      zIndex: '0',
      margin: '0',
      padding: '0',
      background: 'transparent'
    });
    this.setListMax(window.innerHeight - GUTTER_TOP - LIST_RESERVE);
  }

  setListMax(height) {
    this.host.style.setProperty('--xtoc-list-max', `${Math.max(MIN_LIST_HEIGHT, height)}px`);
  }

  startNavigation(index, targetScroll) {
    if (this.isMounted) this.tracker.startNavigation(index, targetScroll);
  }

  highlight(index) {
    if (!this.root) return;
    markActiveItem(this.root, this.root.querySelector('.body'), index);
  }

  handleClick(event) {
    const item = event.target.closest('.toc-item');
    if (item) {
      this.callbacks.onSelect(Number(item.dataset.index));
      return;
    }
    if (event.target.closest('.toggle')) {
      this.setCollapsed(!this.collapsed);
      this.callbacks.onCollapse(this.collapsed);
      return;
    }
    if (event.target.closest('.more')) {
      if (this.root.querySelector('.menu').hidden) this.openMenu();
      else this.closeMenu();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    this.closeMenu(false);
    if (action === 'popout') this.callbacks.onPopOut();
    else if (action === 'library') this.callbacks.onOpenLibrary();
    else if (action === 'hide') this.showHideNotice();
  }

  handleKeydown(event) {
    const menu = this.root.querySelector('.menu');
    if (!menu || menu.hidden) return;
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const current = items.indexOf(this.root.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length].focus();
    } else if (event.key === 'Tab') {
      this.closeMenu(false);
    }
  }

  openMenu() {
    const menu = this.root.querySelector('.menu');
    menu.hidden = false;
    this.root.querySelector('.more').setAttribute('aria-expanded', 'true');
    menu.querySelector('[role="menuitem"]').focus();
    document.addEventListener('pointerdown', this.handleOutsidePointer, true);
  }

  closeMenu(returnFocus = true) {
    const menu = this.root?.querySelector('.menu');
    document.removeEventListener('pointerdown', this.handleOutsidePointer, true);
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const more = this.root.querySelector('.more');
    more.setAttribute('aria-expanded', 'false');
    if (returnFocus) more.focus();
  }

  // Saves at once, then says where to turn the contents back on before it
  // disappears. The controls are inert meanwhile.
  showHideNotice() {
    this.callbacks.onHide();
    this.root.querySelector('.head').inert = true;
    this.showStatus(
      'Hidden on articles. Turn it back on from the XTOC popup or Library settings.'
    )?.focus();
    this.hideTimer = setTimeout(() => {
      this.finishHide();
      // Preferences may have changed while the notice was showing.
      this.callbacks.onSettled();
    }, HIDE_NOTICE_MS);
  }

  finishHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.unmount();
    this.root.querySelector('.head').inert = false;
  }

  unmount() {
    this.closeMenu(false);
    this.tracker.stop();
    this.host?.remove();
    this.placement = 'none';
  }

  destroy() {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.unmount();
    this.host = null;
    this.root = null;
    this.toc = [];
  }
}
