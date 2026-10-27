# Article navigation

## Sub-features

Inline contents (X right-column module and Focus mode card), popup TOC, heading jump, pop out/close, collapse, drag position, active section and visibility persistence. Sources: `apps/extension/src/popup/scripts.js`, `src/content/toc-extract.js`, `src/content/toc-inline.js`, `src/content/toc-placement.js`, `src/content/toc-view.js`, `src/content/toc-panel.js`.

## How to get to it (user POV)

Open a long-form article: the contents module appears in X's right column (or beside the column in Focus mode) without opening XTOC. Use its headings, collapse it, and use its `⋯` menu. From the toolbar popup, choose a heading or pop the contents out; drag the floating panel's header, collapse/expand and close it.

## Inline contents fixture

`assets/article-layout.html` is a synthetic X layout: on `/xtoc_fixture/status/<id>` a three-column page whose right column reproduces X's module list (fixed 53px search bar, spacer, modules, footer) and its scroll-direction sticky behavior, including the spacer X inserts on a direction change; on `/xtoc_fixture/article/<id>` the Focus mode column (700px, top 56px) without a right column. `?theme=dark` switches to Lights out colors. At 1000px and below the column is removed and rebuilt from new nodes above it. Serve it for both routes the same way the clip harness serves `article.html`.

Check through the module's Shadow DOM (`#xtoc-inline-toc`): it sits before the first module with a 16px gap, stays at the search bar's bottom (53px) while scrolling down and back up, marks the current section with `aria-current="location"`, collapses and keeps that after reload (`xtocTocPrefs.collapsed`), disappears without the column and returns after the rebuild, uses `rgb(47, 51, 54)` borders on Lights out, and in Focus mode is fixed 32px right of the column (absent when the gutter is under 220px). Its `⋯` menu closes with Escape, **Pop out contents** swaps to `#twitter-toc-panel` and closing that brings the module back, and **Hide on articles** shows a notice, then sets `xtocTocPrefs.autoShow` to false until the real Settings toggle `#autoShowContents` turns it back on. The fixture matches X's measured structure, not X itself: re-check a real logged-in article before claiming x.com behavior.

## Driving it with Playwright

Use the fixture launch from the skill. The fixture's `twitterArticleReadView`, `twitter-article-title`, `longformRichTextComponent` and `.longform-header-one` match the extractor. Drive the actual popup associated with the active article: `.toc-link` chooses headings and `#pinBtn` pops the floating panel out or closes it. Then use `#twitter-toc-panel .toc-item`, `.toc-panel-header`, `[aria-label="Collapse table of contents"]`, `[aria-label="Expand table of contents"]`, and `[aria-label="Hide table of contents"]`. Assert heading geometry/scroll change and `[aria-current="location"]`, then read `tocPanelPosition`/`tocPanelVisible` and reload to check persistence. Record before/after screenshots and geometry/storage JSON.

## Gotchas

The clip helper does not automate popup creation. Opening popup HTML in a normal tab changes the active tab; that is not faithful popup proof. If the harness cannot open the actual toolbar popup, report the gap and use an authorized browser capable of that surface. Never pre-seed `tocPanelVisible` or send `togglePanel` directly to claim the pop-out journey passed. Narrow layouts can start collapsed; expand through the UI. A heading name appearing in the TOC is not proof it scrolls correctly.
