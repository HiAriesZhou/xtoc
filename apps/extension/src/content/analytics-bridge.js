// Isolated-world side of the analytics tap: receives copies of X analytics
// responses from x-data-tap.js and forwards them to the background, which
// validates and stores them. Also lets the background know X was opened, so an
// opted-in daily sync can start while the user is signed in.
import { prepareAnalyticsWindow } from './analytics-window.js';
import { OPERATIONS } from '../analytics/operations.js';

const TAP = 'xtoc-tap';
const BRIDGE = 'xtoc-bridge';
const KNOWN = new Set(Object.values(OPERATIONS));

export function initAnalyticsBridge() {
  function onMessage(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== TAP) return;
    if (data.type === 'seen') {
      const { operation, status, contentType, read } = data.seen || {};
      if (typeof operation !== 'string') return;
      chrome.runtime
        .sendMessage({ action: 'analytics:seen', payload: { operation, status, contentType, read } })
        .catch(() => {});
      return;
    }
    if (data.type !== 'capture') return;
    const { operation, body, requestedAt, range } = data.capture || {};
    if (!KNOWN.has(operation) || !body || typeof body !== 'object') return;
    chrome.runtime
      .sendMessage({ action: 'analytics:capture', payload: { operation, body, requestedAt, range } })
      .catch(() => {});
  }

  window.addEventListener('message', onMessage);
  window.postMessage({ source: BRIDGE, type: 'ready' }, location.origin);
  chrome.runtime.sendMessage({ action: 'analytics:visit' }).catch(() => {});
  prepareAnalyticsWindow(async (action, payload) => {
    const response = await chrome.runtime.sendMessage({ action, payload });
    if (!response?.ok) throw new Error(response?.error || 'Sync stopped.');
    return response.data;
  }).catch(() => {});

  return {
    destroy() {
      window.removeEventListener('message', onMessage);
    }
  };
}
