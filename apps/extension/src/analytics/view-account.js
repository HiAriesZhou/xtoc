// View selection is independent of the account bound to automatic sync.
export function viewAccount(accounts, { query, remembered, current, bound } = {}) {
  return [query, remembered, current, bound, accounts[0]?.id].find(id => accounts.some(account => account.id === id)) || '';
}
