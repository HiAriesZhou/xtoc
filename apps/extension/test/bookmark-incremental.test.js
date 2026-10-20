import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, mutate, importedBookmarks } from '../src/library/model.js';
import { importStatus, usableCheckpoint, nextCheckpoints } from '../src/library/bookmark-import.js';
import { importProgress, importScope } from '../src/content/bookmark-import-utils.js';
import { initBookmarkImport } from '../src/content/bookmark-import-panel.js';

const scope = '@fixture/bookmarks';
const id = (n) => `article_${n}`;
const payload = (n) => ({ article: { id: id(n), canonicalUrl: `https://x.com/fixture/status/${n}`, title: `Post ${n}` },
  bookmark: { markdown: `Text ${n}`, fromXBookmarks: true, sortKey: 10000 - n } });
const seeded = (count = 63) => {
  const state = readState();
  for (let n = 1; n <= count; n++) mutate(state, 'capture', payload(n), '2026-10-18T00:00:00Z');
  return state;
};
const boundary = (count = 63) => ({ version: 1, startedAt: 1,
  head: [1, 2, 3, 4, 5].map(id), covered: Array.from({ length: count }, (_, i) => id(i + 1)) });

test('ready duplicates are true no-ops; legacy IDs and incomplete records still work', () => {
  const state = seeded(5);
  const before = structuredClone(state);
  assert.equal(mutate(state, 'capture', payload(1)).duplicate, true);
  assert.deepEqual(state, before);
  state.articles.legacy = state.articles.article_1;
  state.articles.legacy.id = 'legacy';
  state.bookmarks.legacy = state.bookmarks.article_1;
  delete state.articles.article_1;
  delete state.bookmarks.article_1;
  assert.equal(importStatus(state, [id(1)])[0].ready, true);
  assert.equal(mutate(state, 'capture', payload(1)).id, 'legacy');
  state.bookmarks.article_2.markdown = '';
  assert.equal(importStatus(state, [id(2)])[0].ready, false);
  mutate(state, 'capture', payload(2));
  assert.equal(state.bookmarks.article_2.markdown, 'Text 2');
  mutate(state, 'capture', { ...payload(3), bookmark: { markdown: 'Full article' } });
  assert.equal(state.bookmarks.article_3.markdown, 'Full article');
});

test('checkpoints require saved coverage and complete anchors, with bounded validated input', () => {
  const state = seeded();
  assert.deepEqual(usableCheckpoint(state, boundary()), boundary());
  delete state.bookmarks.article_63;
  assert.equal(usableCheckpoint(state, boundary()), null);
  assert.throws(() => importStatus(state, Array(101).fill(id(1))), /Invalid/);
  assert.throws(() => importStatus(state, ['__proto__']), /Invalid/);
  assert.equal(usableCheckpoint(state, { ...boundary(), head: [id(1)] }), null);
  const saved = { [scope]: { ...boundary(5), startedAt: 100 } };
  assert.equal(nextCheckpoints(state, saved, { ...boundary(5), scope, startedAt: 10 }), saved);
});

test('only a distinct, ordered, previously imported head permits stopping', () => {
  const progress = importProgress(boundary());
  for (const n of [20, 21, 22, 23, 24, 1, 1, 1, 2, 3, 9, 4, 5])
    assert.equal(progress.observe(id(n), true), false);
  const next = importProgress(boundary());
  assert.equal(next.observe(id(100), false), false);
  for (const n of [1, 2, 3, 4]) assert.equal(next.observe(id(n), true), false);
  assert.equal(next.observe(id(5), true), true);
  assert.equal(next.checkpoint(200, scope, true).covered.length, 6);
  assert.equal(next.checkpoint(200, scope, true).previousStartedAt, 1);
  const failed = importProgress(boundary());
  failed.fail();
  for (let n = 1; n <= 5; n++) assert.equal(failed.observe(id(n), true), false);
  assert.equal(failed.checkpoint(200, scope, false), null);
});

