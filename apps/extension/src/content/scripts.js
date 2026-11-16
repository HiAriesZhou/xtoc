// Content script entry on x.com / twitter.com: wires the TOC panel, the
// selection clip flow and the bookmark import, and handles popup messages.
import { areTocEntriesEqual, clampScrollTarget } from './navigation-utils.js';
import {
  isExtensionContextAvailable,
  isExtensionContextError,
  isExtensionMutation
} from './page-utils.js';
import { extractTOC, getPageKind } from './toc-extract.js';
import { TOCPanel } from './toc-panel.js';
import { INLINE_TOC_ID, InlineToc } from './toc-inline.js';
import { TOC_PREFS_KEY, normalizeTocPrefs } from '../library/toc-prefs.js';
import {
  destroyExcerptFeature,
  handleExcerptRouteChange,
  initExcerptFeature
} from './excerpt-capture.js';
import { captureCurrent } from './library-capture.js';
import { initBookmarkImport } from './bookmark-import-panel.js';
import { initAnalyticsBridge } from './analytics-bridge.js';
import { createLifecycle } from './lifecycle.js';

const TOC_SCROLL_OFFSET = 70;

let bookmarkImport = null;
let analyticsBridge = null;
let pageObserver = null;
let initialExtractTimeout = null;
let active = true; // false once this instance is torn down
let tocData = [];
let headerElements = [];
let tocPanel = null;
let inlineToc = null;
let tocPrefs = normalizeTocPrefs();
let resizeFrame = null;
const pendingPrefWrites = new Set(); // this tab's writes, to skip their echoes

const RECONNECT_MESSAGE = 'Reload this page to reconnect XTOC.';

function refreshTOC() {
  const { toc, headers } = extractTOC();
  tocData = toc;
  headerElements = headers;
  return toc;
}

// The inline contents follows the page: it appears on articles with sections,
// moves with X's layout and steps aside while the floating panel is open.
function syncInlineToc() {
  if (!active || !inlineToc) return;
  inlineToc.update({
    toc: tocData,
    pageKind: getPageKind(),
    prefs: tocPrefs,
    poppedOut: Boolean(tocPanel?.isVisible)
  });
}

// Writes only the changed fields over the stored value, so a change made in
// Settings or another tab meanwhile is kept.
async function saveTocPrefs(patch) {
  tocPrefs = { ...tocPrefs, ...patch };
  if (!isExtensionContextAvailable()) {
    inlineToc?.showStatus(RECONNECT_MESSAGE);
    return;
  }
  try {
    const stored = await chrome.storage.local.get(TOC_PREFS_KEY);
    const next = normalizeTocPrefs({ ...stored[TOC_PREFS_KEY], ...patch });
    const serialized = JSON.stringify(next);
    // Storage reports no change for an identical value, so only a real change has an echo.
    const current = stored[TOC_PREFS_KEY];
    if (current && serialized === JSON.stringify(normalizeTocPrefs(current))) return;
    pendingPrefWrites.add(serialized);
    await chrome.storage.local.set({ [TOC_PREFS_KEY]: next });
  } catch (error) {
    if (isExtensionContextError(error)) inlineToc?.showStatus(RECONNECT_MESSAGE);
    else console.error('[XTOC] Saving contents preferences failed:', error);
  }
}

function handleStorageChange(changes, area) {
  if (area !== 'local' || !changes[TOC_PREFS_KEY]) return;
  const next = normalizeTocPrefs(changes[TOC_PREFS_KEY].newValue);
  // An echo of this tab's own write is older than its current state.
  if (pendingPrefWrites.delete(JSON.stringify(next))) return;
  tocPrefs = next;
  syncInlineToc();
}

function openLibrary() {
  if (isExtensionContextAvailable()) tocPanel.openClips();
  else inlineToc?.showStatus(RECONNECT_MESSAGE);
}

function handleResize() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    syncInlineToc();
  });
}

function showFloatingPanel() {
  refreshTOC();
  tocPanel.show(tocData);
  tocPanel.persistLocalState({ tocPanelVisible: true });
  tocPanel.focusCurrent();
}

const tocTitle = () =>
  tocData.find((item) => item.level === 1)?.text || headerElements[0]?.text || null;

// Scroll to specific header by index
function scrollToHeader(index) {
  const header = headerElements[index];
  if (header && header.element) {
    // Get the element's position
    const rect = header.element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const maximumScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetScroll = clampScrollTarget(rect.top + scrollTop - TOC_SCROLL_OFFSET, maximumScroll);

    if (tocPanel?.isVisible) tocPanel.startNavigation(index, targetScroll);
    inlineToc?.startNavigation(index, targetScroll);

    window.scrollTo({
      top: targetScroll,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });

    header.element.style.transition = 'background-color 0.3s ease';
    header.element.style.backgroundColor = 'rgba(29, 155, 240, 0.2)';

    setTimeout(() => {
      header.element.style.backgroundColor = '';
    }, 2000);
  }
}

