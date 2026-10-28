// Synthetic X analytics responses shaped like the Relay queries in X's web
// client. All values are invented; no real account data.
export const ACCOUNT_ID = '1234567890';
export const GLOBAL_ID = btoa(`User:${ACCOUNT_ID}`);
const DAY = 86400000;

export const day0 = Date.parse('2026-10-20T00:00:00Z');

const viewer = (result) => ({ data: { viewer_v2: { user_results: { result: { __typename: 'User', ...result } } } } });

const uec = (ms, type, count, verified) => ({
  timestamp: String(ms),
  engagement_type: type,
  count,
  ...(verified !== undefined && { is_engaging_user_verified: verified })
});

export function overviewDaily({ days = 3, start = day0 } = {}) {
  const rows = [];
  const follows = [];
  for (let i = 0; i < days; i++) {
    const ms = start + i * DAY;
    rows.push(uec(ms, 'Displayed', 1000 * (i + 1), false));
    rows.push(uec(ms, 'Fav', 30, false), uec(ms, 'Fav', 10, true));
    rows.push(uec(ms, 'Reply', 5, false), uec(ms, 'ProfilePic', 20, false));
    rows.push(uec(ms, 'TweetCreate', 2, false), uec(ms, 'Unknown', 99, false));
    follows.push({
      timestamp: { iso8601_time: new Date(ms).toISOString() },
      metric_values: [
        { metric_type: 'Follows', metric_value: 4 },
        { metric_type: 'Unfollows', metric_value: 1 }
      ]
    });
  }
  return viewer({
    id: GLOBAL_ID,
    verified_follower_count: 12,
    relationship_counts: { followers: 500 },
    author_follower_metrics: { active_followers: 300, active_verified_followers: 9 },
    realtime_active_followers: { active_count: 42, is_approximate: true },
    current_time_series: rows,
    legacy_current_follow_metrics: follows
  });
}

export function overviewHourly({ hours = 3, start = day0 } = {}) {
  return viewer({
    id: GLOBAL_ID,
    relationship_counts: { followers: 501 },
    current_time_series: Array.from({ length: hours }, (_, i) => uec(start + i * 3600000, 'Displayed', 100 + i))
  });
}

export function audience() {
  return viewer({
    id: GLOBAL_ID,
    uec_metrics_daily_time_series_count: [
      { engagement_type: 'Displayed', count: 600, age: 'Age25to34', timestamp: '0' },
      { engagement_type: 'Displayed', count: 400, age: 'Unknown', timestamp: '0' },
      { engagement_type: 'Displayed', count: 700, gender: 'Male', timestamp: '0' },
      { engagement_type: 'Displayed', count: 800, is_in_network: false, timestamp: '0' },
      { engagement_type: 'Fav', count: 50, client_app_id: 3033300, timestamp: '0' }
    ],
    uec_country_metrics_daily_time_series_count: [
      { country: 'JP', engagement_type: 'Displayed', count: 300, timestamp: '0' },
      { country: 'Other', engagement_type: 'Displayed', count: 10, timestamp: '0' }
    ],
    organic_metrics_time_series: [
      {
        timestamp: { iso8601_time: new Date(day0).toISOString() },
        metric_values: [{ metric_type: 'Impressions', metric_value: 77 }]
      }
    ]
  });
}

const metric = (metric_type, metric_value) => ({ metric_type, metric_value });

export function tweet({ id, createdAt, text = 'hello world', impressions = 100, follows = 1, reply, media = [], links = 0 }) {
  const mentions = reply ? [{ screen_name: reply, id_str: '42', indices: [0, reply.length + 1] }] : [];
  const body = reply ? `@${reply} ${text}` : text;
  return {
    rest_id: id,
    result: {
      __typename: 'Tweet',
      rest_id: id,
      details: {
        created_at_ms: String(createdAt),
        full_text: body,
        display_text_range: [reply ? reply.length + 2 : 0, body.length],
        hashtag_entities: [{ text: 'xtoc', indices: [0, 5] }]
      },
      organic_metrics_total: [
        metric('Impressions', impressions),
        metric('Engagements', Math.round(impressions / 10)),
        metric('Follows', follows),
        metric('ProfileVisits', follows * 3),
        metric('Retweets', 2),
        metric('Bookmark', 1)
      ],
      ...(reply && { reply_to_results: { rest_id: `9${id}` } }),
      mention_entities: mentions,
      url_entities: Array.from({ length: links }, () => ({ url: 'https://t.co/x' })),
      media_entities2: media.map((type) => ({ type }))
    }
  };
}

export function content(tweets) {
  return viewer({
    rest_id: ACCOUNT_ID,
    core: { screen_name: 'example', name: 'Example' },
    avatar: { image_url: 'https://pbs.twimg.com/profile_images/x.jpg' },
    tweets_results: tweets
  });
}

const urtTweet = (id, handle, extra) => ({
  entryId: `tweet-${id}`,
  content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: id, core: { user_results: { result: { __typename: 'User', core: { screen_name: handle } } } }, ...extra } } } }
});

// Mentions timeline in X's generic timeline (URT) shape.
export function mentions() {
  return viewer({
    id: GLOBAL_ID,
    notification_timeline: {
      timeline: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [
              urtTweet('501', 'Alice', { legacy: { created_at: 'Mon Oct 20 10:00:00 +0000 2026', in_reply_to_status_id_str: '1' } }),
              urtTweet('502', 'bob', { details: { created_at_ms: String(day0 + 3600000) } }),
              urtTweet('503', 'example', { details: { created_at_ms: String(day0) } }),
              { entryId: 'cursor-bottom', content: { value: 'x' } },
              urtTweet('bad', 'carol', { details: { created_at_ms: String(day0) } })
            ]
          }
        ]
      }
    }
  });
}

// Per-post analytics page responses (tweet_result_by_rest_id, no viewer block).
export function postSeries(id, startMs, hours = 3) {
  return {
    data: {
      tweet_result_by_rest_id: {
        rest_id: id,
        result: {
          __typename: 'Tweet',
          rest_id: id,
          organic_metrics_time_series: Array.from({ length: hours }, (_, i) => ({
            timestamp: { iso8601_time: new Date(startMs + i * 3600000).toISOString() },
            metric_values: [{ metric_type: 'Impressions', metric_value: 10 * (i + 1) }, { metric_type: 'Likes', metric_value: i }]
          }))
        }
      }
    }
  };
}

export function postAudience(id) {
  return {
    data: {
      tweet_result_by_rest_id: {
        rest_id: id,
        result: {
          __typename: 'Tweet',
          rest_id: id,
          uec_metrics_daily_time_series_count: [{ engagement_type: 'Displayed', count: 30, age: 'Age25to34', timestamp: '0' }],
          uec_country_metrics_daily_time_series_count: [{ country: 'JP', engagement_type: 'Displayed', count: 12, timestamp: '0' }]
        }
      }
    }
  };
}
