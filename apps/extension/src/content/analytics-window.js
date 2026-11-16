// Only controls the date picker in a tab created by an explicit/opted-in sync.
// It does not fetch data, replay requests, or read credentials.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const label = node => (node.getAttribute('aria-label') || node.textContent || '').trim();
const visible = node => node.getClientRects().length > 0;
const buttons = () => [...document.querySelectorAll('button,[role="button"]')].filter(visible);
async function waitFor(find, timeout = 12000) {
  const end = Date.now() + timeout;
  do { const found = find(); if (found) return found; await pause(100); } while (Date.now() < end);
  throw new Error('X’s date controls did not become available.');
}
async function clickButton(matches) {
  const node = await waitFor(() => buttons().find(n => matches(label(n))));
  if (node.disabled || node.getAttribute('aria-disabled') === 'true') throw new Error('X does not allow this date range.');
  node.click();
  await pause(120);
}
const dateLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
async function chooseDay(day) {
  const target = dateLabel(day);
  const targetMs = Date.parse(day);
  for (let i = 0; i < 25; i++) {
    const candidates = buttons();
    const exact = candidates.find(n => label(n) === target);
    if (exact) {
      if (exact.disabled || exact.getAttribute('aria-disabled') === 'true') throw new Error('X does not allow this date range.');
      exact.click(); await pause(120); return;
    }
    const dates = candidates.map(label).filter(s => /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), /.test(s)).map(Date.parse).filter(Number.isFinite);
    if (!dates.length) throw new Error('X’s calendar format is not supported. Open X Analytics to check its date controls.');
    await clickButton(s => s === (targetMs < Math.min(...dates) ? 'Previous month' : 'Next month'));
  }
  throw new Error('X’s calendar could not reach this date.');
}
export async function setAnalyticsWindow(task, rpc) {
  if (!task?.from || !/^\d{4}-\d{2}-\d{2}$/.test(task.from) || !/^\d{4}-\d{2}-\d{2}$/.test(task.to)) return;
  await waitFor(() => buttons().find(n => label(n) === 'Select date range'));
  // Select an alternate preset to avoid a cached no-op on the default window.
  await clickButton(s => s === '2W');
  await clickButton(s => s === 'Select date range');
  await clickButton(s => /^Start\b/.test(s));
  await chooseDay(task.from);
  // X may close the calendar after a selection; reopen only if necessary.
  if (!buttons().some(n => /^End\b/.test(label(n)))) await clickButton(s => s === 'Select date range');
  await clickButton(s => /^End\b/.test(s));
  // Arm before the final UI action. Captures from earlier selections cannot
  // complete this task, even if their responses arrive late.
  await rpc('analytics:window-armed', { id: task.id });
  await chooseDay(task.to);
  await rpc('analytics:window-ready', { id: task.id });
  // Escape closes the date picker without changing its selected range.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}
export async function prepareAnalyticsWindow(rpc) {
  const task = await rpc('analytics:window');
  if (!task) return;
  try {
    if (task.handle) {
      const profile = await waitFor(() => document.querySelector('[data-testid="AppTabBar_Profile_Link"]'));
      if (new URL(profile.href, location.href).pathname.toLowerCase() !== '/' + task.handle.toLowerCase()) throw new Error('The signed-in X account changed. Resume sync for the matching account.');
    }
    await rpc('analytics:window-identity', { id: task.id });
    if (task.from) await setAnalyticsWindow(task, rpc);
    else await rpc('analytics:window-ready', { id: task.id });
  }
  catch (error) { await rpc('analytics:window-error', { id: task.id, error: error.message, code: error.message === 'X does not allow this date range.' ? 'range-unavailable' : 'controls' }); }
}
