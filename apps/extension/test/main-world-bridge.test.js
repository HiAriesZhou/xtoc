import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// Extension.js 3.7 names a bridge script content_scripts/content-<N>.js for each
// world: MAIN entry (N counts on from the number of manifest entries) but never
// emits it. public/ supplies a placeholder at exactly that path.
test('every MAIN-world content script has its Extension.js bridge placeholder', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts || [];
  const bridges = scripts
    .filter((script) => script.world === 'MAIN')
    .map((_, i) => `content_scripts/content-${scripts.length + i}.js`);
  assert.ok(bridges.length > 0);
  for (const file of bridges) assert.ok(fs.existsSync(path.join(root, 'public', file)), `public/${file} is missing`);
});