test('account, folder and History tab determine the import scope', () => {
  const doc = (profile, tab) => ({ querySelector: (s) => ({ getAttribute: () => s.includes('Profile') ? profile : tab }) });
  assert.equal(importScope(doc('/Alice'), '/i/bookmarks'), '@alice/bookmarks');
  assert.equal(importScope(doc('/Bob'), '/i/bookmarks/123'), '@bob/bookmarks/123');
  assert.equal(importScope(doc('/Alice', '/i/history/likes'), '/i/history'), null);
  assert.equal(importScope(doc('/Alice', '/i/history/bookmarks'), '/i/history'), '@alice/bookmarks');
  assert.equal(importScope(doc(null), '/i/bookmarks'), null);
  const history = { querySelector: (s) => s.includes('Profile')
    ? { getAttribute: () => '/Alice' } : { getAttribute: () => null, textContent: ' 书签 ' } };
  assert.equal(importScope(history, '/i/history'), '@alice/bookmarks');
  history.querySelector = (s) => s.includes('Profile')
    ? { getAttribute: () => '/Alice' } : { getAttribute: () => null, textContent: '喜欢' };
  assert.equal(importScope(history, '/i/history'), null);
});

// Exercise the actual panel loop with virtual DOM/timers. Model and checkpoint
// operations are real; browser storage/messaging is separately integration-tested.
async function runPanel({ command, state, checkpoints = {}, posts, full = false, loading = false, failAt, onWait, history = false, switchTab = false, continueAfterLimit = false, smooth = false, postHeight = 300, saveDelay = 0, bookmarked = true, hidden = null, hydrateMs = 0 }) {
  let offset = 0, scrolls = 0, waitMs = 0, saves = 0, click;
  let clock = 0, sequence = 0, stillMs = 0, maxMidPause = 0;
  const jobs = new Map();
  const schedule = (fn, ms) => { const id = ++sequence; jobs.set(id, { fn, at: clock + ms }); return id; };
  let selectedTab = '书签';
  const label = { textContent: '' };
  const pill = { dataset: {}, querySelector: () => label, addEventListener: (type, fn) => { if (type === 'click') click = fn; } };
  const host = { isConnected: true, attachShadow: () => ({ querySelector: () => pill }), remove() {} };
  const mountedAt = new Map();
  const isBookmarked = (n) => (typeof bookmarked === 'function' ? bookmarked(n) : bookmarked) &&
    clock - mountedAt.get(n) >= hydrateMs;
  const nodes = () => posts.slice(offset, offset + 3).map((n) => {
    if (!mountedAt.has(n)) mountedAt.set(n, clock);
    const time = { closest: () => ({ href: payload(n).article.canonicalUrl }), dateTime: '' };
    const body = { nodeType: 3, textContent: `Text ${n}`, childNodes: [], querySelector: () => null, matches: () => false };
    return { querySelector(selector) {
      if (selector === 'time') return time;
      if (selector.includes('removeBookmark')) return isBookmarked(n) ? {} : null;
      if (selector.includes('tweetText')) return body;
      if (selector.includes('User-Name')) return { textContent: 'Fixture @fixture' };
      return null;
    }, matches: () => false };
  });
  const isHidden = () => Boolean(hidden) && clock >= hidden[0] && clock < hidden[1];
  const doc = { get hidden() { return isHidden(); }, createElement: () => host, body: { append() {} }, addEventListener() {}, removeEventListener() {}, documentElement: { get scrollHeight() { return Math.max(900, posts.length * postHeight); } },
    querySelector: (s) => s.includes('Profile') ? { getAttribute: () => '/fixture' }
      : s.includes('[role="tab"]') ? { getAttribute: () => null, textContent: selectedTab } : loading ? {} : null,
    querySelectorAll: (s) => s.endsWith(' time') ? nodes().map((n) => n.querySelector('time')) : nodes() };
  const pathname = history ? '/i/history' : '/i/bookmarks';
  const view = {
    scrollY: 0, innerHeight: 900, matchMedia: () => ({ matches: !smooth }),
    requestAnimationFrame: (fn) => schedule(() => fn(clock), isHidden() ? hidden[1] - clock : 16),
    cancelAnimationFrame: (id) => jobs.delete(id),
    scrollTo({ top }) {
      const next = Math.max(0, Math.min(top, doc.documentElement.scrollHeight - 900));
      if (next !== this.scrollY) scrolls++;
      this.scrollY = next;
      offset = Math.min(Math.floor(next / postHeight), Math.max(0, posts.length - 3));
    },
    scrollBy({ top }) { this.scrollTo({ top: this.scrollY + top }); }
  };
  const globals = { document: doc, location: { href: `https://x.com${pathname}`, pathname }, innerHeight: 900,
    window: view, performance: { now: () => clock },
    setTimeout(fn, ms) { return schedule(() => { waitMs += ms; if (switchTab) selectedTab = '喜欢'; onWait?.(waitMs, () => click({ target: { closest: () => ({ dataset: { action: 'stop' } }) } })); fn(); }, ms); },
    setInterval() {}, clearInterval() {},
    chrome: { runtime: { async sendMessage({ action, payload: p }) {
      if (action === 'import:status') return { ok: true, data: importStatus(state, p.ids) };
      if (action === 'import:checkpoint') return { ok: true, data: usableCheckpoint(state, checkpoints[p.scope]) };
      if (action === 'import:finish') { checkpoints = nextCheckpoints(state, checkpoints, p); return { ok: true }; }
      if (action === 'library:capture') {
        saves++;
        if (saveDelay) await new Promise((resolve) => setTimeout(resolve, saveDelay));
        if (p.article.id === failAt) return { ok: false, error: 'Unreadable preview' };
        return { ok: true, data: mutate(state, 'capture', p) };
      }
      throw new Error(action);
    } } }
  };
  const restore = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const controller = initBookmarkImport();
    const drain = async () => {
      for (let i = 0; i < 150000 && pill.dataset.phase !== 'done'; i++) {
        const before = view.scrollY;
        for (let turn = 0; turn < 16; turn++) await Promise.resolve();
        clock += 16;
        for (const [id, job] of [...jobs]) if (job.at <= clock) { jobs.delete(id); job.fn(); }
        for (let turn = 0; turn < 16; turn++) await Promise.resolve();
        if (before > 0 && before < doc.documentElement.scrollHeight - 900 && pill.dataset.phase === 'running') {
          stillMs = before === view.scrollY ? stillMs + 16 : 0;
          maxMidPause = Math.max(maxMidPause, stillMs);
        }
      }
    };
    let commandStatus;
    if (command) commandStatus = controller.perform(command);
    else click({ target: { closest: () => ({ dataset: { action: full ? 'full' : 'start' } }) } });
    await drain();
    assert.equal(pill.dataset.phase, 'done', label.textContent);
    if (continueAfterLimit) {
      assert.equal(pill.dataset.reason, 'limit');
      assert.deepEqual(checkpoints, {});
      const offsetBefore = offset;
      click({ target: { closest: () => ({ dataset: { action: 'continue' } }) } });
      await drain();
      assert.equal(pill.dataset.phase, 'done');
      assert.ok(offset >= offsetBefore, 'continuing must not return to the top');
    }
    const finalStatus = controller.status();
    controller.destroy();
    return { commandStatus, finalStatus, reason: pill.dataset.reason, text: label.textContent, title: label.title, checkpoints, saves, scrolls, waitMs, maxMidPause };
  } finally {
    for (const [key, descriptor] of Object.entries(restore)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('10 new + 53 saved: incremental stops after anchors; full check reaches the tail', async () => {
  const posts = [...Array.from({ length: 10 }, (_, i) => 100 + i), ...Array.from({ length: 53 }, (_, i) => i + 1)];
  const incremental = await runPanel({ state: seeded(53), checkpoints: { [scope]: boundary(53) }, posts });
  assert.equal(incremental.reason, 'caught-up');
  assert.equal(incremental.saves, 10);
  assert.ok(incremental.scrolls > 0);
  assert.equal(incremental.checkpoints[scope].covered.length, 63);
  const full = await runPanel({ state: seeded(53), checkpoints: { [scope]: boundary(53) }, posts, full: true });
  assert.equal(full.reason, 'end');
  assert.equal(full.saves, 10);
  assert.ok(full.scrolls > incremental.scrolls);
  console.log('Import loop timing (virtual ms):', { incremental: incremental.waitMs, full: full.waitMs });
});

test('scrolling stays continuous through tall, already captured posts', async () => {
  const result = await runPanel({ state: seeded(12), posts: Array.from({ length: 12 }, (_, i) => i + 1),
    smooth: true, postHeight: 1600 });
  assert.ok(result.maxMidPause < 100, `Unexpected mid-list pause: ${result.maxMidPause}ms`);
  assert.equal(result.reason, 'end');
  assert.equal(result.checkpoints[scope].covered.length, 12);
});

test('slow saves do not block scrolling or lose captured previews', async () => {
  const state = readState();
  const result = await runPanel({ state, posts: Array.from({ length: 12 }, (_, i) => i + 1),
    smooth: true, postHeight: 1600, saveDelay: 250 });
  assert.ok(result.maxMidPause < 100, `Saving interrupted scrolling: ${result.maxMidPause}ms`);
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 12);
  for (let n = 1; n <= 12; n++) assert.equal(state.bookmarks[id(n)].markdown, `Text ${n}`);
});

test('a long slow-save backlog pauses motion before it can skip unsaved posts', async () => {
  const state = readState();
  const result = await runPanel({ state, posts: Array.from({ length: 70 }, (_, i) => i + 1),
    smooth: true, postHeight: 300, saveDelay: 500 });
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 70);
  assert.equal(result.checkpoints[scope].covered.length, 70);
  for (let n = 1; n <= 70; n++) assert.equal(state.bookmarks[id(n)].markdown, `Text ${n}`);
});

