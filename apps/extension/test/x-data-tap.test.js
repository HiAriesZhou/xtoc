import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal page: fetch, XMLHttpRequest and postMessage, enough for the tap.
const posted = [];
const listeners = [];
const responses = new Map();

class FakeXHR {
  open(method, url) {
    this.url = url;
  }
  addEventListener(type, fn) {
    if (type === 'load') this.onloadFn = fn;
  }
  send() {
    this.status = 200;
    this.responseType = '';
    this.responseText = JSON.stringify(responses.get(this.url) ?? null);
    queueMicrotask(() => this.onloadFn?.());
  }
}

const page = {
  fetch: async (url) => new Response(JSON.stringify(responses.get(url) ?? { other: true }), { status: responses.has(url) ? 200 : 404 }),
  postMessage(data) {
    posted.push(data);
    for (const fn of listeners) fn({ source: page, data });
  },
  addEventListener(type, fn) {
    if (type === 'message') listeners.push(fn);
  }
};
globalThis.window = page;
globalThis.location = { origin: 'https://x.com', pathname: '/home' };
globalThis.XMLHttpRequest = FakeXHR;
const nativeFetch = page.fetch;

await import('../src/content/x-data-tap.js');

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const captures = () => posted.filter((m) => m.source === 'xtoc-tap').map((m) => m.capture.operation);

test('the tap wraps fetch, buffers until the bridge is ready, and passes responses through unchanged', async () => {
  assert.notEqual(window.fetch, nativeFetch);
  const url = 'https://api.x.com/graphql/abc/contentPageQuery?variables=%7B%7D';
  responses.set(url, { data: { ok: 1 } });
  const response = await window.fetch(url);
  assert.deepEqual(await response.json(), { data: { ok: 1 } }); // page still reads its own body
  await flush();
  assert.deepEqual(captures(), []); // buffered: no bridge yet
  window.postMessage({ source: 'xtoc-bridge', type: 'ready' });
  assert.deepEqual(captures(), ['contentPageQuery']);
});

test('other operations and failed responses are ignored', async () => {
  const before = captures().length;
  await window.fetch('https://api.x.com/graphql/abc/HomeTimeline');
  await window.fetch('https://api.x.com/graphql/abc/audienceOverviewDataQuery'); // 404 in this fake
  await flush();
  assert.equal(captures().length, before);
});

test('XHR responses for analytics operations are captured too', async () => {
  const url = 'https://x.com/i/api/graphql/q/accountOverviewDailyQuery';
  responses.set(url, { data: { viewer_v2: {} } });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.send();
  await flush();
  assert.equal(captures().at(-1), 'accountOverviewDailyQuery');
});

test('installing twice does not wrap fetch twice', async () => {
  const wrapped = window.fetch;
  await import('../src/content/x-data-tap.js?again');
  assert.equal(window.fetch, wrapped);
});

test('on notifications pages the tap reports operation names it sees, without bodies', async () => {
  location.pathname = '/notifications/mentions';
  const before = posted.length;
  await window.fetch('https://api.x.com/graphql/abc/SomeTimelineQuery');
  await flush();
  const seen = posted.slice(before).filter((m) => m.type === 'seen').map((m) => m.seen);
  assert.deepEqual(seen, [{ operation: 'SomeTimelineQuery', status: 404, contentType: 'text/plain;charset=UTF-8', read: 'not captured' }]);
  assert.ok(posted.slice(before).every((m) => !m.capture));
  location.pathname = '/home';
  const quiet = posted.length;
  await window.fetch('https://api.x.com/graphql/abc/SomeTimelineQuery');
  await flush();
  assert.equal(posted.length, quiet);
});
