// Article contents display preferences. Panel UI state in chrome.storage.local:
// written by the content script and the Settings page, never exported.
export const TOC_PREFS_KEY = 'xtocTocPrefs';

export const DEFAULT_TOC_PREFS = Object.freeze({ autoShow: true, collapsed: false });

export function normalizeTocPrefs(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    autoShow: typeof source.autoShow === 'boolean' ? source.autoShow : DEFAULT_TOC_PREFS.autoShow,
    collapsed:
      typeof source.collapsed === 'boolean' ? source.collapsed : DEFAULT_TOC_PREFS.collapsed
  };
}
