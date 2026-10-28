import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSummary, responseShape } from '../src/analytics/diagnostics.js';

test('responseShape keeps keys and types but never values', () => {
  const shape = responseShape({
    data: { user: { name: 'secret name', count: 42, ok: true, none: null, list: [{ a: 1 }, { b: 'x' }], tags: ['t'] } }
  });
  assert.deepEqual(shape, {
    data: { user: { name: 'string', count: 'number', ok: 'boolean', none: 'null', list: [{ a: 'number', b: 'string' }], tags: ['string'] } }
  });
  assert.doesNotMatch(JSON.stringify(shape), /secret|42/);
});

test('responseShape stops at a depth limit and tolerates cycles in size', () => {
  let deep = {};
  const root = deep;
  for (let i = 0; i < 60; i++) deep = deep.next = {};
  assert.match(JSON.stringify(responseShape(root)), /…/);
});

test('accountSummary reports counts, ranges and key sets, not post text', () => {
  const summary = accountSummary({
    id: '1',
    handle: 'example',
    daily: { '2026-10-01': { Impressions: 10 }, '2026-10-03': { Likes: 2 } },
    posts: { 1: { kind: 'reply', replyTo: { handle: 'a' }, text: 'private words', metrics: { Impressions: 5 } }, 2: { kind: 'post', text: 'x', metrics: {} } },
    audience: { age: { A: {} }, capturedAt: 1 },
    inbound: { 9: {} }
  });
  assert.equal(summary.days, 2);
  assert.deepEqual(summary.dayRange, ['2026-10-01', '2026-10-03']);
  assert.equal(summary.posts, 2);
  assert.equal(summary.replies, 1);
  assert.equal(summary.repliesWithTarget, 1);
  assert.deepEqual(summary.dayMetricKeys, ['Impressions', 'Likes']);
  assert.equal(summary.inbound, 1);
  assert.doesNotMatch(JSON.stringify(summary), /private words|example/);
});

test('responseShape folds ID-keyed maps into one :id entry', () => {
  const shape = responseShape({ byId: { '2112458505273983418': { n: 1 }, '2112458505273983419': { m: 'x' } } });
  assert.deepEqual(shape, { byId: { ':id': { n: 'number', m: 'string' } } });
  assert.doesNotMatch(JSON.stringify(shape), /2112458505/);
});
