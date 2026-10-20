import test from 'node:test';
import assert from 'node:assert/strict';
import { startImportScroll } from '../src/content/bookmark-import-scroll.js';

function fixture({ reducedMotion = false, start = 0, height = 10000 } = {}) {
  let time = 0, scheduled;
  const moves = [];
  const view = {
    scrollY: start, innerHeight: 900,
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame(callback) { scheduled = callback; return 1; },
    cancelAnimationFrame() { scheduled = undefined; },
    scrollTo({ top }) { moves.push(top - view.scrollY); view.scrollY = top; }
  };
  const frame = (elapsed = 16) => { time += elapsed; const fn = scheduled; scheduled = undefined; fn?.(time); };
  return { view, doc: { documentElement: { scrollHeight: height } }, moves, frame, hasFrame: () => Boolean(scheduled) };
}

test('continuous import scrolling crosses multiple screenfuls without stopping', () => {
  const env = fixture();
  const stop = startImportScroll({ canAdvance: () => true, ...env });
  for (let i = 0; i < 150; i++) env.frame();
  assert.equal(env.moves.length, 149);
  assert.ok(env.view.scrollY > 2000);
  assert.ok(env.moves.every((delta) => delta > 0 && delta <= 32));
  stop();
  assert.equal(env.hasFrame(), false);
});

test('a delayed frame cannot turn animation into a large jump', () => {
  const env = fixture();
  const stop = startImportScroll({ canAdvance: () => true, ...env });
  env.frame(); env.frame(250);
  assert.deepEqual(env.moves, [32]);
  stop();
});

test('pause and queue backpressure freeze motion without catch-up on resume', () => {
  const env = fixture();
  let running = true;
  const stop = startImportScroll({ canAdvance: () => running, ...env });
  env.frame(); env.frame();
  const position = env.view.scrollY;
  running = false;
  for (let i = 0; i < 20; i++) env.frame();
  assert.equal(env.view.scrollY, position);
  running = true;
  env.frame();
  assert.ok(env.view.scrollY > position && env.view.scrollY - position <= 32);
  stop();
  env.frame();
  assert.equal(env.moves.length, 2);
});

test('motion waits at the loaded bottom, then resumes when the page grows', () => {
  const env = fixture({ start: 2050, height: 3000 });
  const stop = startImportScroll({ canAdvance: () => true, ...env });
  for (let i = 0; i < 10; i++) env.frame();
  assert.equal(env.view.scrollY, 2100);
  assert.equal(env.moves.length, 3);
  env.doc.documentElement.scrollHeight += 1000;
  env.frame();
  assert.ok(env.view.scrollY > 2100);
  stop();
});

test('reduced motion uses spaced immediate steps and still obeys cancellation', () => {
  const env = fixture({ reducedMotion: true });
  let running = true;
  const stop = startImportScroll({ canAdvance: () => running, ...env });
  env.frame(); env.frame();
  assert.deepEqual(env.moves, [720]);
  running = false;
  env.frame(600);
  assert.deepEqual(env.moves, [720]);
  stop();
});

test('a collector error cancels the animation and reports failure', () => {
  const env = fixture();
  const error = new Error('Unable to read preview');
  let reported;
  startImportScroll({ canAdvance: () => { throw error; }, onError: (caught) => { reported = caught; }, ...env });
  env.frame();
  assert.equal(reported, error);
  assert.equal(env.hasFrame(), false);
});
