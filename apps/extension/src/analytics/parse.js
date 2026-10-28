// Turns X analytics GraphQL responses into small, typed records. The shapes
// follow the Relay queries in X's web client (see operations.js); every field is
// optional here, because X can change them and a partial capture is still useful.
import { MENTION_OPERATIONS, OPERATIONS, POST_DETAIL_OPERATIONS } from './operations.js';

// XTOC metric names, shared by days, hours and posts.
export const METRICS = [
  'Impressions',
  'Engagements',
  'Likes',
  'Replies',
  'Reposts',
  'Bookmarks',
  'Shares',
  'ProfileVisits',
  'Follows',
  'Unfollows',
  'DetailExpands',
  'UrlClicks',
  'HashtagClicks',
  'PermalinkClicks',
  'Posts',
  'ReplyPosts',
  'Quotes',
  'VerifiedEngagements'
];
const METRIC_SET = new Set(METRICS);

// X metric_type names (organic metrics) to XTOC names.
const METRIC_TYPES = {
  Impressions: 'Impressions',
  Engagements: 'Engagements',
  Likes: 'Likes',
  Replies: 'Replies',
  Retweets: 'Reposts',
  Bookmark: 'Bookmarks',
  Share: 'Shares',
  ProfileVisits: 'ProfileVisits',
  Follows: 'Follows',
  Unfollows: 'Unfollows',
  DetailExpands: 'DetailExpands',
  UrlClicks: 'UrlClicks',
  HashtagClicks: 'HashtagClicks',
  PermalinkClicks: 'PermalinkClicks',
  CreateTweet: 'Posts',
  CreateReply: 'ReplyPosts',
  CreateQuote: 'Quotes'
};

// Engagement-count events (uec_* series) to XTOC names. X's own overview sums
// the ENGAGING types into "Engagements".
const ENGAGEMENT_TYPES = {
  Displayed: 'Impressions',
  Fav: 'Likes',
  Reply: 'Replies',
  Retweet: 'Reposts',
  QuoteTweet: 'Reposts',
  Bookmark: 'Bookmarks',
  Share: 'Shares',
  ProfilePic: 'ProfileVisits',
  Follow: 'Follows',
  Unfollow: 'Unfollows',
  TweetCreate: 'Posts',
  ReplyCreate: 'ReplyPosts',
  QuoteCreate: 'Quotes'
};
const ENGAGING = new Set(['Bookmark', 'Fav', 'ProfilePic', 'QuoteTweet', 'Reply', 'Retweet', 'Share']);

const MAX_TEXT = 1000;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_POSTS = 5000;
const MAX_SERIES = 20000;

const num = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const list = (value, max = MAX_SERIES) => (Array.isArray(value) ? value.slice(0, max) : []);
const str = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');

// Timestamps arrive as epoch milliseconds (number or numeric string) or ISO text.
export function toMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{9,}$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);

const viewerUser = (body) => {
  const result = body?.data?.viewer_v2?.user_results?.result;
  return result && typeof result === 'object' ? result : null;
};

// Relay global IDs are base64 "User:<rest_id>".
export function restIdFromGlobal(id) {
  if (typeof id !== 'string' || id.length > 200) return '';
  try {
    const decoded = atob(id);
    return decoded.match(/^User:(\d{1,25})$/)?.[1] || '';
  } catch {
    return /^\d{1,25}$/.test(id) ? id : '';
  }
}

const accountId = (user) => str(user?.rest_id, 25).match(/^\d+$/)?.[0] || restIdFromGlobal(user?.id);

function addMetric(target, name, value) {
  if (!METRIC_SET.has(name)) return;
  target[name] = (target[name] || 0) + num(value);
}

function organicTotals(values) {
  const out = {};
  for (const item of list(values, 100)) {
    const name = METRIC_TYPES[item?.metric_type];
    if (name) addMetric(out, name, item.metric_value);
  }
  return out;
}

// uec_* rows: { timestamp, engagement_type, count, is_engaging_user_verified? }.
function bucketEngagements(rows, keyOf) {
  const buckets = {};
  for (const row of list(rows)) {
    const ms = toMs(row?.timestamp);
    const name = ENGAGEMENT_TYPES[row?.engagement_type];
    if (ms === null || !name) continue;
    const key = keyOf(ms);
    const bucket = (buckets[key] ||= {});
    addMetric(bucket, name, row.count);
    if (ENGAGING.has(row.engagement_type)) {
      addMetric(bucket, 'Engagements', row.count);
      if (row.is_engaging_user_verified === true) addMetric(bucket, 'VerifiedEngagements', row.count);
    }
  }
  return buckets;
}

// organic_metrics_time_series rows: { timestamp: { iso8601_time }, metric_values }.
function organicSeries(rows, keyOf) {
  const buckets = {};
  for (const row of list(rows)) {
    const ms = toMs(row?.timestamp?.iso8601_time ?? row?.timestamp);
    if (ms === null) continue;
    buckets[keyOf(ms)] = { ...buckets[keyOf(ms)], ...organicTotals(row.metric_values) };
  }
  return buckets;
}

