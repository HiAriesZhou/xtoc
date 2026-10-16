<h1 align="center">
  <img src="public/wordmark.svg" width="280" alt="XTOC"><br>
  Landing Page
</h1>

<p align="center">
  Public website for XTOC, a browser extension for reading navigation and lightweight clipping on X/Twitter long-form articles.
</p>

<p align="center">
  English · <a href="README.zh-CN.md">中文</a>
</p>

## Repository Role

This repository contains the public landing page and public docs for XTOC.

- Extension source: <https://github.com/HiAriesZhou/x-toc>
- Website source: <https://github.com/HiAriesZhou/x-toc-landing-page>
- Chrome Web Store: <https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb>

## Public Product Copy

XTOC adds a table of contents, a movable reading panel, and lightweight local clipping to X/Twitter long-form articles.

Public-facing claims should stay aligned with the released extension:

- Detect headings in X/Twitter long-form articles.
- Show the current article table of contents in the popup.
- Pin and drag a floating TOC panel while reading.
- Save selected article text with `save to xtoc`.
- Review saved clips in the Options page.
- Export all or selected clips as Markdown or JSON.
- Store saved clips locally with `chrome.storage.local`.
- Do not send saved clips to an external server.

- Privacy policy: [x-toc.vercel.app/privacy](https://x-toc.vercel.app/privacy)

## Development

```bash
npm run dev
npm run lint
npm run build
```

## Content Guidelines

- Keep this README as an entry point.
- Keep public website copy aligned with the released XTOC extension.
- Keep unreleased planning in private docs.
- Do not describe unreleased integrations as shipped product features.
