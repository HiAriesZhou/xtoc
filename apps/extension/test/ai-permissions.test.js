import assert from 'node:assert/strict';
import test from 'node:test';
import { aiPermissions } from '../src/library/ai-permissions.js';

test('Chrome requests only the AI provider origin', () => {
  assert.deepEqual(aiPermissions('https://api.example.com/v1'), { origins: ['https://api.example.com/*'] });
});