// Initialize
async function init() {
  bookmarkImport = initBookmarkImport();
  analyticsBridge = initAnalyticsBridge();
  // Wait for page to fully load
  initialExtractTimeout = setTimeout(() => {
    refreshTOC();
    syncInlineToc();
  }, 1500);

  // Initialize TOC Panel
  tocPanel = new TOCPanel({
    getHeaders: () => headerElements,
    onSelect: scrollToHeader,
    onVisibilityChange: syncInlineToc
  });
  await tocPanel.init();
  if (!active) return tocPanel.destroy();
  inlineToc = new InlineToc({
    getHeaders: () => headerElements,
    onSelect: scrollToHeader,
    onCollapse: (collapsed) => saveTocPrefs({ collapsed }),
    onPopOut: showFloatingPanel,
    onOpenLibrary: openLibrary,
    onHide: () => saveTocPrefs({ autoShow: false }),
    onSettled: syncInlineToc
  });
  initExcerptFeature({ getTocTitle: tocTitle });

  // Check if panel was visible before
  const storage = await chrome.storage.local.get(['tocPanelVisible', TOC_PREFS_KEY]);
  if (!active) return;
  tocPrefs = normalizeTocPrefs(storage[TOC_PREFS_KEY]);
  chrome.storage.onChanged.addListener(handleStorageChange);
  window.addEventListener('resize', handleResize);
  syncInlineToc();
  if (storage.tocPanelVisible && tocData.length > 0) {
    tocPanel.show(tocData);
  }

  // Watch for dynamic content (SPA navigation)
  const observer = new MutationObserver((mutations) => {
    handleExcerptRouteChange();
    if (mutations.every(isExtensionMutation)) return;
    clearTimeout(window.tocExtractTimeout);
    window.tocExtractTimeout = setTimeout(() => {
      const previous = tocData;
      const nextToc = refreshTOC();
      const tocChanged = !areTocEntriesEqual(previous, nextToc);
      if (tocPanel.isVisible && tocChanged) {
        tocPanel.show(nextToc);
      }
      syncInlineToc();
    }, 1000);
  });

  pageObserver = observer;
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for messages from popup or background
function handleMessage(message, sender, sendResponse) {
  if (message.action === 'captureCurrent') {
    captureCurrent().then(
      (data) => sendResponse({ ok: true, data }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }
  if (message.action === 'bookmarkImport') {
    // Without a command this only reports progress (the popup polls it).
    try {
      const status = message.command ? bookmarkImport.perform(message.command) : bookmarkImport.status();
      sendResponse({ ok: true, data: status });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }
  if (message.action === 'getTOC') {
    refreshTOC();
    sendResponse({
      toc: tocData,
      isPanelVisible: tocPanel?.isVisible || false,
      inlineToc: { autoShow: tocPrefs.autoShow, shown: Boolean(inlineToc?.isMounted) },
      pageKind: getPageKind(),
      bookmarkImport: bookmarkImport?.status()
    });
  } else if (message.action === 'scrollTo') {
    scrollToHeader(message.index);
    sendResponse({ success: true });
  } else if (message.action === 'togglePanel') {
    refreshTOC();
    tocPanel.toggle(tocData);
    sendResponse({ isVisible: tocPanel.isVisible });
  } else if (message.action === 'showPanel') {
    refreshTOC();
    tocPanel.show(tocData);
    sendResponse({ isVisible: true });
  } else if (message.action === 'hidePanel') {
    tocPanel.hide();
    sendResponse({ isVisible: false });
  } else if (message.action === 'setTocPrefs') {
    const patch = {};
    for (const key of ['autoShow', 'collapsed']) {
      if (typeof message.prefs?.[key] === 'boolean') patch[key] = message.prefs[key];
    }
    saveTocPrefs(patch).then(() => {
      syncInlineToc();
      sendResponse({ ok: true, prefs: tocPrefs });
    });
  }

  return true;
}
chrome.runtime.onMessage.addListener(handleMessage);

// Removes everything this instance added to the page. Runs when a newer
// instance replaces it, when the extension context is invalidated, or on
// Extension.js hot reload.
function teardown() {
  active = false;
  clearTimeout(initialExtractTimeout);
  clearTimeout(window.tocExtractTimeout);
  pageObserver?.disconnect();
  tocPanel?.destroy();
  inlineToc?.destroy();
  window.removeEventListener('resize', handleResize);
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  destroyExcerptFeature();
  bookmarkImport?.destroy();
  analyticsBridge?.destroy();
  try {
    chrome.runtime.onMessage.removeListener(handleMessage);
    chrome.storage.onChanged.removeListener(handleStorageChange);
  } catch {
    // The extension context is already gone.
  }
}

// UI left behind by an older build that predates the replace event.
const STALE_ELEMENT_IDS = [
  'twitter-toc-panel',
  'xtoc-save-excerpt-button',
  'xtoc-library-capture',
  INLINE_TOC_ID
];

const isExtensionAlive = () => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

const lifecycle = createLifecycle({ isAlive: isExtensionAlive, onTeardown: teardown });
lifecycle.start();
STALE_ELEMENT_IDS.forEach((id) => document.getElementById(id)?.remove());

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for Extension.js hot reload
export default function main() {
  return () => lifecycle.teardown();
}
