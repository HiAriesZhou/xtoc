import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsOperation,
  autoSyncDue,
  contentRanges,
  graphqlOperationName,
  isDiagnosticPath,
  isAnalyticsPage,
  isCapturePage,
  isPremiumRedirect,
  olderContentStep,
  syncSteps
} from '../src/analytics/operations.js';
import { parseCapture, restIdFromGlobal, toMs } from '../src/analytics/parse.js';
import { ACCOUNT_ID, GLOBAL_ID, audience, content, day0, mentions, overviewDaily, overviewHourly, tweet } from './analytics-fixtures.js';

test('analyticsOperation recognizes only X analytics GraphQL operations', () => {
  assert.equal(analyticsOperation('https://api.x.com/graphql/abc-1/contentPageQuery?variables=1'), 'contentPageQuery');
  assert.equal(analyticsOperation('https://x.com/i/api/graphql/Q/accountOverviewDailyQuery'), 'accountOverviewDailyQuery');
  assert.equal(analyticsOperation('/i/api/graphql/Q/audienceOverviewDataQuery'), 'audienceOverviewDataQuery');
  assert.equal(analyticsOperation('https://api.x.com/graphql/Q/HomeTimeline'), null);
  assert.equal(analyticsOperation('https://evil.example/graphql/Q/contentPageQuery'), null);
  assert.equal(analyticsOperation('http://x.com/i/api/graphql/Q/contentPageQuery'), null);
  assert.equal(analyticsOperation('not a url %%'), null);
});

test('contentRanges backfill 12 weeks in windows of at most 28 days, then only what is new', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.deepEqual(contentRanges(null, now), [
    { from: '2026-09-29', to: '2026-10-26' },
    { from: '2026-09-01', to: '2026-09-28' },
    { from: '2026-08-04', to: '2026-08-31' }
  ]);
  assert.deepEqual(contentRanges('2026-10-24T08:00:00Z', now), [{ from: '2026-10-22', to: '2026-10-26' }]);
  assert.equal(contentRanges('2020-01-01T00:00:00Z', now).length, 3);
});

test('syncSteps visit content, audience and overview with their expected operations', () => {
  const steps = syncSteps(null, Date.parse('2026-10-26T12:00:00Z'));
  assert.deepEqual(steps.map((s) => s.expect), ['contentPageQuery', 'contentPageQuery', 'contentPageQuery', 'audienceOverviewDataQuery', 'accountOverviewDailyQuery', 'NotificationsTimeline']);
  assert.deepEqual(steps.map((s) => s.id), ['content', 'content-2', 'content-3', 'audience', 'overview', 'mentions']);
  assert.deepEqual(steps.map((s) => Boolean(s.optional)), [false, false, false, false, false, true]);
  assert.equal(syncSteps('2026-10-25T12:00:00Z', Date.parse('2026-10-26T12:00:00Z')).length, 4);
  assert.match(steps[0].url, /^https:\/\/x\.com\/i\/account_analytics\/content\/\?type=all&from=2026-09-29&to=2026-10-26$/);
  assert.deepEqual(steps[0].range, { from: '2026-09-29', to: '2026-10-26' });
});

test('olderContentStep continues below the oldest captured post, and stops at the range start', () => {
  const range = { from: '2026-01-01', to: '2026-10-26' };
  const step = olderContentStep(range, Date.parse('2026-06-15T10:00:00Z'));
  assert.equal(step.url, 'https://x.com/i/account_analytics/content/?type=all&from=2026-01-01&to=2026-06-15');
  assert.equal(step.id, 'content-older-1');
  assert.equal(olderContentStep(range, Date.parse('2026-06-15T10:00:00Z'), 2).id, 'content-older-2');
  assert.equal(olderContentStep(range, Date.parse('2026-01-01T10:00:00Z')), null);
});

test('autoSyncDue requires opt-in and waits about a day between attempts', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(autoSyncDue({ autoSync: false }, now), false);
  assert.equal(autoSyncDue({ autoSync: true }, now), true);
  assert.equal(autoSyncDue({ autoSync: true, lastAttemptAt: '2026-10-26T01:00:00Z' }, now), false);
  assert.equal(autoSyncDue({ autoSync: true, lastAttemptAt: '2026-10-25T10:00:00Z' }, now), true);
});

test('isPremiumRedirect detects the Premium and login redirects', () => {
  assert.equal(isPremiumRedirect('https://x.com/i/premium_sign_up'), true);
  assert.equal(isPremiumRedirect('https://x.com/i/jf/onboarding/web?redirect_after_login=x'), true);
  assert.equal(isPremiumRedirect('https://x.com/i/account_analytics'), false);
});

