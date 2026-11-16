<h1 align="center">
  <img src="apps/extension/assets/brand/wordmark.svg" width="280" alt="XTOC">
</h1>

<p align="center">
  <strong>Jump to a section. Keep the lines that matter.</strong><br>
  A lightweight, open-source reading companion for X/Twitter long-form articles.
</p>

<p align="center">
  English · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/xtoc/releases"><img src="https://img.shields.io/badge/version-0.12.1-blue" alt="Version 0.12.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/badge/Chrome-Install-4285F4?logo=googlechrome&logoColor=white" alt="Install for Chrome"></a>
</p>

**A star won't fix bugs, but it makes the person fixing them happy.**

XTOC helps you navigate structured X Articles, save useful passages with their source context, and move your clips into an open format when you are done reading.

## Video demo

https://github.com/user-attachments/assets/b107995f-3b2a-4432-9530-48a93c886aa3

Watch the 40-second demo: navigate an article, save passages, edit tags and notes, and export clips.

[Try the interactive demo](https://xtoc.arieszhou.com/)

## How it works

1. **Navigate the article.** Open a long-form article and its contents appear in X's right column, above the recommendations, and stay in view while you read. In Focus mode they sit beside the article. Jump to any section from there or from the popup.
2. **Save a passage.** Select text and click `save to xtoc`. XTOC stores the passage locally with its article, author when available, timestamps, and surrounding context.
3. **Organize and export.** Open Library to search clips, add tags or notes, delete items, and export all or selected clips as Markdown or JSON.

## Features

- **Article navigation** — heading detection for X.com and Twitter.com long-form articles. Articles with two or more sections show a quiet contents module that follows X's Default or Lights out theme and accent color, highlights the current section, and collapses to one line. Its menu pops it out as a draggable floating panel that remembers its position, or hides it on articles (turn it back on in the popup or **Settings**). Narrow windows without X's right column show no module; use the popup or the floating panel there.
- **Clips** — select text and save it locally with one click, together with its article, author when available, timestamps and surrounding context.
- **Bookmarks** — save the current article or post with **Save to Bookmarks** in the popup, or import from your X Bookmarks page. Imports only read loaded previews and never change your X bookmarks.
  Repeat imports can stop at the previous import for the same account and list. **Scan all bookmarks** in the import menu checks older bookmarks too. The first run, an unrecognized list, or an invalid import record requires a full scan; page loading failures can still require a retry. On the Bookmarks page, the XTOC popup offers the same import controls and progress, so you can start again after closing the import bar. Keep the tab visible while importing; it waits while the tab is in the background.
- **Analytics** — for X Premium accounts, a clearer reading of your own X Analytics: the period in brief, reach and engagement trends, follows versus unfollows, separate account activity totals, content medians and top-post concentration, when your posts and your audience are most active, which formats work, which accounts your replies pay off with, captured incoming and outgoing interactions, and audience breakdowns. Overview, Content, Interactions and Audience have separate views. Date ranges use complete UTC days; incomplete periods are not compared. Missing metrics remain unknown. Posts show captured lifetime totals; relative scores require at least five earlier same-kind captures at 48–50 hours.
  **Sync from X** opens X Analytics in a background tab of the same browser, where you are signed in, so X loads its own data, then reads your Mentions timeline the same way; XTOC keeps a copy of those responses and closes the tab. It sends no requests of its own and needs no API key. If sync stops working, the account overview and content CSVs exported from X Analytics can be imported instead. Sync checks history in resumable date windows: first 56 daily totals, then up to one year available through X’s controls. Incomplete windows stay marked; missing values are never zero. Settings offers manual, daily-on-visit, or six-hour background updates; automatic updates are off by default and existing consent is preserved. Brief inactive tabs do not take focus; Pause stops automatic work. History stays in local IndexedDB, with the previous storage copy retained during migration. Repeated syncs build a longer history than X shows and record how each post grew; opening a post's own X analytics page adds its first 48 hours and audience. You can download a Markdown digest or, with AI set up, ask for a short reading that receives only aggregate numbers.
- **No reload after updates** — X tabs that were already open keep working when XTOC is installed or updated.

Open **Library** from the popup or the contents menu. It has four pages:

- **Clips** — search, tag, annotate, delete and export your saved passages.
- **Bookmarks** — search, tag, annotate, delete and export saved articles and posts.
- **Analytics** — your X account's performance, synced from X Analytics.
- **Settings** — article contents display, optional AI, daily analytics sync and local data.

Clips and bookmarks export as Obsidian-style Markdown: a ZIP with one note per article or post, YAML properties, tags, and clips as quote callouts. Clips can also be exported as JSON v1. You can export everything or only selected items.

Optional AI suggests up to three tags and a short summary for one bookmark at a time. In **Settings**, pick a provider (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, OpenRouter, Qwen, Moonshot Kimi, xAI Grok, or any OpenAI-compatible URL), paste your API key and connect; XTOC lists that provider's models and preselects a fast one. It sends only that bookmark's saved text and your existing tag names; notes are never sent. Nothing changes until you choose **Apply**. By default the key is kept only for the browser session; turn on **Remember on this device** to keep it encrypted in the extension's own storage on this device. It is never synced, exported or readable by X pages. Provider charges apply.

Everything stays in your browser, with no separate XTOC account; analytics data is never exported with clips and can be deleted in Settings. XTOC saves passages for later review; it does not restore highlights in the original article or sync clips to a cloud service.

## Install

Install XTOC from the [Chrome Web Store](https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb).

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/HiAriesZhou/xtoc.git
cd xtoc/apps/extension
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.

</details>

## Development

Run extension commands, including DashBye, from `apps/extension/`. Paths below are relative to that directory. The website lives in [`apps/web/`](apps/web/README.md); each app has its own npm lockfile, with no root workspace.

```bash
npm run dev
npm test
npm run build
```

For day-to-day debugging, `npm run build:dev` additionally writes `dist/chromium-dev` at the repository root (other builds stay in `apps/extension/dist/`): the same build renamed **XTOC (Development)** with an orange, striped toolbar icon, so it is easy to tell apart from the store version. Load that folder instead of `dist/chromium`; it gets its own extension ID and local storage, which stay with that folder path, so later `build:dev` runs update it in place. Release ZIPs always use the unbranded builds.

`npm run build:zip` builds Chrome and writes `release/xtoc-chrome-v<version>.zip` for store upload. It checks the archive, manifest version and production branding.

XTOC is maintained and tested for Chrome. The unpacked build uses Manifest V3 in `dist/chromium`.

## Privacy

Saved text, clips, tags, notes, settings and bookmark import progress (your X handle and recent bookmark IDs, so repeat imports can stop early) remain in `chrome.storage.local`; the `unlimitedStorage` permission keeps saved article bodies from hitting the default local quota and grants no site access. The `scripting` permission lets XTOC restart itself in X tabs that were already open when it is installed or updated, so they work without a reload; it adds no sites beyond X/Twitter. Exports are user-triggered downloads. Optional AI sends one bookmark's saved text and your tag names directly to the configured provider, only when you ask. AI host access is requested for that provider only; page scripts remain limited to X/Twitter. The API key lives in extension session storage, or, if you choose **Remember on this device**, encrypted (AES-GCM, non-extractable browser key) in the extension's IndexedDB; this keeps it out of plain-text files but does not protect against someone who controls the device. It is never synced, exported or saved with your library. **Remove key** deletes it everywhere and revokes that provider permission. There is no telemetry, X credential collection, cloud library storage or automatic upload.

## Project links

[Product website](https://xtoc.arieszhou.com) · [By AriesZhou](https://x.com/AriesZhou) · [Contributing](apps/extension/CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
