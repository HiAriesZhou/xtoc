import test from 'node:test';
import assert from 'node:assert/strict';
import { syncView } from '../src/popup/bookmark-sync.js';

const status = (phase, commands, extra = {}) =>
  ({ available: true, phase, reason: '', tone: 'info', text: '', commands, ...extra });

test('idle offers only an import and a full scan, without a status line', () => {
  const view = syncView(status('idle', ['start', 'full']));
  assert.deepEqual(view.buttons.map((b) => [b.command, b.label, b.variant]), [
    ['start', 'Import bookmarks', 'primary'],
    ['full', 'Scan all bookmarks', 'link']
  ]);
  assert.equal(view.busy, false);
  assert.equal(view.text, '');
});

test('running and paused show the same line as the page control and its controls', () => {
  const running = syncView(status('running', ['pause', 'stop'], { text: 'Importing · 3 new' }));
  assert.equal(running.text, 'Importing · 3 new');
  assert.equal(running.busy, true);
  assert.deepEqual(running.buttons.map((b) => b.command), ['pause', 'stop']);
  assert.equal(running.hint, 'Keep this tab visible.');
  const paused = syncView(status('paused', ['resume', 'stop'], { text: 'Paused · 3 new' }));
  assert.equal(paused.busy, false);
  assert.deepEqual(paused.buttons.map((b) => [b.command, b.variant]), [['resume', 'primary'], ['stop', 'secondary']]);
});

test('finished imports can run again, or continue after reaching the per-run limit', () => {
  const done = syncView(status('done', ['start', 'full'], { tone: 'success', text: '4 imported' }));
  assert.equal(done.buttons[0].label, 'Import again');
  assert.equal(done.tone, 'success');
  const limit = syncView(status('done', ['continue', 'full'], { reason: 'limit' }));
  assert.deepEqual(limit.buttons.map((b) => [b.command, b.variant]), [['continue', 'primary'], ['full', 'link']]);
});

test('unknown commands from a page are never rendered', () => {
  assert.deepEqual(syncView(status('idle', ['start', 'deleteEverything'])).buttons.map((b) => b.command), ['start']);
});
