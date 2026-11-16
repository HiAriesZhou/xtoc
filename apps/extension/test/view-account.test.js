import test from 'node:test';
import assert from 'node:assert/strict';
import { viewAccount } from '../src/analytics/view-account.js';
test('navigation account takes priority over stale view and sync account', () => {
  const accounts = [{id:'123'}, {id:'456'}];
  assert.equal(viewAccount(accounts, { query:'456', current:'123', remembered:'123', bound:'123' }), '456');
  assert.equal(viewAccount(accounts, { query:'123', current:'456', remembered:'456' }), '123');
  assert.equal(viewAccount(accounts, { query:'deleted', remembered:'456', bound:'123' }), '456');
  assert.equal(viewAccount([], {query:'123'}), '');
});
