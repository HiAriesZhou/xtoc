import { importedBookmarks } from './model.js';

export const IMPORT_KEY = 'xtocBookmarkImports';
export const ANCHOR_SIZE = 5;
// Covered IDs only validate a boundary (a deleted one invalidates it); the
// newest are enough, so longer lists are trimmed rather than refused.
export const MAX_COVERED = 10000;
export const validScope = (scope) => typeof scope === 'string' &&
  /^@[a-z0-9_]{1,15}\/bookmarks(?:\/\d+)?$/.test(scope);
const validIds = (ids, max) => Array.isArray(ids) && ids.length <= max &&
  ids.every((id) => typeof id === 'string' && /^article_\d+$/.test(id)) && new Set(ids).size === ids.length;

export function importStatus(state, ids) {
  if (!validIds(ids, 100)) throw new Error('Invalid import batch.');
  const saved = importedBookmarks(state);
  return ids.map((id) => ({ id, ready: saved.get(id)?.ready === true }));
}

export function usableCheckpoint(state, checkpoint) {
  if (checkpoint?.version !== 1 || !Number.isFinite(checkpoint.startedAt) ||
      !validIds(checkpoint.head, ANCHOR_SIZE) || checkpoint.head.length !== ANCHOR_SIZE ||
      !validIds(checkpoint.covered, MAX_COVERED) ||
      !checkpoint.head.every((id) => checkpoint.covered.includes(id))) return null;
  const saved = importedBookmarks(state);
  // Local deletions or incomplete records invalidate early stopping, even below the head.
  if (!checkpoint.covered.every((id) => saved.has(id))) return null;
  if (!checkpoint.head.every((id) => saved.get(id)?.ready)) return null;
  return checkpoint;
}

export function nextCheckpoints(state, checkpoints, payload) {
  const { scope, head, startedAt, previousStartedAt } = payload;
  if (!validScope(scope)) throw new Error('Invalid import scope.');
  if (!validIds(payload.covered, MAX_COVERED)) return checkpoints;
  let covered = payload.covered;
  if (previousStartedAt !== undefined) {
    const previous = usableCheckpoint(state, checkpoints[scope]);
    if (!previous || previous.startedAt !== previousStartedAt) return checkpoints;
    covered = [...new Set([...covered, ...previous.covered])].slice(0, MAX_COVERED);
  }
  const candidate = { version: 1, head, covered, startedAt };
  if (!usableCheckpoint(state, candidate)) return checkpoints;
  if ((checkpoints[scope]?.startedAt || 0) > startedAt) return checkpoints;
  // Bound local metadata; evicting a scope only means a later full check.
  return Object.fromEntries(Object.entries({ ...checkpoints, [scope]: candidate })
    .sort((a, b) => b[1].startedAt - a[1].startedAt).slice(0, 20));
}
