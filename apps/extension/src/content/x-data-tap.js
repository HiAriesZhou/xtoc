// Runs in the page's MAIN world at document_start on x.com. It copies the
// responses of X's own analytics requests (see analytics/operations.js) and
// hands them to the extension's content script. It never sends a request,
// never changes a request or response, and ignores every other operation.
import { analyticsOperation } from '../analytics/operations.js';

const TAP = 'xtoc-tap';
const BRIDGE = 'xtoc-bridge';
const MAX_BUFFER = 12;

function install() {
  const buffer = [];
  let bridgeReady = false;

  const post = (capture) => window.postMessage({ source: TAP, type: 'capture', capture }, location.origin);

  function emit(operation, body) {
    const capture = { operation, body, at: Date.now() };
    if (bridgeReady) post(capture);
    else {
      buffer.push(capture);
      if (buffer.length > MAX_BUFFER) buffer.shift();
    }
  }

  // The content script loads after the page started its requests; it asks for
  // anything captured before it was listening.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== BRIDGE || event.data.type !== 'ready') return;
    bridgeReady = true;
    buffer.splice(0).forEach(post);
  });

  const requestUrl = (input) => (typeof input === 'string' ? input : input?.url || String(input));

  const nativeFetch = window.fetch;
  window.fetch = function fetch(...args) {
    const pending = nativeFetch.apply(this, args);
    try {
      const operation = analyticsOperation(requestUrl(args[0]));
      if (operation) {
        pending
          .then((response) => (response.ok ? response.clone().json() : null))
          .then((body) => body && emit(operation, body))
          .catch(() => {});
      }
    } catch {
      // Never let the tap affect X's own request.
    }
    return pending;
  };

  const { open, send } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.__xtocOperation = analyticsOperation(url);
    } catch {
      this.__xtocOperation = null;
    }
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const operation = this.__xtocOperation;
    if (operation) {
      this.addEventListener('load', () => {
        try {
          if (this.status < 200 || this.status >= 300) return;
          const body = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          if (body) emit(operation, body);
        } catch {
          // Not JSON or not readable; skip.
        }
      });
    }
    return send.apply(this, args);
  };
}

if (!window.__xtocTapInstalled) {
  Object.defineProperty(window, '__xtocTapInstalled', { value: true });
  install();
}