test('toMs and restIdFromGlobal accept the formats X uses', () => {
  assert.equal(toMs('1761000000000'), 1761000000000);
  assert.equal(toMs('2026-10-20T00:00:00Z'), day0);
  assert.equal(toMs(''), null);
  assert.equal(restIdFromGlobal(GLOBAL_ID), ACCOUNT_ID);
  assert.equal(restIdFromGlobal(btoa('Tweet:1')), '');
});

test('overview daily: maps engagement types, sums engagements, takes follows from organic series', () => {
  const parsed = parseCapture('accountOverviewDailyQuery', overviewDaily({ days: 2 }));
  assert.equal(parsed.accountId, ACCOUNT_ID);
  const first = parsed.days['2026-10-20'];
  assert.equal(first.Impressions, 1000);
  assert.equal(first.Likes, 40);
  assert.equal(first.Engagements, 40 + 5 + 20);
  assert.equal(first.VerifiedEngagements, 10);
  assert.equal(first.Follows, 4);
  assert.equal(first.Unfollows, 1);
  assert.equal(first.Posts, 2);
  assert.equal(first.Unknown, undefined);
  assert.equal(parsed.days['2026-10-21'].Impressions, 2000);
  assert.deepEqual(parsed.account, {
    followers: 500,
    verifiedFollowers: 12,
    activeFollowers: 300,
    realtimeActive: 42,
    realtimeApproximate: true
  });
});

test('overview hourly buckets by UTC hour', () => {
  const parsed = parseCapture('accountOverviewHourlyQuery', overviewHourly({ hours: 2 }));
  assert.deepEqual(Object.keys(parsed.hours), ['2026-10-20T00', '2026-10-20T01']);
  assert.equal(parsed.hours['2026-10-20T01'].Impressions, 101);
});

test('audience splits dimensions, drops Unknown/Other, keeps the hourly heatmap', () => {
  const parsed = parseCapture('audienceOverviewDataQuery', audience());
  assert.deepEqual(parsed.audience.age, { Age25to34: { Impressions: 600 } });
  assert.deepEqual(parsed.audience.gender, { Male: { Impressions: 700 } });
  assert.deepEqual(parsed.audience.network, { outNetwork: { Impressions: 800 } });
  assert.deepEqual(parsed.audience.device, { 3033300: { Likes: 50 } });
  assert.deepEqual(parsed.audience.country, { JP: { Impressions: 300 } });
  assert.equal(parsed.heatmap['2026-10-20T00'].Impressions, 77);
});

test('content: posts, replies with their target, media, links and metrics', () => {
  const parsed = parseCapture(
    'contentPageQuery',
    content([
      tweet({ id: '1', createdAt: day0, media: ['photo'], links: 1 }),
      tweet({ id: '2', createdAt: day0 + 1000, reply: 'SomeOne', impressions: 50 }),
      { rest_id: 'bad', result: {} },
      { rest_id: '3', result: { __typename: 'Tweet', rest_id: '3', details: {} } }
    ])
  );
  assert.equal(parsed.accountId, ACCOUNT_ID);
  assert.deepEqual(parsed.profile, { handle: 'example', name: 'Example', avatar: 'https://pbs.twimg.com/profile_images/x.jpg' });
  assert.equal(parsed.posts.length, 2);
  const [post, reply] = parsed.posts;
  assert.equal(post.kind, 'post');
  assert.deepEqual(post.media, ['photo']);
  assert.equal(post.links, 1);
  assert.deepEqual(post.hashtags, ['xtoc']);
  assert.deepEqual(post.metrics, { Impressions: 100, Engagements: 10, Follows: 1, ProfileVisits: 3, Reposts: 2, Bookmarks: 1 });
  assert.equal(reply.kind, 'reply');
  assert.deepEqual(reply.replyTo, { tweetId: '92', handle: 'someone', userId: '42' });
});

test('audience dimension values cannot pollute object prototypes', () => {
  const body = audience();
  body.data.viewer_v2.user_results.result.uec_metrics_daily_time_series_count.push(
    { engagement_type: 'Displayed', count: 5, gender: '__proto__', timestamp: '0' },
    { engagement_type: 'Displayed', count: 5, country: 'constructor', timestamp: '0' }
  );
  const parsed = parseCapture('audienceOverviewDataQuery', body);
  assert.equal({}.Impressions, undefined);
  assert.deepEqual(Object.keys(parsed.audience.gender), ['Male']);
});

test('content reports the raw row count used against the 1000-post page limit', () => {
  const parsed = parseCapture('contentPageQuery', content([tweet({ id: '1', createdAt: day0 }), { rest_id: 'bad', result: {} }]));
  assert.equal(parsed.posts.length, 1);
  assert.equal(parsed.rowCount, 2);
});

