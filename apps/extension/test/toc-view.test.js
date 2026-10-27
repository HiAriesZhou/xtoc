import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTocList } from '../src/content/toc-view.js';

test('contents rows carry the full escaped title for the truncated single-line label', () => {
  const html = renderTocList([
    { id: 'title', text: 'Article', level: 1 },
    { id: 'a', text: 'Quotes "and" <tags> & more', level: 2 }
  ]);
  const escaped = 'Quotes &quot;and&quot; &lt;tags&gt; &amp; more';
  assert.match(html, new RegExp(`<li class="toc-row level-2">\\s*<button class="toc-item" type="button" data-index="1" title="${escaped}"><span class="toc-label">${escaped}</span></button>`));
  assert.doesNotMatch(html, /<tags>/);
  assert.equal(html.match(/class="toc-item"/g).length, 2);
});

test('an empty contents list says so', () => {
  assert.match(renderTocList([]), /No sections found/);
});
