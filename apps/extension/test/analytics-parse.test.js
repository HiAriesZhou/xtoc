import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsOperation,
  autoSyncDue,
  graphqlOperationName,
  isDiagnosticPath,
  isAnalyticsPage,
  isCapturePage,
  isPremiumRedirect
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

test('request metadata copies only dates, with bounded malformed input handling', async () => {
  const { analyticsRequestRange } = await import('../src/analytics/operations.js');
  const url = 'https://x.com/i/api/graphql/query/accountOverviewDailyQuery?variables=' + encodeURIComponent(JSON.stringify({ from: '2026-10-19', to: '2026-11-15', private: 'not forwarded' }));
  assert.deepEqual(analyticsRequestRange(url), { from: '2026-10-19', to: '2026-11-15' });
  assert.deepEqual(analyticsRequestRange('https://x.com/', JSON.stringify({ variables: { start_time: 1792368000000, end_time: 1794700800000 } })), { from: '2026-10-19', to: '2026-11-15' });
  assert.equal(analyticsRequestRange('invalid', 'not json'), null);
});
