// Extension-origin IndexedDB. Legacy chrome.storage.local data remains a
// recovery copy until the user explicitly deletes analytics. No cloud storage.
import { ANALYTICS_KEYS, applyCapture, emptyAnalytics, readAnalytics } from './analytics/store.js';

const FIELDS = ['daily', 'hourly', 'heatmap', 'posts', 'inbound', 'postDetails', 'followers'];
const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = () => reject(tx.error || new Error('Analytics transaction was interrupted.'));
  tx.onerror = () => {}; // onabort is the final outcome
});
const metadata = (account) => Object.fromEntries(Object.entries(account).filter(([key]) => !FIELDS.includes(key)));
const timeOf = (kind, id, value) => {
  if (['daily', 'followers'].includes(kind)) return Date.parse(`${id}T00:00:00Z`) || 0;
  if (['hourly', 'heatmap'].includes(kind)) return Date.parse(`${id}:00:00Z`) || 0;
  return value.createdAt || value.capturedAt || 0;
};
const rowsOf = (account) => FIELDS.flatMap(kind => Object.entries(account[kind] || {}).map(([id, value]) =>
  ({ accountId: account.id, kind, id, value, time: timeOf(kind, id, value) })));
const rangeFor = (accountId, kind, since) => IDBKeyRange.bound([accountId, kind, since], [accountId, kind, Number.MAX_SAFE_INTEGER]);

