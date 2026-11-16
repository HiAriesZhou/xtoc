# Extension UI styles

Popup, Library, Analytics and Settings load these styles in order:

1. `tokens.css`: shared type, spacing, control geometry, semantic colors and chart palettes. The dark mapping is Lights out.
2. `base.css`: document defaults, typography inheritance, icon sizing, focus and reduced motion.
3. `components.css`: buttons, fields, dropdowns, tabs, segmented controls, cards and toasts.
4. The page stylesheet: layout and feature-specific presentation.

Change a shared role in `tokens.css`, not in a page override. Reuse the component
classes and their states (`aria-current`, `aria-pressed`, `disabled`, `data-tone`)
before adding a new selector. `btn-sm` and `input-sm` use the compact size;
textareas keep their multiline height. Action background and foreground colors
are separate from link/accent colors so each pair can meet text contrast.

`icons.js` owns the extension-page icon vocabulary. Use 16px icons in controls
and 20px icons for larger standalone marks; control hit areas are independent
of the glyph size. Give icon-only actions an accessible name.

`tooling/build-pages.mjs` copies this directory alongside the native ES-module
pages. `ui-tokens.test.js` verifies token references and text contrast in both
themes; page build tests check JavaScript syntax. Validate rendered layouts,
keyboard focus and interactive states in Chrome after changing components.

These global document styles must not be injected into X pages. Content-script
components use isolated styles and the X page's own theme and accent.
