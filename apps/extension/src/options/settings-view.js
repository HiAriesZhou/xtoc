import { viewAccount } from '../analytics/view-account.js';
import { SEED_PATH } from '../library/dev-seed.js';
import { TOC_PREFS_KEY, normalizeTocPrefs } from '../library/toc-prefs.js';
import { createAISettings } from './ai-settings.js';

// Keeps the checkbox current when a tab hides or shows the contents.
chrome.storage.onChanged.addListener((changes, area) => {
  const input = document.getElementById('autoShowContents');
  if (area !== 'local' || !changes[TOC_PREFS_KEY] || !input) return;
  input.checked = normalizeTocPrefs(changes[TOC_PREFS_KEY].newValue).autoShow;
});

export function createSettingsView(ctx, { analyticsOnly = false } = {}) {
  let main = null;
  let accountId = '';

  // Only development builds package the seed file; release builds hide the card.
  async function showSampleData() {
    if (!/Development/.test(chrome.runtime.getManifest().name)) return;
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
    const result = await ctx.rpc('library:seed', { mode, accountId });
    await ctx.reload();
    if (mode === 'remove') ctx.toast(`Removed ${result.removed} sample clips.`);
    else
      ctx.toast(
        result.added ? `Added ${result.added} sample clips.` : 'Sample clips are already loaded.'
      );
  }

  async function showAnalyticsPrefs() {
    try {
      const { prefs, data, sync } = await ctx.rpc('analytics:load');
      const accounts = Object.values(data.accounts);
      const remembered = (await chrome.storage.local.get('xtocAnalyticsViewAccount')).xtocAnalyticsViewAccount;
      accountId = viewAccount(accounts, { query:new URLSearchParams(location.search).get('account'), remembered, current:accountId, bound:prefs.accountId });
      const picker = main.querySelector('[data-action=sync-account]');
      picker.replaceChildren(...accounts.map(a => { const option = document.createElement('option'); option.value = a.id; option.textContent = '@' + (a.handle || a.id); return option; })); picker.value = accountId;
      const q = sync.accounts?.[accountId] || {};
      const meta = accounts.find(a => a.id === accountId);
      main.querySelector('#dataCounts').textContent = meta ? `${meta.counts?.daily || 0} days · ${meta.counts?.posts || 0} posts saved locally. Missing days remain unknown.` : 'No account saved yet. Sync from X to start.';
      main.querySelector('#dataStatus').textContent = `${sync.running ? 'Syncing' : q.paused ? 'Paused' : 'Idle'} · ${Object.keys(q.windows || {}).length} windows checked · ${q.pending?.length || 0} queued${q.error ? ' · ' + q.error : ''}`;
      const input = main.querySelector('[data-action="sync-mode"]');
      input.value = prefs.mode || (prefs.autoSync ? 'visit' : 'manual');
      input.disabled = false;
    } catch {
      // Background unavailable; the toggle stays off.
    }
  }

  async function setSyncMode(mode) {
    try { await ctx.rpc('analytics:prefs', { mode, accountId }); ctx.toast(mode === 'background' ? 'Background updates enabled. You can pause them in Analytics.' : 'Automatic update preference saved.'); }
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
    if (!accountId || !confirm('Delete local analytics for the selected account? Your X account is not affected.')) return;
    await ctx.rpc('analytics:clear', { accountId });
    accountId = '';
    await showAnalyticsPrefs();
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
        <div class="card-head"><h2>Account data</h2></div><label>Account <select class="input" data-action="sync-account" aria-label="Sync account"></select></label><p class="hint" id="dataCounts"></p><p class="hint" id="dataStatus" role="status"></p><div class="inline-actions start"><button class="btn btn-primary" data-action="sync-now">Sync from X</button><button class="btn btn-secondary" data-action="pause-sync">Pause sync</button><label class="btn btn-secondary">Import X CSV<input type="file" accept=".csv,text/csv" multiple hidden data-action="import-data"></label></div>
        <p class="subtle">Sync reads your own X Analytics (X Premium) by opening its pages in a background tab of this browser. Data stays on this device.</p>
        <label class="sync-preference"><span>Automatic updates<small>Inactive X tabs may briefly appear. They do not take focus. Browser sleep delays updates; missed runs are combined on return.</small></span>
          <select class="input" data-action="sync-mode" aria-label="Automatic analytics updates" disabled>
            <option value="manual">Manual only</option><option value="visit">Daily when I open X</option><option value="background">Every 6 hours while Chrome is running</option>
          </select></label>
        <p class="hint">Off by default. Existing daily-on-visit preferences stay unchanged. Sync reads only the selected signed-in account, saves history locally, and stops if login or account access changes.</p>
        <div class="inline-actions start"><button class="btn btn-ghost-danger" type="button" data-action="clear-analytics">Delete selected account data</button></div>
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
    if (analyticsOnly) {
      main.querySelector('.page-title h1').textContent = 'Data & Sync';
      main.querySelector('#contentsCard').remove(); main.querySelector('#aiCard').remove(); main.querySelector('#sampleData').remove();
    } else {
      main.querySelector('#analyticsCard').remove();
      main.insertAdjacentHTML('beforeend', `<section class="card"><h2>About XTOC</h2><p class="subtle">Version ${chrome.runtime.getManifest().version}. Your library and analytics stay on this device. AI sends selected text or aggregates only when you request it.</p><a href="https://github.com/HiAriesZhou/xtoc" target="_blank" rel="noopener noreferrer">Help and source on GitHub</a></section>`);
      createAISettings(ctx, main.querySelector('#aiCard'));
    }
    main.onclick = (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'sync-now' || action === 'pause-sync') return ctx.guard(async () => { await ctx.rpc(action === 'sync-now' ? 'analytics:sync' : 'analytics:pause', { accountId }); await showAnalyticsPrefs(); })();
      if (event.target.closest('[data-action="clear-analytics"]')) return ctx.guard(clearAnalytics)();
      if (event.target.closest('[data-action="analytics-diagnostics"]')) return ctx.guard(downloadDiagnostics)();
      const seedAction = event.target.closest('#sampleData [data-action]')?.dataset.action;
      if (seedAction) ctx.guard(() => runSeed(seedAction === 'seed-remove' ? 'remove' : 'load'))();
    };
    main.onchange = (event) => {
      if (event.target.matches('[data-action=sync-account]')) { accountId = event.target.value; const url = new URL(location.href); url.searchParams.set('account',accountId); history.replaceState(null,'',url); chrome.storage.local.set({ xtocAnalyticsViewAccount:accountId }); showAnalyticsPrefs(); }
      if (event.target.matches('[data-action=import-data]')) ctx.guard(async () => {
        for (const file of event.target.files) { if (file.size > 10 * 1024 * 1024) throw Error('Choose a CSV under 10 MB.'); await ctx.rpc('analytics:importCsv', { text:await file.text(), accountId }); }
        event.target.value = ''; await showAnalyticsPrefs(); ctx.toast('CSV imported.');
      })();
      if (event.target.matches('[data-action="sync-mode"]')) ctx.guard(() => setSyncMode(event.target.value))();
    };
    if (analyticsOnly) showAnalyticsPrefs();
    main.oninput = null;
    if (!analyticsOnly) { showSampleData(); ctx.guard(bindContentsToggle)(); }
  }

  return {
    render(container) {
      main = container;
      render();
    }
  };
}