function followerInfo(user) {
  const info = {};
  if (user.relationship_counts?.followers != null) info.followers = num(user.relationship_counts.followers);
  if (user.verified_follower_count != null) info.verifiedFollowers = num(user.verified_follower_count);
  if (user.author_follower_metrics?.active_followers != null)
    info.activeFollowers = num(user.author_follower_metrics.active_followers);
  if (user.realtime_active_followers?.active_count != null) {
    info.realtimeActive = num(user.realtime_active_followers.active_count);
    info.realtimeApproximate = user.realtime_active_followers.is_approximate === true;
  }
  return info;
}

function parseOverviewDaily(user) {
  const days = bucketEngagements(user.current_time_series, dayKey);
  // X's overview takes follows and unfollows from the organic series.
  const follows = organicSeries(user.legacy_current_follow_metrics, dayKey);
  for (const [key, values] of Object.entries(follows)) {
    days[key] = { ...days[key] };
    for (const name of ['Follows', 'Unfollows'])
      if (values[name] !== undefined) days[key][name] = values[name];
  }
  return { days, account: followerInfo(user) };
}

function parseOverviewHourly(user) {
  return { hours: bucketEngagements(user.current_time_series, hourKey), account: followerInfo(user) };
}

const AUDIENCE_DIMENSIONS = {
  age: (row) => (row.age && row.age !== 'Unknown' ? str(row.age, 40) : ''),
  gender: (row) => (row.gender ? str(row.gender, 40) : ''),
  device: (row) => (row.client_app_id != null ? str(String(row.client_app_id), 40) : ''),
  network: (row) =>
    typeof row.is_in_network === 'boolean' ? (row.is_in_network ? 'inNetwork' : 'outNetwork') : ''
};

function dimensionTotals(rows, dimensions) {
  const totals = Object.fromEntries(Object.keys(dimensions).map((name) => [name, {}]));
  for (const row of list(rows)) {
    const metric = ENGAGEMENT_TYPES[row?.engagement_type];
    if (!metric) continue;
    for (const [name, read] of Object.entries(dimensions)) {
      const value = read(row);
      if (!value || RESERVED.has(value)) continue;
      const bucket = (totals[name][value] ||= {});
      addMetric(bucket, metric, row.count);
    }
  }
  return totals;
}

function parseAudience(user) {
  const totals = dimensionTotals(user.uec_metrics_daily_time_series_count, AUDIENCE_DIMENSIONS);
  const { country } = dimensionTotals(user.uec_country_metrics_daily_time_series_count, {
    country: (row) => (row.country && row.country !== 'Other' ? str(row.country, 60) : '')
  });
  return {
    audience: { ...totals, country },
    heatmap: organicSeries(user.organic_metrics_time_series, hourKey)
  };
}

// Leading @mentions (before the visible text) name who a reply answers; the
// first one is the author being replied to.
function replyTarget(tweet) {
  if (!tweet.reply_to_results?.rest_id) return null;
  const start = list(tweet.details?.display_text_range, 2)[0];
  const mentions = list(tweet.mention_entities, 50).filter((m) => typeof m?.screen_name === 'string');
  const leading = Number.isFinite(start)
    ? mentions.filter((m) => list(m.indices, 2)[0] < start)
    : mentions;
  const target = leading[0] || null;
  return {
    tweetId: str(tweet.reply_to_results.rest_id, 25),
    handle: target ? str(target.screen_name, 15).toLowerCase() : '',
    userId: target ? str(target.id_str, 25) : ''
  };
}

// Some rows arrive wrapped as TweetWithVisibilityResults { tweet }.
const unwrapTweet = (result) => (result?.__typename === 'TweetWithVisibilityResults' && result.tweet ? result.tweet : result);

function parsePost(item) {
  const tweet = unwrapTweet(item?.result);
  const id = str(tweet?.rest_id || item?.rest_id, 25);
  if (!/^\d+$/.test(id)) return null;
  const createdAt = toMs(tweet?.details?.created_at_ms);
  if (createdAt === null) return null;
  const replyTo = replyTarget(tweet);
  const media = list(tweet.media_entities2, 10)
    .map((m) => str(m?.type, 20))
    .filter(Boolean);
  return {
    id,
    createdAt,
    text: str(tweet.details?.full_text, MAX_TEXT),
    kind: replyTo ? 'reply' : tweet.community_results?.rest_id ? 'community' : 'post',
    replyTo,
    hashtags: list(tweet.details?.hashtag_entities, 20)
      .map((h) => str(h?.text, 60))
      .filter(Boolean),
    links: list(tweet.url_entities, 20).length,
    media,
    metrics: organicTotals(tweet.organic_metrics_total)
  };
}

