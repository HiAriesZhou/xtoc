export type XtocExportFormat = 'markdown' | 'json';

export interface XtocArticle {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  platform: string;
  createdAt: string;
  updatedAt: string;
}

export interface XtocClip {
  id: string;
  articleId: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  pageUrl: string;
  selectionLength: number;
  createdAt: string;
  updatedAt?: string;
  source: string;
  tags?: string[];
  note?: string;
}

export interface XtocSettings {
  contextLength: number;
  defaultExportFormat: XtocExportFormat;
}

export interface XtocStorageShape {
  twitterTocArticles: Record<string, XtocArticle>;
  twitterTocExcerpts: Record<string, XtocClip>;
  twitterTocExcerptSettings: XtocSettings;
  xtocLibraryItems: Record<string, XtocBookmark>;
  xtocAIPrefs: XtocAIPrefs;
  xtocBookmarkImports: Record<string, XtocBookmarkImport>;
  tocPanelPosition: { x: number; y: number };
  tocPanelVisible: boolean;
  xtocTocPrefs: XtocTocPrefs;
}

// Inline article contents display (src/library/toc-prefs.js). Panel UI state,
// written by the content script and the Settings page; never exported.
export interface XtocTocPrefs {
  autoShow: boolean; // show the contents module on articles (default true)
  collapsed: boolean; // module collapsed to its header (default false)
}

// Where a repeat bookmark import may stop, keyed by scope ("@handle/bookmarks",
// optionally "/<folderId>"). Never exported (see src/library/bookmark-import.js).
export interface XtocBookmarkImport {
  version: 1;
  startedAt: number;
  /** The 5 newest bookmark IDs of the last complete import. */
  head: string[];
  /** Up to 10000 imported bookmark IDs, newest first. */
  covered: string[];
}

// The API key itself is never stored here (see src/library/key-vault.js).
export interface XtocAIPrefs {
  provider: string;
  endpoint: string;
  model: string;
  remember: boolean;
}

export interface XtocJsonExportClip {
  id: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  pageUrl: string;
  selectionLength: number;
  createdAt: string;
  updatedAt?: string;
  source: string;
  tags?: string[];
  note?: string;
}

export interface XtocJsonExportArticle {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  platform: string;
  createdAt: string | null;
  updatedAt: string | null;
  excerpts: XtocJsonExportClip[];
}

export interface XtocJsonExportV1 {
  version: 1;
  source: 'twitter-toc-extension';
  exportedAt: string;
  articles: XtocJsonExportArticle[];
}

export interface XtocBookmark {
  id: string;
  kind: 'article' | 'post';
  markdown: string;
  fromXBookmarks: boolean;
  capturedAt: string;
  updatedAt: string;
  tags: string[];
  note: string;
  summary: string;
  summaryModel: string;
  /** Descending order key; imports follow X's bookmark order. */
  sortKey: number;
}
