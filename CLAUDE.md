# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` (imported above) is the authoritative rule set: repository role, public/private routing to Obsidian, browser validation, local-data and export contracts, version policy, release status checks, and the required completion report. This file only adds orientation that is not covered there.

## Commands

Run extension commands and DashBye from `apps/extension/`; extension paths below are relative to that directory. Root READMEs remain at the repository root. Website commands run separately in `apps/web/` (`npm ci`, `npm run lint`, `npm run build`).

```bash
npm test                                   # runs `check:store-assets` (pretest), then `node --test`
node --test test/library.test.js          # single test file (skips the store-asset check)
node --test --test-name-pattern="clamp"    # tests matching a name
npm run check:store-assets                 # store/ upload copies must match marketing/rendered/; store icons are store-only
npm run dev                                # Extension.js dev mode with hot reload
npm run build                              # dist/chromium
npm run build:firefox / build:edge         # per-browser targets
npm run build:dev                          # <repo>/dist/chromium-dev: local debug copy with DEV name/icons
npm run build:zip                          # release/: Chrome, Edge, Firefox store ZIPs + Firefox source ZIP
```

There is no lint script. Extension.js (`extension` devDependency) bundles each entry, so `src/` files may use ES `import` even in the content script. `extension.config.js` pins persistent browser profiles under `dist/extension-profile-*`.

## Architecture

Plain JavaScript, no framework, no runtime dependencies. Four runtime surfaces communicate only through `chrome.runtime`/`chrome.tabs` messages and `chrome.storage`:

- **Background** (`src/background.js`) is the only writer of Library data. It runs every Library mutation through one serialized `transaction()` over the pure reducers in `src/library/model.js`, checks senders (`library:capture`/`library:saveClip` only from X tabs; `library:load`/`edit`/`delete`/`seed` and `ai:*` only from the Library page), makes AI requests, opens the Library (`openClips`/`openLibrary`), registers the context menu, and re-injects content scripts into open X tabs on install or update (`src/reinject.js`, MAIN-world scripts back into the MAIN world). `src/analytics-service.js` stores analytics captures (`analytics:capture` only from X analytics pages, the Mentions page or the sync tab) and runs the sync: it opens X's analytics pages in an inactive tab, waits for each page's expected operation, then closes it.
- **Content script** (`src/content/scripts.js`, on x.com/twitter.com) is a small entry that wires the features and answers popup messages (`getTOC`, `scrollTo`, `togglePanel`, `showPanel`, `hidePanel`, `setTocPrefs`, `captureCurrent`):
  - `toc-extract.js` builds the table of contents (title via `data-testid="twitter-article-title"` or a non-chrome `h1`, then headings) only when `classifyXPage` says the page is an article; `toc-inline.js` is the default `InlineToc`: a Shadow DOM module inserted at the top of X's right-column module list (sticky below X's search bar) or, in Focus mode (`/<user>/article/<id>`), a fixed card beside the column; it never covers the article and steps aside while the floating panel is open. `toc-panel.js` is the draggable floating `TOCPanel` (the "pop out" mode). Both share `toc-view.js` (list markup, `TocTracker` active-section tracking).
  - `excerpt-capture.js` is the selection → "save to xtoc" flow; `library-capture.js` saves the current post or article; `bookmark-import-panel.js` is the import pill on X's Bookmarks page. All of them send to the background rather than writing Library keys.
  - `page-utils.js` holds the shared DOM and extension-context helpers. `lifecycle.js` tears an instance down when a newer one replaces it (`xtoc:replace`) or the extension context dies; the default export is the Extension.js hot-reload teardown.
  - `x-data-tap.js` is a separate MAIN-world entry at `document_start` that copies X Analytics GraphQL responses; `analytics-bridge.js` (isolated) forwards them to the background and reports X visits for the opt-in daily sync.
  - Content scripts write only panel UI state (`tocPanelPosition`, `tocPanelVisible`, `xtocTocPrefs`) to storage directly. The Settings page also writes `xtocTocPrefs` directly; it is a display preference, not Library data.
- **Popup** (`src/popup/scripts.js`) holds no state: it asks the content script for `getTOC`, then sends `scrollTo` / `togglePanel` (pop out or close the floating panel) / `setTocPrefs` / `captureCurrent`.
- **Library page** (`src/options/index.html` + `library-page.js`) routes between `clips-view.js`, `bookmarks-view.js`, `analytics-view.js` (with `analytics-sections.js`, `analytics-charts.js`, `analytics.css`) and `settings-view.js` (with `ai-settings.js`), built from the shared components in `ui.js` (`iconButton`, `createSearch`, …) and `dropdown.js`. It reads storage and sends every change to the background.

Pure, testable logic lives outside the DOM-heavy scripts, and tests import these modules:
- `src/library/` — `model.js` (storage keys, cleaning, reducers, `contentId`), `toc-prefs.js`, `tags.js`, `markdown.js` and `obsidian.js` (Markdown export), `ai.js` and `ai-providers.js`, `key-vault.js`, `dev-seed.js`.
- `src/analytics/` — `operations.js` (captured operation names, sync steps), `parse.js` (GraphQL responses to records), `store.js` (merge reducers, `ANALYTICS_KEYS`), `metrics.js` and `insights.js` (every number on the Analytics page, the digest and the aggregates-only AI input). It must not import from `src/options/` or `src/content/`.
- `src/content/navigation-utils.js` (active section, scroll clamping, TOC equality, page kind), `toc-placement.js` (inline contents placement, Focus mode gutter, X theme and accent), `bookmark-import-utils.js`, `lifecycle.js`.
- `src/options/clip-utils.js` (clip search and selection state), `export-utils.js` (JSON `version: 1`), `dropdown.js` helpers.

Put new unit-testable logic in one of these modules (or a sibling), not in an entry script. `src/library/` must not import from `src/options/` or `src/content/`.

Data model: articles keyed by `contentId(url)` from `src/library/model.js` (`article_<statusId>` for `/status/<id>` or `/article/<id>` URLs, else a hash of the canonical URL); clips reference `articleId`; bookmarks (`xtocLibraryItems`) share the article ID. Use `KEYS` from `model.js` rather than repeating storage key names. `src/types/xtoc.d.ts` documents the storage and export shapes (types only, not proof of shipped behavior).

## Manifest and metadata

- `src/manifest.json` uses Extension.js browser-prefixed keys (`chromium:` → MV3 with `action`/service worker; `firefox:` → MV2 with `browser_action`/background scripts). Check the generated manifest in `dist/<browser>` after changes.
- `test/release-metadata.test.js` enforces that `package.json`, `src/manifest.json`, and `package-lock.json`, and both READMEs' version badges agree.
- `store/` holds the browser-store release definition (`store/release.yml`, listing text, release copies of assets); `marketing/` holds how they are made (`store-art.html` template, real UI captures in `ui/`, fixtures, social card); `assets/brand/` holds the logo and wordmark sources. `tooling/check-store-assets.js` fails `npm test` and `build:zip` when they diverge.
