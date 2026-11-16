// Extension.js normalizes manifest UI entries to action/options paths and
// does not discover linked extension HTML. Copy the browser-native ES modules
// for our independent local pages after bundling content/background scripts.
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/chromium');
for (const dir of ['ui', 'options', 'library', 'analytics', 'settings', 'popup']) {
  await cp(path.join(root, 'src', dir), path.join(out, dir), { recursive: true });
}
await cp(path.join(root, 'src/analytics-db.js'), path.join(out, 'analytics-db.js'));
const manifestPath = path.join(out, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.options_page = 'settings/index.html';
manifest.action.default_popup = 'popup/index.html';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
