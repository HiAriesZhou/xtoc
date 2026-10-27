// Shadow DOM styles for the inline contents. Colors, borders, radii and type
// sizes follow X's own right-column modules in its Default and Lights out themes.
export const INLINE_TOC_STYLES = `
  :host {
    --xtoc-border: rgb(239, 243, 244);
    --xtoc-text: rgb(15, 20, 25);
    --xtoc-muted: rgb(83, 100, 113);
    --xtoc-hover: rgba(15, 20, 25, 0.03);
    --xtoc-menu-shadow: rgba(101, 119, 134, 0.2) 0 0 15px, rgba(101, 119, 134, 0.15) 0 0 3px 1px;
    display: block;
    box-sizing: border-box;
    color: var(--xtoc-text);
    font: inherit;
    -webkit-font-smoothing: antialiased;
  }

  :host([data-theme="dark"]) {
    --xtoc-border: rgb(47, 51, 54);
    --xtoc-text: rgb(231, 233, 234);
    --xtoc-muted: rgb(113, 118, 123);
    --xtoc-hover: rgba(231, 233, 234, 0.03);
    --xtoc-menu-shadow: rgba(255, 255, 255, 0.2) 0 0 15px, rgba(255, 255, 255, 0.15) 0 0 3px 1px;
  }

  *, *::before, *::after { box-sizing: border-box; }

  button {
    margin: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--xtoc-accent);
    outline-offset: -2px;
  }

  .card {
    position: relative;
    border: 1px solid var(--xtoc-border);
    border-radius: 16px;
    background: var(--xtoc-bg);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px 6px 4px;
  }

  .toggle {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 8px;
    border-radius: 12px;
    padding: 6px 12px;
    text-align: left;
  }

  .toggle:hover,
  .more:hover,
  .more[aria-expanded="true"] { background: var(--xtoc-hover); }

  .title {
    color: var(--xtoc-muted);
    font-size: 15px;
    font-weight: 700;
    line-height: 20px;
  }

  .count {
    color: var(--xtoc-muted);
    font-size: 13px;
    line-height: 16px;
  }

  .chevron {
    width: 16px;
    height: 16px;
    margin-left: auto;
    color: var(--xtoc-muted);
    transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .collapsed .chevron { transform: rotate(-90deg); }

  .more {
    display: grid;
    flex: none;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 999px;
    color: var(--xtoc-muted);
  }

  .more svg { width: 18px; height: 18px; }

  .curtain {
    display: grid;
    grid-template-rows: 1fr;
    opacity: 1;
    transition:
      grid-template-rows 0.26s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.16s ease;
  }

  .collapsed .curtain {
    grid-template-rows: 0fr;
    opacity: 0;
  }

  .curtain-inner {
    min-height: 0;
    overflow: hidden;
  }

  .body {
    max-height: var(--xtoc-list-max, 60vh);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--xtoc-border) transparent;
  }

  .toc-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc-row { margin: 0; }

  .toc-item {
    display: block;
    width: 100%;
    padding: 7px 16px;
    color: var(--xtoc-muted);
    font-size: 15px;
    line-height: 20px;
    text-align: left;
    overflow-wrap: anywhere;
    transition: color 0.12s ease, background-color 0.12s ease;
  }

  .toc-item:hover {
    background: var(--xtoc-hover);
    color: var(--xtoc-text);
  }

  .toc-item.active {
    box-shadow: inset 2px 0 0 var(--xtoc-accent);
    color: var(--xtoc-text);
    font-weight: 600;
  }

  .level-1 .toc-item { padding-left: 16px; }
  .level-2 .toc-item { padding-left: 28px; }
  .level-3 .toc-item { padding-left: 40px; font-size: 14px; }
  .level-4 .toc-item { padding-left: 52px; font-size: 13px; }

  .toc-empty,
  .notice {
    margin: 0;
    padding: 4px 16px 12px;
    color: var(--xtoc-muted);
    font-size: 13px;
    line-height: 18px;
  }

  .menu {
    position: absolute;
    z-index: 1;
    top: 44px;
    right: 8px;
    min-width: 220px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--xtoc-bg);
    box-shadow: var(--xtoc-menu-shadow);
  }

  .menu[hidden] { display: none; }

  .menu button {
    display: block;
    width: 100%;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 700;
    line-height: 20px;
    text-align: left;
  }

  .menu button:hover,
  .menu button:focus-visible { background: var(--xtoc-hover); }

  @media (prefers-reduced-motion: reduce) {
    .curtain,
    .chevron,
    .toc-item { transition: none; }
  }
`;
