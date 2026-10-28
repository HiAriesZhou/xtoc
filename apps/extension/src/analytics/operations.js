// X's own analytics pages (x.com/i/account_analytics, Premium only) load their
// data through these GraphQL operations. XTOC never sends them itself: a
// MAIN-world content script copies the responses the page already received.
export const OPERATIONS = {
  overviewDaily: 'accountOverviewDailyQuery',
  overviewHourly: 'accountOverviewHourlyQuery',
  activeFollowers: 'activeFollowersTileQuery',
  audience: 'audienceOverviewDataQuery',
  content: 'contentPageQuery',
  // Mentions timeline (who replied to or mentioned the user), kept only from
  // the Mentions page. A live check showed that page loads NotificationsTimeline;
  // notificationsQuery is the newer client's name for the same timeline.
  mentions: 'NotificationsTimeline',
  mentionsRelay: 'notificationsQuery',
  // A post's own analytics page (x.com/i/account_analytics/content/<id>).
  postFirst48: 'postDetailsProviderFirst48HoursDataQuery',
  postLast48: 'postDetailsProviderLast48HoursOrganicDataQuery',
  postAudience: 'postDetailsProviderAudienceQuery'
};

export const POST_DETAIL_OPERATIONS = new Set([OPERATIONS.postFirst48, OPERATIONS.postLast48, OPERATIONS.postAudience]);

export const MENTION_OPERATIONS = new Set([OPERATIONS.mentions, OPERATIONS.mentionsRelay]);

const NAMES = new Set(Object.values(OPERATIONS));
const HOSTS = ['x.com', 'api.x.com', 'twitter.com', 'api.twitter.com'];

// Matches /graphql/<queryId>/<operation> and /i/api/graphql/<queryId>/<operation>.
// The query ID changes with every X deploy; the operation name is the stable part.
export function analyticsOperation(value) {
  let url;
  try {
    url = new URL(String(value), 'https://x.com');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname)) return null;
  const match = url.pathname.match(/^(?:\/i\/api)?\/graphql\/[\w-]+\/(\w+)\/?$/);
  return match && NAMES.has(match[1]) ? match[1] : null;
}

// Any GraphQL operation name, used only to report which operations a page
// loads (diagnostics); responses are captured only for the names above.
export function graphqlOperationName(value) {
  try {
    const url = new URL(String(value), 'https://x.com');
    if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname)) return null;
    return url.pathname.match(/^(?:\/i\/api)?\/graphql\/[\w-]+\/(\w{1,80})\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

export const isDiagnosticPath = (path) => /^\/(?:i\/account_analytics|notifications)(?:\/|$)/.test(String(path));

export const ANALYTICS_ORIGIN = 'https://x.com';

// Captures are accepted only from X's own analytics pages, the Mentions page
// for the notifications operation, or the sync tab.
export function isAnalyticsPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'x.com' && /^\/i\/account_analytics(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

export const MENTIONS_URL = 'https://x.com/notifications/mentions';

export function isCapturePage(value, operation) {
  if (!MENTION_OPERATIONS.has(operation)) return isAnalyticsPage(value);
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'x.com' && /^\/notifications\/mentions\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
export const PREMIUM_REDIRECTS = ['/i/premium_sign_up', '/i/flow/login', '/i/jf/onboarding', '/login'];

const DAY_MS = 86400000;
// A live check showed X's content query returns only a sample of posts for
// long ranges (a year gave 245 of 749 posts) but complete results for 28 days.
// X's own content page offers at most three months.
export const CONTENT_WINDOW_DAYS = 28;
export const MAX_BACKFILL_DAYS = 3 * CONTENT_WINDOW_DAYS;
const OVERLAP_DAYS = 2; // recent numbers keep changing, so each sync re-reads them

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Content windows, newest first: everything since the last successful sync
// (plus overlap), or 12 weeks on the first run. The page reads from/to from
// its URL, so no clicks are needed.
export function contentRanges(lastSuccessAt, now = Date.now()) {
  const last = Date.parse(lastSuccessAt || '');
  const days = Number.isFinite(last)
    ? Math.min(MAX_BACKFILL_DAYS, Math.ceil((now - last) / DAY_MS) + OVERLAP_DAYS)
    : MAX_BACKFILL_DAYS;
  const ranges = [];
  for (let end = 0; end < days; end += CONTENT_WINDOW_DAYS) {
    const span = Math.min(CONTENT_WINDOW_DAYS, days - end);
    ranges.push({ from: isoDay(now - (end + span - 1) * DAY_MS), to: isoDay(now - end * DAY_MS) });
  }
  return ranges;
}

export const contentUrl = ({ from, to }) =>
  `${ANALYTICS_ORIGIN}/i/account_analytics/content/?type=all&from=${from}&to=${to}`;

// One sync visits the content page (once per window), audience, overview and Mentions in a background tab and waits for the operation
// each page must load. Optional operations are kept when they arrive.
export function syncSteps(lastSuccessAt, now = Date.now()) {
  const content = contentRanges(lastSuccessAt, now).map((range, i) => ({
    id: i ? `content-${i + 1}` : 'content',
    url: contentUrl(range),
    expect: OPERATIONS.content,
    range
  }));
  return [
    ...content,
    {
      id: 'audience',
      url: `${ANALYTICS_ORIGIN}/i/account_analytics/audience`,
      expect: OPERATIONS.audience
    },
    {
      id: 'overview',
      url: `${ANALYTICS_ORIGIN}/i/account_analytics`,
      expect: OPERATIONS.overviewDaily
    },
    // Optional: a missing Mentions timeline never fails the sync.
    { id: 'mentions', url: MENTIONS_URL, expect: OPERATIONS.mentions, alsoExpect: [OPERATIONS.mentionsRelay], optional: true }
  ];
}

// The content page returns at most 1000 posts per range. When a capture hits
// that cap, the next step reads the older part of the range.
export const CONTENT_PAGE_LIMIT = 1000;

export function olderContentStep(range, oldestPostMs) {
  const to = isoDay(oldestPostMs);
  if (!range?.from || to <= range.from) return null;
  return {
    id: 'content-older',
    url: contentUrl({ from: range.from, to }),
    expect: OPERATIONS.content,
    range: { from: range.from, to }
  };
}

export const AUTO_SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000; // about once a day

export function autoSyncDue({ autoSync, lastAttemptAt }, now = Date.now()) {
  if (!autoSync) return false;
  const last = Date.parse(lastAttemptAt || '');
  return !Number.isFinite(last) || now - last >= AUTO_SYNC_INTERVAL_MS;
}

export function isPremiumRedirect(value) {
  try {
    const url = new URL(value);
    return PREMIUM_REDIRECTS.some((path) => url.pathname.startsWith(path));
  } catch {
    return false;
  }
}
