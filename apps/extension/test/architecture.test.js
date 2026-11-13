import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pureDirs = ['../src/library', '../src/analytics'].map((dir) => path.resolve(import.meta.dirname, dir));

test('src/library and src/analytics stay independent of the content script and Library page', () => {
  for (const file of pureDirs.flatMap((dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.js')).map((name) => path.join(dir, name)))) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    for (const target of imports) {
      assert.doesNotMatch(target, /\.\.\/(options|content|popup)\//, `${file} imports ${target}`);
    }
  }
});
