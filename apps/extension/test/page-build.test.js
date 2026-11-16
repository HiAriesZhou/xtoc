import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
test('independent page ES modules are valid Chrome JavaScript', () => {
  for (const dir of ['options','popup','settings','analytics','library']) {
    for (const file of readdirSync(path.join(root,'src',dir))) if (file.endsWith('.js')) execFileSync(process.execPath,['--check',path.join(root,'src',dir,file)]);
  }
});
test('all independent pages declare local shell assets and legacy links retain a route', () => {
  for (const dir of ['library','analytics','settings']) {
    const html = readFileSync(path.join(root,'src',dir,'index.html'),'utf8');
    assert.match(html, /library-page.js/); assert.match(html, /library.css/);
  }
  const redirect = readFileSync(path.join(root,'src/options/redirect.js'),'utf8');
  assert.match(redirect,/location.replace/); assert.match(redirect,/bookmarks/);
});