test('continuous scanning waits for delayed content and imports it before finishing', async () => {
  const posts = [1, 2, 3];
  const result = await runPanel({ state: readState(), posts, smooth: true, onWait(elapsed) {
    if (elapsed >= 3500 && posts.length === 3) posts.push(4, 5, 6);
  } });
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 6);
  assert.equal(result.checkpoints[scope].covered.length, 6);
});

test('empty scan ticks do not reset detection of a non-bookmark feed', async () => {
  const result = await runPanel({ state: readState(), posts: Array.from({ length: 63 }, (_, i) => i + 1),
    smooth: true, bookmarked: false });
  assert.equal(result.reason, 'no-bookmarks');
  assert.equal(result.saves, 0);
  assert.deepEqual(result.checkpoints, {});
});

test('without a checkpoint, duplicates before new posts do not hide older imports', async () => {
  const result = await runPanel({ state: seeded(10), posts: [1, 2, 3, 4, 5, 100, 6, 7, 8, 9, 10] });
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 1);
  assert.ok(result.checkpoints[scope].covered.includes(id(100)));
});

test('new posts mounting at the tail do not delay an already settled first post', async () => {
  const state = readState();
  const posts = [1];
  let initialWait = 0;
  const result = await runPanel({ state, posts, onWait(elapsed) {
    if (Object.keys(state.bookmarks).length) return;
    initialWait = elapsed;
    posts.push(posts.length + 1);
  } });
  assert.equal(initialWait, 500);
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, posts.length);
});

