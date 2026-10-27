---
name: verify-xtoc
description: Verify XTOC's unpacked Chrome extension on local X-shaped HTTPS fixture pages and its secondary apps/web landing surface. Use for browser behavior checks, regression evidence, and local verification after changes; distinguish fixture proof from authenticated x.com validation.
---

# Verify XTOC

## Launch

Run from the repository root. The extension is the primary surface; the Next.js landing/demo is secondary. Read `AGENTS.md`, `README.md`, `apps/extension/package.json`, `src/manifest.json` and relevant implementation/tests (extension paths under `apps/extension`). Check `git status --short` first. This skill does not authorize publication. No extension source changes are needed for the fixture. If testing extension changes, apply the repository development-version policy before building; a skill-only change needs no version bump.

```bash
(cd apps/extension && npm ci && npm test && npm run build)
export XTOC_VERIFY_DEPS="$(node -p "require('node:path').join(require('node:os').tmpdir(), 'xtoc-verify-tools')")"
npm install --prefix "$XTOC_VERIFY_DEPS" --no-save playwright@1.64.1
node "$XTOC_VERIFY_DEPS/node_modules/playwright/cli.js" install chromium
node .agents/skills/verify-xtoc/scripts/verify.cjs doctor
node .agents/skills/verify-xtoc/scripts/verify.cjs run
```

`run` performs launch → doctor → drive → cleanup in one owned process. It starts a localhost HTTP fixture server on an ephemeral port, then Playwright's **full Chromium**, `channel: chromium`, headless, with `--disable-extensions-except=<absolute apps/extension/dist/chromium>` and `--load-extension=<same path>`. Do not use the headless-shell binary, which is not the extension test target. A fresh temporary profile isolates storage from the user's browser.

The harness fulfills exactly `https://x.com/xtoc_fixture/status/1234567890` with bytes fetched from that localhost server. This is network-boundary substitution: HTTPS origin and manifest matching remain real. It does not add localhost permission, inject content code manually, or contact X. The only other allowed page HTTP request is exactly `https://x.com/favicon.ico`, fulfilled locally with an empty 204 response to suppress the browser’s incidental favicon fetch. Both allowed URLs are recorded in `requests.json`; unexpected page HTTP requests fail the run. Synthetic author/text contain no credentials.

Ready signal: `READY: real extension content script attached; evidence …`, after the installed content script creates `#xtoc-save-excerpt-button`. Startup/selector/assertion failures produce nonzero exit and `failure.json`; preserve them, fix the cause, and rerun in a new directory. Teardown is the `finally` block, including on failed assertions; wait for `CLEANUP` before retrying.

For an existing external Playwright installation/full Chromium executable, override without editing the repo:

```bash
XTOC_VERIFY_DEPS=/path/to/playwright-install \
XTOC_VERIFY_CHROMIUM=/path/to/chrome \
node .agents/skills/verify-xtoc/scripts/verify.cjs run
```

`XTOC_VERIFY_DEPS` is a directory containing `node_modules/playwright`, not the package itself.

## Doctor

One read-only check:

```bash
node .agents/skills/verify-xtoc/scripts/verify.cjs doctor
```

It reads the generated MV3 manifest, verifies the X match and all declared content-script/CSS/background files, and prints the build location/version. It neither rebuilds nor writes storage. The same check runs after browser readiness and records `doctor.json` with the observed extension ID and content-script attachment. Doctor alone is not behavior proof.

## Drive

Read [the feature index](features/README.md), then the applicable journey. `run` implements the [clip capture](features/clips.md) journey with native mouse selection, a real button click, the real background writer, article reload, and the real Options page. `#passage` is a fixture-only input target; `#xtoc-save-excerpt-button`, its `data-state="saved"`, and Library `.row-text` are production selectors from `content/excerpt-capture.js` and `options/clips-view.js`.

The harness observes storage from the extension service worker using `chrome.storage.local.get`; it never seeds or writes storage to make assertions pass. Extend journeys through UI events, keeping assertions and cleanup intact. The other feature files specify additional checks, not automated coverage claims. Do not replace an unavailable toolbar/popup journey with a direct runtime message and call it equivalent.

## Evidence

Every run writes to `<evidence-root>/<timestamp>/`. Set `XTOC_VERIFY_EVIDENCE` to an evidence root outside the checkout and browser profile; the default is `path.join(os.tmpdir(), "xtoc-verify-evidence")`. Evidence must show a real user action and resulting state, plus persistent side effects where applicable. This harness produces:

- `01-selection-action.png`: selected text and visible save affordance.
- `02-saved-result.png`: clicked button's saved state.
- `03-library-persistence.png`: persisted clip in real Library after article reload.
- `result.json`: actions, selected text, storage before/after/reload, article relationship and context; assertions fail on missing or extra clips.
- `doctor.json`, `launch.json`, `console.json`, `errors.json`, `requests.json`, `cleanup.json`: build identity, isolation, logs, network and teardown. Failed runs also retain `failure.json`.

Inspect screenshots as well as JSON. A screenshot alone, empty error log, build success, direct handler call, or injected fake `chrome.*` API is not sufficient. Mock only production boundaries (here X's HTTP document); never mock storage, messaging, or extension UI. Record skipped flows explicitly. Check background/page errors; investigate unexpected errors rather than filtering them out to pass.

**Not established by this fixture:** authenticated/live X DOM compatibility, X SPA lifecycle, toolbar popup behavior, true browser restart persistence, Firefox/Edge runtime parity, AI provider permissions/network behavior, exports/deletion unless separately driven, or the website's responsive/accessibility behavior. Do not claim real-x.com validation without a separately authorized logged-in session. Opening Options by URL verifies Library rendering but does not prove the popup's Library button.

Run other repo checks when relevant:

```bash
(cd apps/extension && npm run build:firefox && npm run build:edge)
(cd apps/web && npm ci && npm run lint && npm run build)
```

There is no extension lint script. Builds are not cross-browser runtime proof. Keep check output in the same external evidence directory. No ZIP packaging, release, push, deployment, or store action is part of verification.

## Cleanup

The helper closes its own Playwright context and localhost server, removes only the temporary profile it created, and writes `cleanup.json`. Never kill processes by name, touch a user's browser profile, or delete evidence. For an interrupted run, signal only the recorded harness PID from `launch.json`; its SIGINT/SIGTERM handler awaits the same cleanup, then exits with status 130/143 respectively. Do not use `killall`/`pkill`. If force termination was necessary, inspect remaining child PIDs and ownership before stopping any of them, and record incomplete cleanup.

After `CLEANUP`, confirm the printed evidence directory still contains the PNGs, `result.json`, and `cleanup.json` with `browserClosed: true` (observed context `close` event), `fixtureServerClosed: true`, `profileRemoved: true`, and no `cleanupErrors`. Browser close, profile removal, and server close are attempted independently; cleanup errors make the run fail. Failed iterations must also finish cleanup before another launch. Evidence survives cleanup and local Git operations.

## Helpers

- Executable `scripts/verify.cjs doctor`: read-only build check.
- Executable `scripts/verify.cjs run`: complete headless clip proof, evidence capture, and teardown. Node.js 20+ and external Playwright/full Chromium are required; app lockfiles are not modified for harness dependencies.
- `assets/article-layout.html`: synthetic X article layout (right column with X's sticky behavior, Focus mode route, Lights out) for the inline contents checks in [navigation](features/navigation.md).
- `assets/article.html`: minimal synthetic X long-form DOM with article markers, author, timestamp, two headings and passage/context. Maintain its DOM against `content/page-utils.js` and `content/toc-extract.js`; never weaken the production selectors to fit it.
