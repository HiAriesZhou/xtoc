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
  xtocAnalytics: XtocAnalyticsStore;
  xtocAnalyticsPrefs: { autoSync: boolean };
  xtocAnalyticsSync: XtocAnalyticsSyncStatus;
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

/** Metric totals; every field is optional because X may omit any of them. */
export type XtocAnalyticsMetrics = Partial<
  Record<
    | 'Impressions' | 'Engagements' | 'Likes' | 'Replies' | 'Reposts' | 'Bookmarks' | 'Shares'
    | 'ProfileVisits' | 'Follows' | 'Unfollows' | 'DetailExpands' | 'UrlClicks' | 'HashtagClicks'
    | 'PermalinkClicks' | 'Posts' | 'ReplyPosts' | 'Quotes' | 'VerifiedEngagements',
    number
  >
>;

export interface XtocAnalyticsPost {
  id: string;
  /** Epoch milliseconds. */
  createdAt: number;
  text: string;
  kind: 'post' | 'reply' | 'community';
  replyTo: { tweetId: string; handle: string; userId: string } | null;
  hashtags: string[];
  links: number;
  media: string[];
  metrics: XtocAnalyticsMetrics;
  firstSeenAt: number;
  updatedAt: number;
  /** [capturedAt, impressions, engagements, follows, profileVisits], at most 40. */
  snapshots: [number, number, number, number, number][];
}

export interface XtocAnalyticsAccount {
  id: string;
  handle?: string;
  name?: string;
  avatar?: string;
  updatedAt: number;
  info?: { followers?: number; verifiedFollowers?: number; activeFollowers?: number; realtimeActive?: number; realtimeApproximate?: boolean; capturedAt: number };
  /** Follower count per UTC day when it was captured. */
  followers?: Record<string, { followers: number; verifiedFollowers?: number }>;
  /** Keyed by UTC day, YYYY-MM-DD. */
  daily?: Record<string, XtocAnalyticsMetrics>;
  /** Keyed by UTC hour, YYYY-MM-DDTHH; last 60 days. */
  hourly?: Record<string, XtocAnalyticsMetrics>;
  /** X's audience heatmap, keyed by UTC hour; last 35 days. */
  heatmap?: Record<string, XtocAnalyticsMetrics>;
  audience?: Record<'age' | 'gender' | 'device' | 'network' | 'country', Record<string, XtocAnalyticsMetrics>> & { capturedAt: number };
  posts?: Record<string, XtocAnalyticsPost>;
  /** Others' replies and mentions from the Mentions timeline, keyed by tweet ID; no text. */
  inbound?: Record<string, { id: string; handle: string; createdAt: number; kind: 'reply' | 'mention' }>;
  /** From a post's own X analytics page, keyed by post ID; at most 200 posts. */
  postDetails?: Record<string, { first48?: Record<string, XtocAnalyticsMetrics>; last48?: Record<string, XtocAnalyticsMetrics>; audience?: Record<string, Record<string, XtocAnalyticsMetrics>>; capturedAt: number }>;
}

/** chrome.storage.local `xtocAnalytics`. Never exported with clips. */
export interface XtocAnalyticsStore {
  version: 1;
  accounts: Record<string, XtocAnalyticsAccount>;
}

/** chrome.storage.local `xtocAnalyticsSync`. */
export interface XtocAnalyticsSyncStatus {
  running: boolean;
  trigger?: 'manual' | 'auto';
  lastAttemptAt?: string;
  lastSuccessAt?: string | null;
  ok?: boolean;
  error?: string | null;
  steps?: { id: string; ok: boolean }[];
}
