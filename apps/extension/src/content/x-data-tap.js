// Runs in the page's MAIN world at document_start on x.com. It copies the
// responses of X's own analytics requests (see analytics/operations.js) and
// hands them to the extension's content script. It never sends a request,
// never changes a request or response, and ignores every other operation.
// On analytics and notifications pages it also reports the *names* of the
// GraphQL operations it sees, and responses it could not read, for diagnostics.
import { analyticsOperation, graphqlOperationName, isDiagnosticPath } from '../analytics/operations.js';

const TAP = 'xtoc-tap';
const BRIDGE = 'xtoc-bridge';
const MAX_CAPTURES = 12;
const MAX_SEEN = 40;

function install() {
  // Separate buffers, so diagnostic name reports never push out a capture
  // that a sync is waiting for.
  const captures = [];
  const names = [];
  let bridgeReady = false;

  const post = (message) => window.postMessage({ source: TAP, ...message }, location.origin);

  function send(message) {
    if (bridgeReady) return post(message);
    const buffer = message.type === 'capture' ? captures : names;
    buffer.push(message);
    if (buffer.length > (message.type === 'capture' ? MAX_CAPTURES : MAX_SEEN)) buffer.shift();
  }

  const emit = (operation, body) => send({ type: 'capture', capture: { operation, body, at: Date.now() } });

  function seen(url, response, read) {
    if (!isDiagnosticPath(location.pathname)) return;
    const operation = graphqlOperationName(url);
    if (!operation) return;
    send({
      type: 'seen',
      seen: {
        operation,
        status: response?.status ?? 0,
        contentType: String(response?.contentType || '').slice(0, 80),
        read
      }
    });
  }

  // The content script loads after the page started its requests; it asks for
  // anything captured before it was listening.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== BRIDGE || event.data.type !== 'ready') return;
    bridgeReady = true;
    captures.splice(0).forEach(post);
    names.splice(0).forEach(post);
  });

  const requestUrl = (input) => (typeof input === 'string' ? input : input?.url || String(input));

  const nativeFetch = window.fetch;
  window.fetch = function fetch(...args) {
    const pending = nativeFetch.apply(this, args);
    try {
      const url = requestUrl(args[0]);
      const operation = analyticsOperation(url);
      pending
        .then(async (response) => {
          const meta = { status: response.status, contentType: response.headers.get('content-type') };
          if (!operation) return seen(url, meta, 'not captured');
          if (!response.ok) return seen(url, meta, 'http error');
          try {
            emit(operation, await response.clone().json());
            seen(url, meta, 'captured');
          } catch {
            seen(url, meta, 'not json');
          }
        })
        .catch(() => {});
    } catch {
      // Never let the tap affect X's own request.
    }
    return pending;
  };

  const { open, send: xhrSend } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xtocUrl = url;
    return open.call(this, method, url, ...rest);
  };
  // One listener per XHR object; it reads the URL of the request that just
  // finished, so a reused object never reports an earlier operation.
  XMLHttpRequest.prototype.send = function (...args) {
    if (!this.__xtocListening) {
      this.__xtocListening = true;
      this.addEventListener('load', onXhrLoad);
    }
    return xhrSend.apply(this, args);
  };

  function onXhrLoad() {
    const url = this.__xtocUrl;
    let operation = null;
    try {
      operation = analyticsOperation(url);
    } catch {
      operation = null;
    }
    try {
      const meta = { status: this.status, contentType: this.getResponseHeader?.('content-type') };
      if (!operation) return seen(url, meta, 'not captured');
      if (this.status < 200 || this.status >= 300) return seen(url, meta, 'http error');
      const body = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
      if (body) emit(operation, body);
      seen(url, meta, 'captured');
    } catch {
      // Not JSON or not readable; skip.
    }
  }
}

if (!window.__xtocTapInstalled) {
  Object.defineProperty(window, '__xtocTapInstalled', { value: true });
  install();
}
