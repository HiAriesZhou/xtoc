# Capture a passage

## Sub-features

Selection affordance, save feedback, local article/clip relationship, surrounding context, persistence after page reload, Library rendering. Sources: `apps/extension/src/content/excerpt-capture.js`, `src/background.js`, `src/options/clips-view.js`.

## How to get to it (user POV)

Open an X article, select a passage, click **save to xtoc**, then open extension Options/Library and review the clip. The fixture substitutes the article; no login is needed.

## Driving it with Playwright

Run `node .agents/skills/verify-xtoc/scripts/verify.cjs run` from the root. Native triple-click on fixture `#passage` selects its text. Wait for production `#xtoc-save-excerpt-button`, click it, assert `[data-state="saved"]`, capture feedback, and inspect real `twitterTocArticles`/`twitterTocExcerpts` through the worker. Reload the article and compare storage, open `chrome-extension://<observed ID>/options/index.html`, and require `.row-text` to contain the exact passage. The helper resolves the actual extension ID, not a store ID. Capture action/result screenshots plus storage JSON.

## Gotchas

A new isolated profile must start with no clips. Do not seed storage or call `library:saveClip` yourself. The saved feedback disappears after 1200 ms; capture it immediately. This run opens Options by URL, so popup-to-Library access is not proven. Reload persistence is not browser-restart persistence. Additional duplicate-save checks must assert one stored clip and the `duplicate` button state rather than ignoring extra entries.
