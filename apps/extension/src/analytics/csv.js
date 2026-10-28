// Fallback import of X Analytics CSV exports (account overview and content),
// for when the page capture stops working. Column names follow X's exports;
// content dates have no time of day, so those posts are marked dayOnly.
const MAX_TEXT = 1000;
const MAX_ROWS = 5000;
const NO_ROWS = 'No rows could be read. XTOC reads X’s English-format dates such as “Sat, Oct 24, 2026”.';

// RFC 4180-style rows: quoted fields, "" escapes, newlines inside quotes.
export function parseCsvRows(text) {
  const source = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('The CSV file has an unclosed quote; export it from X again.');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const COLUMNS = {
  Impressions: 'Impressions',
  Likes: 'Likes',
  Engagements: 'Engagements',
  Bookmarks: 'Bookmarks',
  Shares: 'Shares',
  'New follows': 'Follows',
  Unfollows: 'Unfollows',
  Replies: 'Replies',
  Reposts: 'Reposts',
  'Profile visits': 'ProfileVisits',
  'Create Post': 'Posts',
  'Detail Expands': 'DetailExpands',
  'URL Clicks': 'UrlClicks',
  'Hashtag Clicks': 'HashtagClicks',
  'Permalink Clicks': 'PermalinkClicks'
};

const num = (value) => {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

// "Sat, Oct 24, 2026" (X's English export) or ISO dates, as UTC midnight.
function utcDay(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const ms = iso ? Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) : Date.parse(`${text.replace(/^\w{3},\s*/, '')} 00:00:00 UTC`);
  return Number.isFinite(ms) ? ms : null;
}

function metricsOf(record) {
  const metrics = {};
  for (const [column, name] of Object.entries(COLUMNS)) if (column in record) metrics[name] = num(record[column]);
  return metrics;
}

function replyTarget(text) {
  const handle = String(text).match(/^@(\w{1,15})\b/)?.[1];
  return handle ? { tweetId: '', handle: handle.toLowerCase(), userId: '' } : null;
}

export function parseAnalyticsCsv(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!rows.length) throw new Error('The CSV file is empty.');
  const header = rows[0].map((cell) => cell.trim());
  const records = rows.slice(1, MAX_ROWS + 1).map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
  if (header.includes('Post id') && header.includes('Post Link') && header.includes('Impressions')) {
    const posts = records
      .map((record) => {
        const id = String(record['Post id']).trim();
        const createdAt = utcDay(record.Date);
        if (!/^\d{1,25}$/.test(id) || createdAt === null) return null;
        const body = String(record['Post text'] || '').slice(0, MAX_TEXT);
        const replyTo = replyTarget(body);
        return {
          id,
          createdAt,
          dayOnly: true,
          text: body,
          kind: replyTo ? 'reply' : 'post',
          replyTo,
          hashtags: [],
          links: (body.match(/https?:\/\/\S+/g) || []).length,
          media: [],
          metrics: metricsOf(record)
        };
      })
      .filter(Boolean);
    if (!posts.length) throw new Error(NO_ROWS);
    const handle = records.map((r) => String(r['Post Link']).match(/^https:\/\/(?:x|twitter)\.com\/(\w{1,15})\/status\//)?.[1]).find(Boolean) || '';
    return { kind: 'content', posts, profile: { handle, name: '', avatar: '' } };
  }
  if (header[0] === 'Date' && header.includes('Impressions') && header.includes('Unfollows')) {
    const days = {};
    for (const record of records) {
      const ms = utcDay(record.Date);
      if (ms !== null) days[new Date(ms).toISOString().slice(0, 10)] = metricsOf(record);
    }
    if (!Object.keys(days).length) throw new Error(NO_ROWS);
    return { kind: 'overview', days };
  }
  throw new Error('This is not an X Analytics export (account overview or content CSV).');
}
