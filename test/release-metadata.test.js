import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));

const packageVersion = readJson('package.json').version;

test('extension, package, and README versions agree', () => {
  assert.equal(readJson('src/manifest.json').version, packageVersion);
  const lock = readJson('package-lock.json');
  assert.equal(lock.version, packageVersion, 'package-lock.json');
  assert.equal(lock.packages[''].version, packageVersion, 'package-lock.json root package');

  const escaped = packageVersion.replaceAll('.', '\\.');
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    assert.match(readText(readme), new RegExp(`version-${escaped}-[^"]+" alt="Version ${escaped}"`), readme);
  }

});