// Why rows were not read, by type name and missing field (diagnostics; no values).
function droppedRows(rows) {
  const reasons = {};
  for (const item of rows) {
    const tweet = unwrapTweet(item?.result);
    let reason = '';
    if (!tweet) reason = 'no result';
    else if (tweet.__typename && tweet.__typename !== 'Tweet')
      reason = `type ${str(String(tweet.__typename), 40)} (${Object.keys(tweet).sort().join(' ').slice(0, 120)})`;
    else if (!/^\d+$/.test(str(tweet.rest_id || item?.rest_id, 25))) reason = 'no id';
    else if (toMs(tweet.details?.created_at_ms) === null) reason = 'no time';
    if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
  }
  return reasons;
}

function parseContent(user) {
  const rows = list(user.tweets_results, MAX_POSTS);
  return {
    posts: rows.map(parsePost).filter(Boolean),
    dropped: droppedRows(rows),
    rowCount: rows.length, // before unreadable rows are dropped; compared with X's page limit
    profile: {
      handle: str(user.core?.screen_name, 15),
      name: str(user.core?.name, 100),
      avatar: str(user.avatar?.image_url, 500)
    }
  };
}

const MAX_MENTIONS = 300;
const MAX_DEPTH = 40;

// The author of a tweet sits somewhere under tweet.core (X has moved the
// handle between user.core and user.legacy); take the first handle found.
function authorHandle(tweet) {
  const stack = [[tweet.core, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > 8) continue;
    const handle = node.core?.screen_name ?? node.legacy?.screen_name ?? node.screen_name;
    if (typeof handle === 'string' && /^\w{1,15}$/.test(handle)) return handle.toLowerCase();
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push([value, depth + 1]);
  }
  return '';
}

function tweetTime(tweet) {
  return toMs(tweet.details?.created_at_ms) ?? toMs(tweet.legacy?.created_at);
}

// Nested tweets that are not themselves replies to or mentions of the user.
const SKIP_KEYS = new Set(['quoted_status_result', 'retweeted_status_result', 'quotedRefResult']);

// Mentions timeline (a generic timeline): every top-level tweet in it is a
// reply to or mention of the user. Only author, time and kind are kept.
function parseMentions(body) {
  const found = new Map();
  const stack = [[body?.data, 0]];
  while (stack.length && found.size < MAX_MENTIONS) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) continue;
    if (node.__typename === 'Tweet' && /^\d{1,25}$/.test(String(node.rest_id || ''))) {
      const handle = authorHandle(node);
      const createdAt = tweetTime(node);
      if (handle && createdAt !== null && !found.has(node.rest_id)) {
        const isReply = Boolean(node.reply_to_results?.rest_id || node.legacy?.in_reply_to_status_id_str);
        found.set(String(node.rest_id), { id: String(node.rest_id), handle, createdAt, kind: isReply ? 'reply' : 'mention' });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && !SKIP_KEYS.has(key)) stack.push([value, depth + 1]);
    }
  }
  return { mentions: [...found.values()] };
}

const PARSERS = {
  [OPERATIONS.overviewDaily]: parseOverviewDaily,
  [OPERATIONS.overviewHourly]: parseOverviewHourly,
  [OPERATIONS.activeFollowers]: (user) => ({ account: followerInfo(user) }),
  [OPERATIONS.audience]: parseAudience,
  [OPERATIONS.content]: parseContent
};

// Returns { operation, accountId, ...parsed } or throws when the response is
// not something XTOC understands (X changed the page, or an error response).
// A single post's analytics page: hourly series or audience for that post.
function parsePostDetail(operation, body) {
  const item = body?.data?.tweet_result_by_rest_id;
  const tweet = unwrapTweet(item?.result);
  const postId = str(tweet?.rest_id || item?.rest_id, 25);
  if (!tweet || !/^\d+$/.test(postId)) throw new Error('X returned no post analytics.');
  if (operation === OPERATIONS.postAudience) {
    const totals = dimensionTotals(tweet.uec_metrics_daily_time_series_count, AUDIENCE_DIMENSIONS);
    const { country } = dimensionTotals(tweet.uec_country_metrics_daily_time_series_count, {
      country: (row) => (row.country && row.country !== 'Other' && !RESERVED.has(row.country) ? str(row.country, 60) : '')
    });
    return { operation, accountId: '', postId, audience: { ...totals, country } };
  }
  return { operation, accountId: '', postId, series: organicSeries(tweet.organic_metrics_time_series, hourKey) };
}

export function parseCapture(operation, body) {
  if (POST_DETAIL_OPERATIONS.has(operation)) return parsePostDetail(operation, body);
  if (MENTION_OPERATIONS.has(operation)) {
    // The legacy timeline has no viewer block; the account comes from the tab.
    if (!body?.data || typeof body.data !== 'object') throw new Error('X returned no mentions data.');
    const user = viewerUser(body);
    return { operation: OPERATIONS.mentions, accountId: user ? accountId(user) : '', ...parseMentions(body) };
  }
  const parse = PARSERS[operation];
  if (!parse) throw new Error('Unsupported analytics operation.');
  const user = viewerUser(body);
  if (!user || (user.__typename && user.__typename !== 'User'))
    throw new Error('X returned no analytics data.');
  return { operation, accountId: accountId(user), ...parse(user) };
}