test('isAnalyticsPage accepts only X analytics pages', () => {
  assert.equal(isAnalyticsPage('https://x.com/i/account_analytics'), true);
  assert.equal(isAnalyticsPage('https://x.com/i/account_analytics/content/?type=all'), true);
  assert.equal(isAnalyticsPage('https://x.com/i/account_analyticsX'), false);
  assert.equal(isAnalyticsPage('https://x.com/home'), false);
  assert.equal(isAnalyticsPage('https://evil.test/i/account_analytics'), false);
});

test('parseCapture rejects unknown operations and empty responses', () => {
  assert.throws(() => parseCapture('HomeTimeline', {}), /Unsupported/);
  assert.throws(() => parseCapture('contentPageQuery', { errors: [{ message: 'x' }] }), /no analytics/);
  assert.throws(() => parseCapture('contentPageQuery', { data: { viewer_v2: { user_results: { result: { __typename: 'UserUnavailable' } } } } }), /no analytics/);
});

test('mentions: every tweet in the timeline with an author and time, without text', () => {
  const parsed = parseCapture('notificationsQuery', mentions());
  assert.equal(parsed.accountId, ACCOUNT_ID);
  assert.deepEqual(parsed.mentions, [
    { id: '503', handle: 'example', createdAt: day0, kind: 'mention' },
    { id: '502', handle: 'bob', createdAt: day0 + 3600000, kind: 'mention' },
    { id: '501', handle: 'alice', createdAt: Date.parse('2026-10-20T10:00:00Z'), kind: 'reply' }
  ]);
});

test('isCapturePage keeps the notifications operation to the Mentions page', () => {
  assert.equal(isCapturePage('https://x.com/notifications/mentions', 'notificationsQuery'), true);
  assert.equal(isCapturePage('https://x.com/notifications', 'notificationsQuery'), false);
  assert.equal(isCapturePage('https://x.com/i/account_analytics', 'notificationsQuery'), false);
  assert.equal(isCapturePage('https://x.com/i/account_analytics', 'contentPageQuery'), true);
});

test('graphqlOperationName and isDiagnosticPath', () => {
  assert.equal(graphqlOperationName('https://api.x.com/graphql/q1/notificationsQuery?v=1'), 'notificationsQuery');
  assert.equal(graphqlOperationName('https://evil.test/graphql/q1/x'), null);
  assert.equal(isDiagnosticPath('/notifications/mentions'), true);
  assert.equal(isDiagnosticPath('/i/account_analytics/content/'), true);
  assert.equal(isDiagnosticPath('/home'), false);
});

test('legacy NotificationsTimeline: tweets anywhere under data, quoted tweets skipped, no account ID', () => {
  const tweet = (id, handle, extra = {}) => ({
    __typename: 'Tweet',
    rest_id: id,
    core: { user_results: { result: { __typename: 'User', legacy: { screen_name: handle } } } },
    legacy: { created_at: 'Tue Oct 28 08:00:00 +0000 2026', ...extra }
  });
  const body = {
    data: {
      viewer: {
        timeline: {
          timeline: {
            instructions: [
              {
                entries: [
                  { content: { itemContent: { tweet_results: { result: { ...tweet('701', 'Dana', { in_reply_to_status_id_str: '9' }), quoted_status_result: { result: tweet('702', 'quoted_person') } } } } } },
                  { content: { itemContent: { tweet_results: { result: tweet('703', 'erin') } } } }
                ]
              }
            ]
          }
        }
      }
    }
  };
  const parsed = parseCapture('NotificationsTimeline', body);
  assert.equal(parsed.operation, 'NotificationsTimeline');
  assert.equal(parsed.accountId, '');
  assert.deepEqual(parsed.mentions.map((m) => [m.id, m.handle, m.kind]).sort(), [['701', 'dana', 'reply'], ['703', 'erin', 'mention']]);
  assert.throws(() => parseCapture('NotificationsTimeline', { errors: [] }), /no mentions data/);
});

test('content rows wrapped in TweetWithVisibilityResults are read', () => {
  const wrapped = tweet({ id: '7', createdAt: day0, impressions: 6500 });
  const row = { rest_id: '7', result: { __typename: 'TweetWithVisibilityResults', tweet: { ...wrapped.result, __typename: undefined } } };
  const parsed = parseCapture('contentPageQuery', content([row]));
  assert.equal(parsed.posts.length, 1);
  assert.equal(parsed.posts[0].metrics.Impressions, 6500);
  assert.deepEqual(parsed.dropped, {});
});
