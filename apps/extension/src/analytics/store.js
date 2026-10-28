// Analytics storage: pure reducers that merge parsed captures into one local
// record per X account. Newer captures win for the same day, hour or post,
// because X keeps updating recent numbers. Inputs are never mutated.
import { OPERATIONS } from './operations.js';
import { dayKey } from './parse.js';

export const ANALYTICS_KEYS = {
  data: 'xtocAnalytics',
  prefs: 'xtocAnalyticsPrefs', // { autoSync }
  sync: 'xtocAnalyticsSync' // last sync status
};

const VERSION = 1;
const HOURLY_KEEP_DAYS = 60;
const HEATMAP_KEEP_DAYS = 35;
const MAX_SNAPSHOTS = 40;
const MAX_ACCOUNTS = 10;
const MAX_INBOUND = 3000;
const MAX_POST_DETAILS = 200;
const MAX_POSTS_PER_ACCOUNT = 10000;
const DAY_MS = 86400000;
const RESERVED = ['__proto__', 'constructor', 'prototype'];

export const emptyAnalytics = () => ({ version: VERSION, accounts: {} });

const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const validAccountId = (id) => typeof id === 'string' && /^\d{1,25}$/.test(id);

// Storage may hold an older or damaged value; keep only well-formed accounts.
export function readAnalytics(raw) {
  if (!plainObject(raw) || raw.version !== VERSION || !plainObject(raw.accounts)) return emptyAnalytics();
  const accounts = Object.fromEntries(
    Object.entries(raw.accounts).filter(([id, account]) => validAccountId(id) && plainObject(account))
  );
  return { version: VERSION, accounts };
}

const keepRecent = (map, keepDays, now, keyMs) =>
  Object.fromEntries(
    Object.entries(map).filter(([key]) => {
      const ms = keyMs(key);
      return Number.isFinite(ms) && now - ms <= keepDays * DAY_MS;
    })
  );

const hourMs = (key) => Date.parse(`${key}:00:00Z`);

function mergeBuckets(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const [key, values] of Object.entries(incoming)) {
    if (RESERVED.includes(key)) continue;
    merged[key] = { ...current[key], ...values };
  }
  return merged;
}

// Snapshots record how a post's numbers grew between syncs:
// [capturedAt, impressions, engagements, follows, profileVisits].
function addSnapshot(snapshots = [], metrics, at) {
  const row = [at, metrics.Impressions || 0, metrics.Engagements || 0, metrics.Follows || 0, metrics.ProfileVisits || 0];
  const last = snapshots.at(-1);
  if (last && last.slice(1).every((value, i) => value === row[i + 1])) return snapshots;
  const next = [...snapshots, row];
  if (next.length <= MAX_SNAPSHOTS) return next;
  // Thin the middle, keep the first and the most recent ones.
  return [next[0], ...next.slice(1, -10).filter((_, i) => i % 2 === 1), ...next.slice(-10)];
}

// Keeps the newest posts when an account exceeds the cap.
function capPosts(posts) {
  const list = Object.values(posts);
  if (list.length <= MAX_POSTS_PER_ACCOUNT) return posts;
  const kept = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_POSTS_PER_ACCOUNT);
  return Object.fromEntries(kept.map((post) => [post.id, post]));
}

function mergePosts(current = {}, posts, now) {
  const merged = { ...current };
  for (const post of posts) {
    const previous = current[post.id];
    merged[post.id] = {
      ...post,
      firstSeenAt: previous?.firstSeenAt || now,
      updatedAt: now,
      snapshots: addSnapshot(previous?.snapshots, post.metrics, now)
    };
  }
  return merged;
}

// Replies and mentions by others, newest kept; the author's own tweets are skipped.
function mergeInbound(current = {}, mentions, ownHandle) {
  const own = (ownHandle || '').toLowerCase();
  const merged = { ...current };
  for (const item of mentions) if (item.handle !== own) merged[item.id] = item;
  const list = Object.values(merged);
  if (list.length <= MAX_INBOUND) return merged;
  return Object.fromEntries(list.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_INBOUND).map((item) => [item.id, item]));
}

