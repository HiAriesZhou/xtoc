import { OPERATIONS, ANALYTICS_ORIGIN, contentUrl, MENTIONS_URL } from './operations.js';
export const DAY = 86400000;
export const SYNC_INTERVAL = 6 * 3600000;
export const CONTINUE_DELAY = 15 * 60000;
export const BATCH_PAGES = 8;
export const BATCH_MS = 120000;
export const ALARM_NAME = 'xtoc-analytics-sync';
export const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
export const utcToday = now => Date.parse(`${isoDay(now)}T00:00:00Z`);
export function daysBetween(from, to) {
  const first = Date.parse(from), last = Date.parse(to);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last || last - first > 366 * DAY) return [];
  return Array.from({ length: Math.round((last - first) / DAY) + 1 }, (_, i) => isoDay(first + i * DAY));
}
export function windowTask(kind, from, to, extra = {}) {
  return { id: `${kind}:${from}:${to}`, kind, from, to,
    url: kind === 'content' ? contentUrl({ from, to }) : `${ANALYTICS_ORIGIN}/i/account_analytics/overview`,
    expect: kind === 'content' ? OPERATIONS.content : OPERATIONS.overviewDaily, ...extra };
}
export function windows(kind, days, now, offset = 0) {
  const end = utcToday(now) - DAY;
  const out = [];
  for (let i = offset; i < days; i += 28) out.push(windowTask(kind, isoDay(end - (Math.min(i + 28, days) - 1) * DAY), isoDay(end - i * DAY)));
  return out;
}
export function planSync(state = {}, now = Date.now()) {
  const due = (key, interval) => !state[key] || now - state[key] >= interval;
  const tasks = [];
  const add = task => { const existing = tasks.find(t => t.id === task.id); if (existing) Object.assign(existing, task); else tasks.push(task); };
  // Coverage first: daily comparison windows before the expensive post history.
  if (!state.historyStartedAt) windows('overview', 56, now).forEach(add);
  const recent = windowTask('overview', isoDay(utcToday(now) - 6 * DAY), isoDay(utcToday(now)), { cadence: 'recent' });
  add(recent);
  add(windowTask('content', recent.from, recent.to, { cadence: 'recent' }));
  if (due('lastDailyAt', DAY)) {
    windows('overview', 28, now).map(t => ({ ...t, cadence: 'daily' })).forEach(add);
    windows('content', 28, now).map(t => ({ ...t, cadence: 'daily' })).forEach(add);
    add({ id: 'audience', kind: 'audience', url: `${ANALYTICS_ORIGIN}/i/account_analytics/audience`, expect: OPERATIONS.audience, cadence: 'daily' });
    add({ id: 'mentions', kind: 'mentions', url: MENTIONS_URL, expect: OPERATIONS.mentions, cadence: 'daily' });
  }
  if (!state.historyStartedAt || due('lastWeeklyAt', 7 * DAY)) {
    // One year is the longest overview preset verified on X. Every window
    // still verifies its actual range; an inaccessible window stays partial.
    windows('content', 365, now).map(t => ({ ...t, cadence: 'weekly' })).forEach(add);
    windows('overview', 365, now, state.historyStartedAt ? 28 : 56).map(t => ({ ...t, cadence: 'weekly' })).forEach(add);
  }
  return tasks;
}
export function coverageFor(task, parsed) {
  const expected = task.from ? daysBetween(task.from, task.to) : [];
  const actual = Object.keys(parsed.days || {}).sort();
  const received = actual.filter(day => expected.includes(day));
  const metricDays = {};
  received.forEach(day => Object.entries(parsed.days[day]).forEach(([metric, value]) => {
    if (Number.isFinite(value)) metricDays[metric] = (metricDays[metric] || 0) + 1;
  }));
  const missing = task.kind === 'overview' ? expected.filter(day => !received.includes(day)) : [];
  const truncated = Boolean(parsed.truncated || task.kind === 'content' && parsed.rowCount >= 1000);
  return { from: task.from || null, to: task.to || null, receivedDays: received, missingDays: missing, metricDays,
    records: parsed.rowCount ?? parsed.mentions?.length ?? received.length,
    status: truncated || missing.length || Object.values(parsed.dropped || {}).some(Number) ? 'partial' : 'complete', truncated,
    dropped: parsed.dropped || null };
}
export function refinements(task, coverage) {
  if (!task.from || task.refined) return [];
  const days = daysBetween(task.from, task.to);
  if (coverage.truncated && days.length > 1) {
    const mid = Math.ceil(days.length / 2);
    return [windowTask(task.kind, days[0], days[mid - 1]), windowTask(task.kind, days[mid], days.at(-1))];
  }
  // Retry each missing day once, never invent a zero or loop on an empty day.
  return coverage.missingDays.map(day => windowTask(task.kind, day, day, { refined: true }));
}
export function syncMode(prefs = {}) {
  return ['manual', 'visit', 'background'].includes(prefs.mode) ? prefs.mode : prefs.autoSync ? 'visit' : 'manual';
}
export function retryDelay(failures) { return Math.min(24 * 3600000, CONTINUE_DELAY * 4 ** Math.max(0, failures - 1)); }
