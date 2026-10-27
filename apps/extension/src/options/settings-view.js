import { SEED_PATH } from '../library/dev-seed.js';
import { TOC_PREFS_KEY, normalizeTocPrefs } from '../library/toc-prefs.js';
import { createAISettings } from './ai-settings.js';

// Keeps the checkbox current when a tab hides or shows the contents.
chrome.storage.onChanged.addListener((changes, area) => {
  const input = document.getElementById('autoShowContents');
  if (area !== 'local' || !changes[TOC_PREFS_KEY] || !input) return;
  input.checked = normalizeTocPrefs(changes[TOC_PREFS_KEY].newValue).autoShow;
});

export function createSettingsView(ctx) {
  let main = null;

  // Only development builds package the seed file; release builds hide the card.
  async function showSampleData() {
    try {
      const response = await fetch(chrome.runtime.getURL(SEED_PATH), { method: 'HEAD' });
      main.querySelector('#sampleData').hidden = !response.ok;
    } catch {
      // Missing file: release build.
    }
  }

  // A display preference read and written by the content script too, so it is
  // stored directly rather than through the background's Library transaction.
  async function bindContentsToggle() {
    const input = main.querySelector('#autoShowContents');
    const stored = await chrome.storage.local.get(TOC_PREFS_KEY);
    input.checked = normalizeTocPrefs(stored[TOC_PREFS_KEY]).autoShow;
    input.disabled = false;
    input.onchange = ctx.guard(async () => {
      const current = await chrome.storage.local.get(TOC_PREFS_KEY);
      const prefs = { ...normalizeTocPrefs(current[TOC_PREFS_KEY]), autoShow: input.checked };
      await chrome.storage.local.set({ [TOC_PREFS_KEY]: prefs });
      ctx.toast(input.checked ? 'Contents will show beside articles.' : 'Contents hidden beside articles.');
    });
  }

  async function runSeed(mode) {
    const result = await ctx.rpc('library:seed', { mode });
    await ctx.reload();
    if (mode === 'remove') ctx.toast(`Removed ${result.removed} sample clips.`);
    else
      ctx.toast(
        result.added ? `Added ${result.added} sample clips.` : 'Sample clips are already loaded.'
      );
  }

  function render() {
    main.innerHTML = `
      <div class="page-top"><header class="page-head"><div class="page-title"><h1>Settings</h1></div></header></div>
      <section class="card" id="contentsCard">
        <div class="card-head"><h2>Article contents</h2></div>
        <label class="check-row">
          <input class="check" type="checkbox" id="autoShowContents" disabled>
          <span>Show contents beside articles<small>A quiet contents list in X's right column, or beside the article in Focus mode.</small></span>
        </label>
      </section>
      <section class="card" id="aiCard"></section>
      <section class="card" id="sampleData" hidden>
        <div class="card-head"><h2>Sample data</h2><span class="badge">Development build</span></div>
        <p class="subtle">Adds 20 sample clips for testing. Remove deletes only sample items.</p>
        <div class="inline-actions start">
          <button class="btn btn-secondary" type="button" data-action="seed-load">Load sample clips</button>
          <button class="btn btn-ghost-danger" type="button" data-action="seed-remove">Remove sample data</button>
        </div>
      </section>`;
    createAISettings(ctx, main.querySelector('#aiCard'));
    main.onclick = (event) => {
      const action = event.target.closest('#sampleData [data-action]')?.dataset.action;
      if (action) ctx.guard(() => runSeed(action === 'seed-remove' ? 'remove' : 'load'))();
    };
    main.onchange = null;
    main.oninput = null;
    showSampleData();
    ctx.guard(bindContentsToggle)();
  }

  return {
    render(container) {
      main = container;
      render();
    }
  };
}
