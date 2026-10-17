# Article navigation

## Sub-features

Popup TOC, heading jump, pin/unpin, collapse, drag position, active section and visibility persistence. Sources: `apps/extension/src/popup/scripts.js`, `src/content/toc-extract.js`, `src/content/toc-panel.js`.

## How to get to it (user POV)

Open a long-form article, open XTOC from the browser toolbar, choose a heading, then pin Contents. Use its headings, drag the header, collapse/expand and hide it.

## Driving it with Playwright

Use the fixture launch from the skill. The fixture's `twitterArticleReadView`, `twitter-article-title`, `longformRichTextComponent` and `.longform-header-one` match the extractor. Drive the actual popup associated with the active article: `.toc-link` chooses headings and `#pinBtn` toggles the panel. Then use `#twitter-toc-panel .toc-item`, `.toc-panel-header`, `[aria-label="Collapse table of contents"]`, `[aria-label="Expand table of contents"]`, and `[aria-label="Hide table of contents"]`. Assert heading geometry/scroll change and `[aria-current="location"]`, then read `tocPanelPosition`/`tocPanelVisible` and reload to check persistence. Record before/after screenshots and geometry/storage JSON.

## Gotchas

The clip helper does not automate popup creation. Opening popup HTML in a normal tab changes the active tab; that is not faithful popup proof. If the harness cannot open the actual toolbar popup, report the gap and use an authorized browser capable of that surface. Never pre-seed `tocPanelVisible` or send `togglePanel` directly to claim the pin journey passed. Narrow layouts can start collapsed; expand through the UI. A heading name appearing in the TOC is not proof it scrolls correctly.
