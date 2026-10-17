# Public landing and demo

## Sub-features

Landing navigation, product-film dialog, interactive article demo, privacy page, mobile/desktop layout and keyboard focus. Source: `apps/web/src/components/xtoc-experience.tsx` and `apps/web/src/app`.

## How to get to it (user POV)

Open the homepage, play the product film, close it, navigate to Article/Clips/Docs and Privacy. The website demo is separate from the installed extension.

## Driving it with Playwright

After `npm ci`, `npm run lint`, and `npm run build` in `apps/web`, launch `npm run start -- --hostname 127.0.0.1 --port 3019` there and record the started process PID. Ready signal is Next.js `Ready` plus HTTP 200 at `http://127.0.0.1:3019/`. Use a separate Playwright browser context (the extension helper intentionally blocks non-fixture network). At 1440×900 and 390×900, click `getByRole('button', {name: 'Play the 40-second XTOC product film'})`. Require the `XTOC product film` dialog and focused `Close video` button; cycle Tab/Shift+Tab, press Escape and verify focus returns to the trigger. Navigate local links to `/article`, `/clips`, `/docs`, `/privacy`; assert destination URL, visible headings, and no horizontal overflow. Capture each action/result and console errors in the external evidence directory. Review semantics, contrast and focus visually too.

## Gotchas

Do not follow store links to install or change listings. The demo's clips do not prove extension storage or messaging. Responsive screenshots alone do not prove keyboard operation. Stop only the server/browser processes you started (prefer an owned child-process handle and graceful termination); never kill by process name, and never delete screenshots. Website browser checks are not included in `verify.cjs run`.