// Per-post details from a post's analytics page; the most recent 200 posts kept.
const DETAIL_FIELD = { postDetailsProviderFirst48HoursDataQuery: 'first48', postDetailsProviderLast48HoursOrganicDataQuery: 'last48', postDetailsProviderAudienceQuery: 'audience' };

function mergePostDetail(current = {}, parsed, now) {
  const field = DETAIL_FIELD[parsed.operation];
  const value = parsed.operation === OPERATIONS.postAudience ? parsed.audience : parsed.series;
  const merged = { ...current, [parsed.postId]: { ...current[parsed.postId], [field]: value, capturedAt: now } };
  const entries = Object.entries(merged);
  if (entries.length <= MAX_POST_DETAILS) return merged;
  return Object.fromEntries(entries.sort((a, b) => b[1].capturedAt - a[1].capturedAt).slice(0, MAX_POST_DETAILS));
}

function mergeFollowers(current = {}, info, now) {
  if (info.followers === undefined) return current;
  const day = dayKey(now);
  return {
    ...current,
    [day]: { followers: info.followers, ...(info.verifiedFollowers !== undefined && { verifiedFollowers: info.verifiedFollowers }) }
  };
}

function applyToAccount(account, parsed, now) {
  const next = { ...account, id: account.id, updatedAt: now };
  if (parsed.account && Object.keys(parsed.account).length) {
    next.info = { ...account.info, ...parsed.account, capturedAt: now };
    next.followers = mergeFollowers(account.followers, parsed.account, now);
  }
  switch (parsed.operation) {
    case OPERATIONS.overviewDaily:
      next.daily = mergeBuckets(account.daily, parsed.days);
      break;
    case OPERATIONS.overviewHourly:
      next.hourly = keepRecent(mergeBuckets(account.hourly, parsed.hours), HOURLY_KEEP_DAYS, now, hourMs);
      break;
    case OPERATIONS.audience:
      // X's audience page can send several queries with different dimensions;
      // keep each dimension from the latest capture that has data for it.
      next.audience = {
        ...account.audience,
        ...Object.fromEntries(Object.entries(parsed.audience).filter(([, groups]) => Object.keys(groups || {}).length)),
        capturedAt: now
      };
      next.heatmap = keepRecent(mergeBuckets(account.heatmap, parsed.heatmap), HEATMAP_KEEP_DAYS, now, hourMs);
      break;
    case OPERATIONS.content:
      next.posts = capPosts(mergePosts(account.posts, parsed.posts, now));
      if (parsed.profile?.handle) {
        next.handle = parsed.profile.handle;
        next.name = parsed.profile.name;
        next.avatar = parsed.profile.avatar;
      }
      break;
    case OPERATIONS.postFirst48:
    case OPERATIONS.postLast48:
    case OPERATIONS.postAudience:
      next.postDetails = mergePostDetail(account.postDetails, parsed, now);
      break;
    case OPERATIONS.mentions:
      next.inbound = mergeInbound(account.inbound, parsed.mentions, account.handle);
      break;
    default:
      break;
  }
  return next;
}

// accountHint is the account seen earlier in the same tab, for responses that
// do not carry an ID of their own.
export function applyCapture(state, parsed, { now = Date.now(), accountHint = '' } = {}) {
  const id = parsed.accountId || accountHint;
  if (!validAccountId(id)) throw new Error('Could not tell which X account this data belongs to.');
  if (!state.accounts[id] && Object.keys(state.accounts).length >= MAX_ACCOUNTS)
    throw new Error('XTOC keeps analytics for up to 10 X accounts. Delete one in Analytics first.');
  const current = state.accounts[id] || { id };
  return {
    ...state,
    accounts: { ...state.accounts, [id]: applyToAccount(current, parsed, now) }
  };
}

export const accountList = (state) =>
  Object.values(state.accounts).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
