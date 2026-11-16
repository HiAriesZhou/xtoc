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
// for the notifications operation.
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

export const contentUrl = ({ from, to }) =>
  `${ANALYTICS_ORIGIN}/i/account_analytics/content/?type=all&from=${from}&to=${to}`;

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

// Read only date-bound variables from an allowlisted analytics request. Never
// forward the URL, request body, headers, account IDs or authentication data.
export function analyticsRequestRange(url, body) {
  let variables;
  try {
    const value = new URL(String(url), ANALYTICS_ORIGIN).searchParams.get('variables');
    const payload = typeof body === 'string' && body.length < 100000 ? JSON.parse(body) : null;
    variables = value ? JSON.parse(value) : payload?.variables;
    if (typeof variables === 'string') variables = JSON.parse(variables);
  } catch { return null; }
  const out = {};
  function visit(object, depth = 0) {
    if (!object || typeof object !== 'object' || depth > 5) return;
    for (const [key, value] of Object.entries(object).slice(0, 80)) {
      const name = key.replaceAll('_', '').toLowerCase();
      const side = ['from', 'fromdate', 'fromtime', 'startdate', 'starttime'].includes(name) ? 'from'
        : ['to', 'todate', 'totime', 'enddate', 'endtime'].includes(name) ? 'to' : '';
      if (side && (typeof value === 'string' || typeof value === 'number')) {
        const ms = /^\d{10,13}$/.test(String(value)) ? Number(value) * (String(value).length === 10 ? 1000 : 1) : Date.parse(value);
        if (Number.isFinite(ms) && ms > Date.UTC(2006, 0) && ms < Date.UTC(2100, 0)) out[side] = new Date(ms).toISOString().slice(0, 10);
      } else if (typeof value === 'object') visit(value, depth + 1);
    }
  }
  visit(variables);
  return out.from && out.to ? out : null;
}