export function createAnalyticsRepository({ storage, indexedDB = globalThis.indexedDB, name = 'xtoc-analytics' }) {
  let opening;
  async function open() {
    if (!opening) opening = (async () => {
      if (!indexedDB) throw new Error('Local analytics database is unavailable.');
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('accounts', { keyPath: 'id' });
        const records = db.createObjectStore('records', { keyPath: ['accountId', 'kind', 'id'] });
        records.createIndex('accountKind', ['accountId', 'kind']);
        records.createIndex('accountTime', ['accountId', 'kind', 'time']);
        db.createObjectStore('meta');
      };
      const db = await request(req);
      db.onversionchange = () => { db.close(); opening = null; };
      return db;
    })().catch(error => { opening = null; throw error; });
    return opening;
  }
  let migrating;
  async function ready() {
    if (!migrating) migrating = migrate().catch(error => { migrating = null; throw error; });
    return migrating;
  }
  async function migrate() {
    const db = await open();
    if (await request(db.transaction('meta').objectStore('meta').get('legacy-v1'))) return db;
    const legacy = readAnalytics((await storage.get(ANALYTICS_KEYS.data))[ANALYTICS_KEYS.data]);
    const tx = db.transaction(['accounts', 'records', 'meta'], 'readwrite');
    const completion = done(tx);
    // Another repository instance can win the migration while storage.get ran.
    if (await request(tx.objectStore('meta').get('legacy-v1'))) { await completion; return db; }
    try {
      for (const account of Object.values(legacy.accounts)) {
        const rows = rowsOf(account);
        for (const row of rows) tx.objectStore('records').put(row);
        const counts = Object.fromEntries(FIELDS.map(kind => [kind, Object.keys(account[kind] || {}).length]));
        tx.objectStore('accounts').put({ ...metadata(account), counts });
        for (const kind of FIELDS) {
          const actual = await request(tx.objectStore('records').index('accountKind').count([account.id, kind]));
          if (actual !== counts[kind]) throw new Error('Analytics migration verification failed; legacy data is intact.');
        }
      }
      tx.objectStore('meta').put({ accounts: Object.keys(legacy.accounts).length, at: Date.now() }, 'legacy-v1');
    } catch (error) { tx.abort(); await completion.catch(() => {}); throw error; }
    await completion;
    return db;
  }
  async function read({ accountId, since = 0 } = {}) {
    const db = await ready();
    const tx = db.transaction(['accounts', 'records']);
    const accounts = accountId
      ? [await request(tx.objectStore('accounts').get(accountId))].filter(Boolean)
      : await request(tx.objectStore('accounts').getAll());
    const state = emptyAnalytics();
    await Promise.all(accounts.map(async meta => {
      const account = { ...meta };
      await Promise.all(FIELDS.map(async kind => {
        const rows = await request(tx.objectStore('records').index('accountTime').getAll(rangeFor(meta.id, kind, since)));
        account[kind] = Object.fromEntries(rows.map(row => [row.id, row.value]));
      }));
      state.accounts[meta.id] = account;
    }));
    return state;
  }
  async function accounts() {
    const db = await ready();
    return request(db.transaction('accounts').objectStore('accounts').getAll());
  }
  async function ownerOf(postId) {
    const db = await ready();
    const tx = db.transaction(['accounts', 'records']);
    for (const account of await request(tx.objectStore('accounts').getAll())) {
      if (await request(tx.objectStore('records').get([account.id, 'posts', postId]))) return account.id;
    }
    return '';
  }
  async function apply(parsed, { accountHint = '', now = Date.now(), source = 'capture' } = {}) {
    const db = await ready();
    const id = parsed.accountId || accountHint;
    if (!/^\d{1,25}$/.test(id)) throw new Error('Could not tell which X account this data belongs to.');
    const tx = db.transaction(['accounts', 'records'], 'readwrite');
    const completion = done(tx);
    try {
      const existing = await request(tx.objectStore('accounts').get(id));
      if (!existing && await request(tx.objectStore('accounts').count()) >= 10) throw new Error('XTOC keeps analytics for up to 10 X accounts. Delete one in Analytics first.');
      const meta = existing || { id, counts: {} };
      // Reduce only affected records; historical size never multiplies a write.
      const current = { ...meta };
      const keys = {
        daily: Object.keys(parsed.days || {}), hourly: Object.keys(parsed.hours || {}), heatmap: Object.keys(parsed.heatmap || {}),
        posts: (parsed.posts || []).map(p => p.id), inbound: (parsed.mentions || []).map(p => p.id),
        postDetails: parsed.postId ? [parsed.postId] : [], followers: parsed.account?.followers !== undefined ? [new Date(now).toISOString().slice(0, 10)] : []
      };
      await Promise.all(FIELDS.map(async kind => {
        current[kind] = {};
        await Promise.all(keys[kind].map(async key => {
          const row = await request(tx.objectStore('records').get([id, kind, key]));
          if (row) current[kind][key] = row.value;
        }));
      }));
      const next = applyCapture({ version: 1, accounts: { [id]: current } }, parsed, { accountHint: id, now, source }).accounts[id];
      const counts = { ...meta.counts };
      for (const kind of FIELDS) counts[kind] = (counts[kind] || 0) + Object.keys(next[kind] || {}).filter(key => !(key in current[kind])).length;
      for (const row of rowsOf(next)) tx.objectStore('records').put(row);
      tx.objectStore('accounts').put({ ...metadata(next), counts });
    } catch (error) { tx.abort(); await completion.catch(() => {}); throw error; }
    await completion;
    await storage.set({ [ANALYTICS_KEYS.revision]: now });
    return id;
  }
  async function clear(accountId) {
    const db = await ready();
    // Remove the explicit user's deletion from the legacy recovery copy first,
    // so a later downgrade cannot resurrect it.
    const legacy = readAnalytics((await storage.get(ANALYTICS_KEYS.data))[ANALYTICS_KEYS.data]);
    if (accountId) delete legacy.accounts[accountId]; else legacy.accounts = {};
    await storage.set({ [ANALYTICS_KEYS.data]: legacy });
    const tx = db.transaction(['accounts', 'records'], 'readwrite');
    const completion = done(tx);
    if (!accountId) { tx.objectStore('accounts').clear(); tx.objectStore('records').clear(); }
    else {
      tx.objectStore('accounts').delete(accountId);
      for (const kind of FIELDS) {
        const keys = await request(tx.objectStore('records').index('accountKind').getAllKeys([accountId, kind]));
        keys.forEach(key => tx.objectStore('records').delete(key));
      }
    }
    await completion;
    await storage.set({ [ANALYTICS_KEYS.revision]: Date.now() });
  }
  return { ready, read, apply, accounts, ownerOf, clear, async close() { (await open()).close(); opening = null; migrating = null; } };
}
