import test from 'node:test';
import assert from 'node:assert/strict';
import { isBookmarkedTweet, isBookmarksRoute } from '../src/content/bookmark-import-utils.js';

test('bookmark import runs on the legacy Bookmarks route and the History page', () => {
  assert.equal(isBookmarksRoute('/i/bookmarks'), true);
  assert.equal(isBookmarksRoute('/i/bookmarks/123'), true);
  assert.equal(isBookmarksRoute('/i/history'), true);
  assert.equal(isBookmarksRoute('/i/history/bookmarks'), true);
  assert.equal(isBookmarksRoute('/home'), false);
  assert.equal(isBookmarksRoute('/i/historyx'), false);
});

test('only posts whose bookmark button is in the saved state are imported', () => {
  const tweet = (testId) => ({
    querySelector: (selector) => (selector.includes(`"${testId}"`) ? {} : null)
  });
  assert.equal(isBookmarkedTweet(tweet('removeBookmark')), true);
  assert.equal(isBookmarkedTweet(tweet('bookmark')), false);
});

test('import status stays one short line for each state', async () => {
  const { importLabel } = await import('../src/content/bookmark-import-utils.js');
  const counts = { added: 23, duplicates: 0, failed: 0 };
  assert.deepEqual(importLabel({ phase: 'idle' }), { tone: 'info', text: 'Import bookmarks' });
  assert.deepEqual(importLabel({ phase: 'running', ...counts }), {
    tone: 'info',
    text: 'Importing · 23 new'
  });
  assert.deepEqual(importLabel({ phase: 'paused', ...counts }), {
    tone: 'info',
    text: 'Paused · 23 new'
  });
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'end', added: 39, duplicates: 1, failed: 2 }),
    {
      tone: 'success',
      text: '39 imported · 1 already saved · 2 skipped'
    }
  );
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'end', added: 0, duplicates: 5, failed: 0 }),
    {
      tone: 'success',
      text: 'All 5 already saved'
    }
  );
  assert.equal(
    importLabel({ phase: 'done', reason: 'cancelled', ...counts }).text,
    'Stopped · 23 imported'
  );
  assert.deepEqual(
    importLabel({ phase: 'done', reason: 'no-bookmarks', added: 0, duplicates: 0, failed: 0 }),
    {
      tone: 'warning',
      text: 'No bookmarks on this tab'
    }
  );
  assert.equal(
    importLabel({ phase: 'done', reason: 'limit', ...counts }).text,
    '23 imported · continue for more'
  );
  assert.equal(importLabel({ phase: 'done', reason: 'storage', ...counts }).tone, 'error');
  assert.equal(
    importLabel({ phase: 'done', reason: 'error', ...counts }).text,
    'Import failed · try again'
  );
});

test('a press outside the open import menu closes it; presses inside keep it open', async () => {
  const { closeMenuOutside } = await import('../src/content/bookmark-import-utils.js');
  const menu = { open: true };
  const root = { querySelector: (selector) => (selector === '.more[open]' && menu.open ? menu : null) };
  const press = (...path) => ({ composedPath: () => path });

  assert.equal(closeMenuOutside(root, press(menu, root)), false);
  assert.equal(menu.open, true);
  assert.equal(closeMenuOutside(root, press(root)), true);
  assert.equal(menu.open, false);
  assert.equal(closeMenuOutside(root, press()), false);
});

test('progress separates new imports from bookmarks that were already saved', async () => {
  const { importLabel } = await import('../src/content/bookmark-import-utils.js');
  assert.equal(importLabel({ phase: 'running', added: 0, duplicates: 5 }).text, 'Importing · 0 new · 5 already saved');
  assert.equal(importLabel({ phase: 'paused', added: 2, duplicates: 5 }).text, 'Paused · 2 new · 5 already saved');
});

test('progress shows skipped previews while the import is still running', async () => {
  const { importLabel } = await import('../src/content/bookmark-import-utils.js');
  assert.equal(importLabel({ phase: 'running', added: 0, duplicates: 5, failed: 12 }).text,
    'Importing · 0 new · 5 already saved · 12 skipped');
  assert.equal(importLabel({ phase: 'paused', added: 1, failed: 2 }).text, 'Paused · 1 new · 2 skipped');
});

test('each import phase allows only the commands its page control offers', async () => {
  const { importCommands } = await import('../src/content/bookmark-import-utils.js');
  assert.deepEqual(importCommands({ phase: 'idle' }), ['start', 'full']);
  assert.deepEqual(importCommands({ phase: 'running' }), ['pause', 'stop']);
  assert.deepEqual(importCommands({ phase: 'paused' }), ['resume', 'stop']);
  assert.deepEqual(importCommands({ phase: 'done', reason: 'end' }), ['start', 'full']);
  assert.deepEqual(importCommands({ phase: 'done', reason: 'limit' }), ['continue', 'full']);
});
