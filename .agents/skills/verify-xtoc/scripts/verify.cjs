#!/usr/bin/env node
// All fixture substitution is at the HTTP boundary; extension code is unmodified.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../..');
const build = path.join(root, 'apps/extension/dist/chromium');
function doctor() {
  const manifest = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert(manifest.content_scripts.some(s => s.matches.includes('https://x.com/*')));
  for (const s of manifest.content_scripts) for (const f of [...s.js, ...(s.css || [])]) assert(fs.existsSync(path.join(build, f)), f);
  assert(fs.existsSync(path.join(build, manifest.background.service_worker)));
  return { manifestVersion: manifest.manifest_version, version: manifest.version, build };
}
if (process.argv[2] === 'doctor') { console.log(JSON.stringify(doctor(), null, 2)); process.exit(0); }
if (process.argv[2] !== 'run') { console.error('Usage: verify.cjs doctor|run'); process.exit(2); }
const evidence = path.join(process.env.XTOC_VERIFY_EVIDENCE || path.join(os.tmpdir(), 'xtoc-verify-evidence'), new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2));
const events = [], errors = [], requests = [];
let context, server, profile, interrupted, launchPromise, cleanupPromise;
let browserClosed = false;
function cleanup() {
  return cleanupPromise ||= (async () => {
    const cleanupErrors = [];
    const record = (resource, error) => cleanupErrors.push({ resource, message: error.message });
    // A signal during launch must wait for the owned context before closing it.
    if (launchPromise) {
      try { await launchPromise; } catch { /* Reported by the run's failure handler. */ }
    }
    try { if (context) await context.close(); } catch (error) { record('browser', error); }
    try { if (profile) fs.rmSync(profile, { recursive: true, force: true }); } catch (error) { record('profile', error); }
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } catch (error) { record('fixtureServer', error); }
    const profileRemoved = profile ? !fs.existsSync(profile) : null;
    if (context && !browserClosed) record('browser', new Error('Context close event was not observed'));
    write('console.json', events); write('errors.json', errors); write('requests.json', requests);
    write('cleanup.json', {
      browserStarted: !!context, browserClosed, profileRemoved,
      fixtureServerClosed: !server || !server.listening,
      evidenceRetained: fs.existsSync(evidence), interrupted: interrupted || null, cleanupErrors
    });
    if (cleanupErrors.length) process.exitCode = 1;
    console.log(`CLEANUP: cleanup finished; evidence retained at ${evidence}`);
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = signal;
  write('failure.json', { message: `Interrupted by ${signal}` });
  cleanup().then(() => process.exit(signal === 'SIGINT' ? 130 : 143))
    .catch(error => { console.error(error); process.exit(1); });
});
(async () => {
  const requireHarness = createRequire(path.join(process.env.XTOC_VERIFY_DEPS || path.join(os.tmpdir(), 'xtoc-verify-tools'), 'package.json'));
  const { chromium } = requireHarness('playwright');
  const fixture = fs.readFileSync(path.join(__dirname, '../assets/article.html'));
  server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xtoc-verify-profile-'));
  write('launch.json', { harnessPid: process.pid, profile, fixturePort: server.address().port, build, headless: true });
  launchPromise = chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    // Let the harness finish evidence/profile cleanup before exiting on signals.
    handleSIGINT: false, handleSIGTERM: false,
    ...(process.env.XTOC_VERIFY_CHROMIUM ? { executablePath: process.env.XTOC_VERIFY_CHROMIUM } : {}),
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`]
  }).then(launched => {
    context = launched;
    context.once('close', () => { browserClosed = true; });
    return context;
  });
  await launchPromise;
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
  context.on('weberror', e => errors.push({ source: e.page()?.url() || 'worker', message: e.error().message }));
  context.on('console', m => {
    const entry = { source: m.page()?.url() || 'worker', type: m.type(), text: m.text() };
    events.push(entry);
    if (m.type() === 'error') errors.push(entry);
  });
  // Serve localhost bytes as an HTTPS X document. No real X traffic or login.
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (!/^https?:/.test(url)) return route.continue();
    requests.push(url);
    if (url === 'https://x.com/xtoc_fixture/status/1234567890') {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/article`);
      return route.fulfill({ status: 200, contentType: 'text/html', body: await response.text() });
    }
    if (url === 'https://x.com/favicon.ico') return route.fulfill({ status: 204, body: '' });
    errors.push({ source: 'network', message: `Unexpected request: ${url}` });
    return route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const cdp = await context.newCDPSession(context.pages()[0]);
  await cdp.send('Log.enable');
  cdp.on('Log.entryAdded', ({entry}) => { if (entry.level === 'error') errors.push({source:'browser',message:entry.text}); });
  const page = context.pages()[0];
  await page.goto('https://x.com/xtoc_fixture/status/1234567890');
  await page.locator('#xtoc-save-excerpt-button').waitFor({ state: 'attached' });
  console.log(`READY: real extension content script attached; evidence ${evidence}`);
  const id = new URL(worker.url()).hostname;
  write('doctor.json', { ...doctor(), extensionId: id, pageUrl: page.url(), contentScriptAttached: true });
  console.log('DOCTOR PASS');
  const readStorage = () => worker.evaluate(() => chrome.storage.local.get(['twitterTocArticles', 'twitterTocExcerpts']));
  const before = await readStorage();
  assert.equal(Object.keys(before.twitterTocExcerpts || {}).length, 0);
  const passage = page.locator('#passage');
  // Native mouse triple-click selects a paragraph, exercising selectionchange/mouseup.
  await passage.click({ clickCount: 3 });
  const selected = (await page.evaluate(() => window.getSelection().toString())).trim();
  assert.equal(selected, 'A saved passage stays connected to its source article.');
  await page.locator('#xtoc-save-excerpt-button').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidence, '01-selection-action.png') });
  await page.locator('#xtoc-save-excerpt-button').click();
  await page.locator('#xtoc-save-excerpt-button[data-state="saved"]').waitFor();
  await page.screenshot({ path: path.join(evidence, '02-saved-result.png') });
  const saved = await readStorage();
  const clips = Object.values(saved.twitterTocExcerpts || {});
  assert.equal(clips.length, 1); assert.equal(clips[0].text, selected);
  assert.equal(saved.twitterTocArticles[clips[0].articleId].canonicalUrl, page.url());
  assert(clips[0].contextAfter.includes('surrounding context'));
  await page.reload();
  await page.locator('#xtoc-save-excerpt-button').waitFor({ state: 'attached' });
  assert.deepEqual(await readStorage(), saved);
  // Open the real Options URL, equivalent to navigating to extension options.
  const library = await context.newPage();
  await library.goto(`chrome-extension://${id}/options/index.html`);
  await library.locator('.row-text').filter({ hasText: selected }).waitFor();
  await library.screenshot({ path: path.join(evidence, '03-library-persistence.png') });
  write('result.json', { feature: 'select → save → reload → Library', selected, before, saved, afterReload: await readStorage(), actions: ['native paragraph selection', 'click #xtoc-save-excerpt-button', 'reload article', 'open Options and verify .row-text'], realXVerified: false });
  assert.deepEqual(errors, []);
  console.log('DRIVE PASS: clip save, article relationship, context, reload persistence, Library');
})().catch(e => { write('failure.json', { message: e.message, stack: e.stack }); process.exitCode = 1; })
  .finally(cleanup).catch(error => { console.error(error); process.exitCode = 1; });
