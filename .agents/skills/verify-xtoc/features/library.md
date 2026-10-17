# Manage local clips

## Sub-features

Search, tags/notes, selected/all exports, deletion, and persisted changes. Sources: `apps/extension/src/options/clips-view.js`, `src/options/export-utils.js`, `src/library/obsidian.js`.

## How to get to it (user POV)

Save a passage, open Library, choose Clips, open the clip, edit Tags/Note and Save. Select clips for export or deletion.

## Driving it with Playwright

Start with the real saved clip journey, then extend it before cleanup. In Options, click `[data-route="clips"]`, open `.row-body[data-open]`, fill `#editForm [name="tags"]` and `[name="note"]`, and submit the button with `form="editForm"`. Reload and assert both UI and real storage. Use `[aria-label="Select clip"]` for selected operations. Drive the visible Export dropdown and its JSON or Markdown choice; capture the download event before clicking, save the downloaded bytes under the evidence directory, and inspect contents. Confirm deletion through the actual dialog using a scoped dialog listener; verify absence after reload. Include screenshots, exact exported IDs and storage deltas.

## Gotchas

JSON must remain version 1, source `twitter-toc-extension`, with `articles[].excerpts`. Markdown is an Obsidian ZIP, not a plain Markdown download. Selected export needs at least two genuinely saved clips to prove exclusion; never reduce this journey to one item just to pass. Export must preserve article-to-clip relationships and omit AI keys. The default clip helper proves only initial Library rendering, not these mutations or downloads. AI/bookmark operations require separate journeys and explicit boundary fixtures; never use real API keys in evidence.
