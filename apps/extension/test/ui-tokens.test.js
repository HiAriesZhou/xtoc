import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const src = path.resolve(import.meta.dirname, '../src');
const tokens = readFileSync(path.join(src, 'ui/tokens.css'), 'utf8');
const files = ['ui', 'options', 'popup'].flatMap(dir => readdirSync(path.join(src, dir)).filter(f => /\.(css|js)$/.test(f)).map(f => path.join(src, dir, f)));

test('extension UI token references resolve to the shared source', () => {
  // --w is a per-datum chart width, not a design token.
  const defined = new Set([...tokens.matchAll(/(--xtoc-[\w-]+)\s*:/g)].map(m => m[1]));
  defined.add('--w');
  for (const file of files) {
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/var\((--[\w-]+)/g)) assert(defined.has(match[1]), `${file}: unresolved ${match[1]}`);
    if (file.endsWith('.css') && !file.endsWith('tokens.css')) assert.doesNotMatch(css, /--xtoc-[\w-]+\s*:/, `Theme definitions must stay in tokens.css: ${file}`);
  }
});

const luminance = hex => {
  const channels = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
test('shared text and action colors meet normal-text contrast in both themes', () => {
  const [light, dark] = tokens.split('@media');
  const values = text => Object.fromEntries([...text.matchAll(/--xtoc-([\w-]+):\s*#([\da-f]{6});/g)].map(m => [m[1], m[2]]));
  for (const theme of [values(light), { ...values(light), ...values(dark) }]) {
    for (const [fg, bg] of [['text','surface'],['text-muted','surface'],['text-muted','canvas'],['accent','surface'],['accent','accent-tint'],['on-action','action'],['on-action','action-hover'],['on-action','danger-action']]) {
      const a = luminance(theme[fg]), b = luminance(theme[bg]);
      assert((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5, `${fg} on ${bg}`);
    }
  }
});
