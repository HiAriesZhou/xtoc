---
name: release-xtoc
description: Prepares XTOC Chrome Web Store drafts with DashBye after the release commit is merged and tagged. Use only when the user has authorized a Chrome Web Store draft; submitting for review stays with the user.
---

# XTOC store draft

Run from `apps/extension/`, with `NO_PROXY=127.0.0.1,localhost` when the shell has a proxy. Chrome Web Store is the only maintained store target. The merge, tag and GitHub Release come first and follow `AGENTS.md`.

1. **Packages.**
   - Run `npm run build:zip` from a clean checkout at the release commit.
2. **Config.** Point the Chrome `artifact` path in `dashbye.config.yml` at the new version's ZIP.
3. **Listing copy.**
   - Check that `store/listing/en/description.txt` describes the new user-visible behavior and nothing that was removed.
   - Rewrite only behavior verified in the current implementation.
4. **Validate.** `dashbye validate --store chrome`. Any manifest change against the baseline must be an expected one.
5. **Plan.**
   - `dashbye plan --store chrome --non-interactive` opens DashBye's dedicated Chrome.
   - If it reports that a manual login is required, ask the user once to log in on that window.
   - Move that window only through CDP `Browser.setWindowBounds`, setting `windowState: "normal"` first; never move Chrome as an app.
6. **Review the plan.** Its operations must be exactly the intended ones: the package upload and the listing fields that changed.
7. **Sync.** `dashbye sync-draft --store chrome --approve-plan <top-level approvalHash> --non-interactive`.
8. **Read back.**
   - Run `plan` again: `operations: []` proves the draft matches.
   - Commit `store/releases/<version>.lock.json`, the config and the listing change as one release-metadata commit.
9. **Close.**
   - Close DashBye's Chrome with CDP `Browser.close`, which keeps its login.
   - Report the Chrome draft state. The user submits for review unless they delegate it explicitly.

After the version is live in the Chrome Web Store, clean up older release ZIPs as described in `AGENTS.md` ("Release package cleanup").