test('cancelled, failed, and loading runs cannot establish a checkpoint', async () => {
  const posts = Array.from({ length: 12 }, (_, i) => i + 1);
  const cancelled = await runPanel({ state: readState(), posts, onWait: (_, stop) => stop() });
  assert.equal(cancelled.reason, 'cancelled');
  assert.deepEqual(cancelled.checkpoints, {});
  const failed = await runPanel({ state: readState(), posts, failAt: id(7) });
  assert.deepEqual(failed.checkpoints, {});
  const loading = await runPanel({ state: seeded(12), posts, loading: true });
  assert.equal(loading.reason, 'loading');
  assert.deepEqual(loading.checkpoints, {});
});

test('an all-duplicate incremental run sends no capture requests and preserves records', async () => {
  const state = seeded();
  const before = structuredClone(state);
  const result = await runPanel({ state, checkpoints: { [scope]: boundary() }, posts: Array.from({ length: 63 }, (_, i) => i + 1) });
  assert.equal(result.reason, 'caught-up');
  assert.equal(result.saves, 0);
  assert.deepEqual(state, before);
  assert.equal(importedBookmarks(state).size, 63);
});

test('History bookmark tabs support incremental imports and abort on same-URL tab changes', async () => {
  const args = { state: seeded(), checkpoints: { [scope]: boundary() }, posts: Array.from({ length: 63 }, (_, i) => i + 1), history: true };
  assert.equal((await runPanel(args)).reason, 'caught-up');
  const changed = await runPanel({ ...args, switchTab: true });
  assert.equal(changed.reason, 'page-changed');
  assert.equal(changed.saves, 0);
  assert.deepEqual(changed.checkpoints, args.checkpoints);
});

test('Continue passes the 1000-item limit without restarting or losing earlier coverage', async () => {
  const state = readState();
  const posts = Array.from({ length: 1002 }, (_, i) => i + 1);
  // Synthetic pre-existing imports, avoiding quadratic fixture construction.
  for (const n of posts) {
    const p = payload(n);
    state.articles[id(n)] = p.article;
    state.bookmarks[id(n)] = { ...p.bookmark, id: id(n) };
  }
  const result = await runPanel({ state, posts, continueAfterLimit: true });
  assert.equal(result.reason, 'end');
  assert.equal(result.text, 'All 1002 already saved');
  assert.equal(result.checkpoints[scope].covered.length, 1002);
  assert.equal(result.saves, 0);
});

