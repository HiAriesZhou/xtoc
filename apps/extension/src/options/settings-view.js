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

  async function showAnalyticsPrefs() {
    try {
      const { prefs } = await ctx.rpc('analytics:load');
      const input = main.querySelector('[data-action="sync-mode"]');
      input.value = prefs.mode || (prefs.autoSync ? 'visit' : 'manual');
      input.disabled = false;
    } catch {
      // Background unavailable; the toggle stays off.
    }
  }

  async function setSyncMode(mode) {
    try { await ctx.rpc('analytics:prefs', { mode }); ctx.toast(mode === 'background' ? 'Background updates enabled. You can pause them in Analytics.' : 'Automatic update preference saved.'); }
    finally { await showAnalyticsPrefs(); }
  }

  async function downloadDiagnostics() {
    const report = await ctx.rpc('analytics:diagnostics');
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `xtoc-analytics-diagnostics-${Date.now()}.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function clearAnalytics() {
    if (!confirm('Delete all analytics XTOC stored on this device? Your X account is not affected.')) return;
    await ctx.rpc('analytics:clear', {});
    ctx.toast('Analytics data deleted.');
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
      <section class="card" id="analyticsCard">
        <div class="card-head"><h2>Analytics</h2></div>
        <p class="subtle">Sync reads your own X Analytics (X Premium) by opening its pages in a background tab of this browser. Data stays on this device.</p>
        <label class="sync-preference"><span>Automatic updates<small>Inactive X tabs may briefly appear. They do not take focus. Browser sleep delays updates; missed runs are combined on return.</small></span>
          <select class="input" data-action="sync-mode" aria-label="Automatic analytics updates" disabled>
            <option value="manual">Manual only</option><option value="visit">Daily when I open X</option><option value="background">Every 6 hours while Chrome is running</option>
          </select></label>
        <p class="hint">Off by default. Existing daily-on-visit preferences stay unchanged. Sync reads only the selected signed-in account, saves history locally, and stops if login or account access changes.</p>
        <div class="inline-actions start"><button class="btn btn-ghost-danger" type="button" data-action="clear-analytics">Delete all analytics data</button></div>
      </section>
      <section class="card" id="sampleData" hidden>
        <div class="card-head"><h2>Sample data</h2><span class="badge">Development build</span></div>
        <p class="subtle">Adds 20 sample clips for testing. Remove deletes only sample items.</p>
        <div class="inline-actions start">
          <button class="btn btn-secondary" type="button" data-action="seed-load">Load sample clips</button>
          <button class="btn btn-ghost-danger" type="button" data-action="seed-remove">Remove sample data</button>
        </div>
        <p class="subtle">Analytics diagnostics: the structure of the last X responses (field names and types, no values) and stored counts, for checking the parsers.</p>
        <div class="inline-actions start">
          <button class="btn btn-secondary" type="button" data-action="analytics-diagnostics">Download analytics diagnostics</button>
        </div>
      </section>`;
    createAISettings(ctx, main.querySelector('#aiCard'));
    main.onclick = (event) => {
      if (event.target.closest('[data-action="clear-analytics"]')) return ctx.guard(clearAnalytics)();
      if (event.target.closest('[data-action="analytics-diagnostics"]')) return ctx.guard(downloadDiagnostics)();
      const action = event.target.closest('#sampleData [data-action]')?.dataset.action;
      if (action) ctx.guard(() => runSeed(action === 'seed-remove' ? 'remove' : 'load'))();
    };
    main.onchange = (event) => {
      if (event.target.matches('[data-action="sync-mode"]')) ctx.guard(() => setSyncMode(event.target.value))();
    };
    showAnalyticsPrefs();
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
