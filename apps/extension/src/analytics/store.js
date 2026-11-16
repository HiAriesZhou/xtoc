// Analytics storage: pure reducers that merge parsed captures into one local
// record per X account. Newer captures win for the same day, hour or post,
// because X keeps updating recent numbers. Inputs are never mutated.
import { OPERATIONS } from './operations.js';
import { dayKey } from './parse.js';

export const ANALYTICS_KEYS = {
  data: 'xtocAnalytics',
  prefs: 'xtocAnalyticsPrefs', // { autoSync }
  sync: 'xtocAnalyticsSync', // scheduler status and resumable queue
  revision: 'xtocAnalyticsRevision' // IndexedDB invalidation signal
};

const VERSION = 1;
const MAX_ACCOUNTS = 10;
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

// Per metric, the larger value. CSV exports can be older than a sync, and
// X's totals only grow, so an import never lowers a synced number.
function maxMetrics(current = {}, incoming = {}) {
  const out = { ...current };
  for (const [name, value] of Object.entries(incoming)) out[name] = Math.max(current[name] || 0, value);
  return out;
}

function mergeBuckets(current = {}, incoming = {}, keepLarger = false) {
  const merged = { ...current };
  for (const [key, values] of Object.entries(incoming)) {
    if (RESERVED.includes(key)) continue;
    merged[key] = keepLarger ? maxMetrics(current[key], values) : { ...current[key], ...values };
  }
  return merged;
}

// Snapshots record how a post's numbers grew between syncs:
// [capturedAt, impressions, engagements, follows, profileVisits].
function addSnapshot(snapshots = [], metrics, at) {
  const row = [at, metrics.Impressions ?? null, metrics.Engagements ?? null, metrics.Follows ?? null, metrics.ProfileVisits ?? null];
  const last = snapshots.at(-1);
  if (last && last.slice(1).every((value, i) => value === row[i + 1])) return snapshots;
  return [...snapshots, row];
}

function mergePosts(current = {}, posts, now, fromCsv = false) {
  const merged = { ...current };
  for (const post of posts) {
    const previous = current[post.id];
    // A CSV row has only the day and may be older: keep what a capture knew
    // precisely, never lower a metric, and record no growth snapshot.
    const base =
      fromCsv && previous
        ? { ...(previous.dayOnly ? post : previous), metrics: maxMetrics(previous.metrics, post.metrics) }
        : post;
    merged[post.id] = {
      ...base,
      firstSeenAt: previous?.firstSeenAt || now,
      updatedAt: now,
      snapshots: fromCsv ? previous?.snapshots || [] : addSnapshot(previous?.snapshots, base.metrics, now)
    };
  }
  return merged;
}

// Replies and mentions by others, the author's own tweets are skipped.
function mergeInbound(current = {}, mentions, ownHandle) {
  const own = (ownHandle || '').toLowerCase();
  const merged = { ...current };
  for (const item of mentions) if (item.handle !== own) merged[item.id] = item;
  return merged;
}

// Per-post details from a post's analytics page; retained until user deletion.
const DETAIL_FIELD = { postDetailsProviderFirst48HoursDataQuery: 'first48', postDetailsProviderLast48HoursOrganicDataQuery: 'last48', postDetailsProviderAudienceQuery: 'audience' };

function mergePostDetail(current = {}, parsed, now) {
  const field = DETAIL_FIELD[parsed.operation];
  const value = parsed.operation === OPERATIONS.postAudience ? parsed.audience : parsed.series;
  const merged = { ...current, [parsed.postId]: { ...current[parsed.postId], [field]: value, capturedAt: now } };
  return merged;
}

function mergeFollowers(current = {}, info, now) {
  if (info.followers === undefined) return current;
  const day = dayKey(now);
  return {
    ...current,
    [day]: { followers: info.followers, ...(info.verifiedFollowers !== undefined && { verifiedFollowers: info.verifiedFollowers }) }
  };
}

function applyToAccount(account, parsed, now, source) {
  const fromCsv = source === 'csv';
  const next = { ...account, id: account.id, updatedAt: now };
  if (parsed.account && Object.keys(parsed.account).length) {
    next.info = { ...account.info, ...parsed.account, capturedAt: now };
    next.followers = mergeFollowers(account.followers, parsed.account, now);
  }
  switch (parsed.operation) {
    case OPERATIONS.overviewDaily:
      next.daily = mergeBuckets(account.daily, parsed.days, fromCsv);
      break;
    case OPERATIONS.overviewHourly:
      next.hourly = mergeBuckets(account.hourly, parsed.hours);
      break;
    case OPERATIONS.audience:
      // X's audience page can send several queries with different dimensions;
      // keep each dimension from the latest capture that has data for it.
      next.audience = {
        ...account.audience,
        ...Object.fromEntries(Object.entries(parsed.audience).filter(([, groups]) => Object.keys(groups || {}).length)),
        capturedAt: now
      };
      next.heatmap = mergeBuckets(account.heatmap, parsed.heatmap);
      break;
    case OPERATIONS.content:
      next.posts = mergePosts(account.posts, parsed.posts, now, fromCsv);
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
export function applyCapture(state, parsed, { now = Date.now(), accountHint = '', source = 'capture' } = {}) {
  const id = parsed.accountId || accountHint;
  if (!validAccountId(id)) throw new Error('Could not tell which X account this data belongs to.');
  if (!state.accounts[id] && Object.keys(state.accounts).length >= MAX_ACCOUNTS)
    throw new Error('XTOC keeps analytics for up to 10 X accounts. Delete one in Analytics first.');
  const current = state.accounts[id] || { id };
  return {
    ...state,
    accounts: { ...state.accounts, [id]: applyToAccount(current, parsed, now, source) }
  };
}

export const accountList = (state) =>
  Object.values(state.accounts).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