test('a hidden tab holds the import instead of ending it, and resumes when visible', async () => {
  const state = seeded(5);
  const posts = Array.from({ length: 30 }, (_, i) => i + 1);
  const result = await runPanel({ state, posts, smooth: true, hidden: [2000, 120000] });
  assert.equal(result.reason, 'end', result.text);
  assert.equal(result.saves, 25);
  assert.equal(result.text, '25 imported · 5 already saved');
});

test('a failed save keeps the import going and explains why it was skipped', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const result = await runPanel({ state: readState(), posts: Array.from({ length: 8 }, (_, i) => i + 1), failAt: id(3) });
    assert.equal(result.text, '7 imported · 1 skipped');
    assert.equal(result.title, 'Skipped: Unreadable preview');
    assert.equal(warnings.length, 1);
  } finally { console.warn = warn; }
});

test('posts whose bookmark state renders after mounting are still imported', async () => {
  const state = seeded(5);
  const result = await runPanel({ state, posts: Array.from({ length: 30 }, (_, i) => i + 1),
    smooth: true, hydrateMs: 400 });
  assert.equal(result.reason, 'end', result.text);
  assert.equal(result.saves, 25);
  assert.equal(result.text, '25 imported · 5 already saved');
  assert.equal(result.checkpoints[scope].covered.length, 30);
});

test('a post that is not bookmarked on a bookmarks list prevents a checkpoint', async () => {
  const result = await runPanel({ state: readState(), posts: Array.from({ length: 12 }, (_, i) => i + 1),
    bookmarked: (n) => n !== 7 });
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 11);
  assert.deepEqual(result.checkpoints, {});
});

test('a popup command runs the same import as the page control and reports its status', async () => {
  const state = readState();
  const result = await runPanel({ command: 'start', state, posts: Array.from({ length: 6 }, (_, i) => i + 1) });
  assert.equal(result.commandStatus.phase, 'running');
  assert.deepEqual(result.commandStatus.commands, ['pause', 'stop']);
  assert.equal(result.reason, 'end');
  assert.equal(result.saves, 6);
  assert.deepEqual(result.finalStatus, { available: true, phase: 'done', reason: 'end', tone: 'success',
    text: '6 imported', commands: ['start', 'full'] });
});

test('a command that does not apply to the current phase is rejected', async () => {
  await assert.rejects(runPanel({ command: 'pause', state: readState(), posts: [1] }), /not available/);
});

// Build a large Library directly; capturing 10000 posts one by one is quadratic.
const bulkState = (count) => {
  const state = seeded(1);
  const article = state.articles[id(1)];
  const bookmark = state.bookmarks[id(1)];
  for (let n = 2; n <= count; n++) {
    state.articles[id(n)] = { ...article, id: id(n), canonicalUrl: `https://x.com/fixture/status/${n}` };
    state.bookmarks[id(n)] = { ...bookmark, id: id(n) };
  }
  return state;
};

test('a boundary keeps the newest 10000 covered posts instead of refusing to save', () => {
  const total = 10010;
  const state = bulkState(total);
  // Newest first, as the list is scanned: 10010 is the newest bookmark.
  const newest = (from, length) => Array.from({ length }, (_, i) => id(from - i));
  const previous = { version: 1, startedAt: 1, head: newest(total - 10, 5), covered: newest(total - 10, total - 10) };
  const next = nextCheckpoints(state, { [scope]: previous },
    { scope, startedAt: 2, head: newest(total, 5), covered: newest(total, 15), previousStartedAt: 1 });
  assert.equal(next[scope].startedAt, 2);
  assert.equal(next[scope].covered.length, 10000);
  assert.deepEqual(next[scope].covered.slice(0, 5), newest(total, 5));
  assert.ok(usableCheckpoint(state, next[scope]));
});

test('a long scan reports at most 10000 covered posts, newest first', () => {
  const progress = importProgress(null);
  for (let n = 1; n <= 10005; n++) progress.observe(id(n), true);
  const checkpoint = progress.checkpoint(10, scope, false);
  assert.equal(checkpoint.covered.length, 10000);
  assert.deepEqual(checkpoint.head, [1, 2, 3, 4, 5].map(id));
  assert.equal(checkpoint.covered[9999], id(10000));
});
