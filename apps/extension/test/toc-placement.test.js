import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseTocPlacement,
  countSections,
  gutterCardGeometry,
  isFocusRoute,
  pickAccentColor,
  pickTocTheme
} from '../src/content/toc-placement.js';
import { DEFAULT_TOC_PREFS, normalizeTocPrefs } from '../src/library/toc-prefs.js';

const toc = [
  { id: 'title', text: 'Article', level: 1 },
  { id: 'a', text: 'One', level: 2 },
  { id: 'b', text: 'Two', level: 2 },
  { id: 'c', text: 'Two point one', level: 3 }
];

const base = {
  pageKind: 'article',
  focusRoute: false,
  hasSidebar: true,
  gutter: null,
  sectionCount: 3,
  autoShow: true,
  poppedOut: false
};

test('sections exclude the article title', () => {
  assert.equal(countSections(toc), 3);
  assert.equal(countSections([toc[0]]), 0);
  assert.equal(countSections([]), 0);
});

test('Focus mode is the /<user>/article/<id> route only', () => {
  assert.equal(isFocusRoute('https://x.com/someone/article/2093565317196939426'), true);
  assert.equal(isFocusRoute('https://x.com/someone/status/2093565317196939426'), false);
  assert.equal(isFocusRoute('https://x.com/home'), false);
  assert.equal(isFocusRoute('not a url'), false);
});

test('article pages with a right column get the sidebar module', () => {
  assert.equal(chooseTocPlacement(base), 'sidebar');
});

test('Focus mode uses the gutter beside the article when it is wide enough', () => {
  const focus = { ...base, focusRoute: true, hasSidebar: false };
  assert.equal(chooseTocPlacement({ ...focus, gutter: { left: 1095, width: 300 } }), 'gutter');
  assert.equal(chooseTocPlacement({ ...focus, gutter: null }), 'none');
});

test('a status page without the right column never covers the article', () => {
  const narrow = { ...base, hasSidebar: false, gutter: { left: 900, width: 260 } };
  assert.equal(chooseTocPlacement(narrow), 'none');
});

test('nothing shows when turned off, popped out, off-article, or with too few sections', () => {
  assert.equal(chooseTocPlacement({ ...base, autoShow: false }), 'none');
  assert.equal(chooseTocPlacement({ ...base, poppedOut: true }), 'none');
  assert.equal(chooseTocPlacement({ ...base, pageKind: 'post' }), 'none');
  assert.equal(chooseTocPlacement({ ...base, pageKind: 'other' }), 'none');
  assert.equal(chooseTocPlacement({ ...base, sectionCount: 1 }), 'none');
  assert.equal(chooseTocPlacement({ ...base, sectionCount: 2 }), 'sidebar');
});

test('the gutter card sits beside the column and is skipped when the gutter is narrow', () => {
  // Measured at 1440px: the Focus mode column ends at 1063px.
  assert.deepEqual(gutterCardGeometry({ columnRight: 1063, viewportWidth: 1440 }), {
    left: 1095,
    width: 300
  });
  assert.deepEqual(gutterCardGeometry({ columnRight: 1000, viewportWidth: 1280 }), {
    left: 1032,
    width: 232
  });
  assert.equal(gutterCardGeometry({ columnRight: 900, viewportWidth: 1120 }), null);
  assert.equal(gutterCardGeometry({ columnRight: Number.NaN, viewportWidth: 1440 }), null);
});

test('theme follows X, not the system: page background first, then color-scheme', () => {
  assert.equal(pickTocTheme({ background: 'rgb(255, 255, 255)', colorScheme: 'dark' }), 'light');
  assert.equal(pickTocTheme({ background: 'rgb(0, 0, 0)', colorScheme: 'light' }), 'dark');
  assert.equal(pickTocTheme({ background: 'rgba(0, 0, 0, 0)', colorScheme: 'dark' }), 'dark');
  assert.equal(pickTocTheme({ background: '', colorScheme: 'normal' }), 'light');
});

test('accent color is the first chromatic candidate, else X blue', () => {
  assert.equal(
    pickAccentColor(['rgb(15, 20, 25)', 'rgb(249, 24, 128)', 'rgb(29, 155, 240)']),
    'rgb(249, 24, 128)'
  );
  assert.equal(pickAccentColor(['rgb(0, 0, 0)', 'rgb(83, 100, 113)', '']), 'rgb(29, 155, 240)');
  assert.equal(pickAccentColor([]), 'rgb(29, 155, 240)');
  // Measured on x.com: an unstyled link came first.
  assert.equal(
    pickAccentColor(['rgb(0, 0, 238)', 'rgb(15, 20, 25)', 'rgb(83, 100, 113)', 'rgb(29, 155, 240)']),
    'rgb(29, 155, 240)'
  );
  assert.equal(pickAccentColor(['rgb(85, 26, 139)', 'rgb(0, 186, 124)']), 'rgb(0, 186, 124)');
  // Measured on x.com Lights out: the dark-scheme link default came first.
  assert.equal(pickAccentColor(['rgb(158, 158, 255)', 'rgb(29, 155, 240)']), 'rgb(29, 155, 240)');
});

test('contents preferences default to shown and expanded and ignore malformed values', () => {
  assert.deepEqual(normalizeTocPrefs(undefined), DEFAULT_TOC_PREFS);
  assert.deepEqual(normalizeTocPrefs({ autoShow: 'no', collapsed: 1 }), DEFAULT_TOC_PREFS);
  assert.deepEqual(normalizeTocPrefs({ autoShow: false, collapsed: true, extra: 1 }), {
    autoShow: false,
    collapsed: true
  });
});
