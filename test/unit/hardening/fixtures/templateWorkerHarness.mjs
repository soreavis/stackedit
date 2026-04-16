// Bridges node:worker_threads <-> the Web-Worker contract that
// src/services/templateWorker.js expects.
//
// Implementation note: templateWorker.js sandboxes its globals by walking
// `self` (== globalThis) and replacing every non-whitelisted property with
// a throwing getter. The string `'globalThis'` is NOT in the whitelist, so
// after the module loads, the identifier `globalThis` throws on access.
// The names `self`, `onmessage`, `postMessage`, `close` ARE whitelisted.
// This harness uses only those names for post-load interactions.

import { parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (!parentPort) {
  throw new Error('harness must be spawned via new Worker()');
}

const channel = parentPort;

// Capture globalThis into a local BEFORE the sandbox replaces its accessor.
const G = globalThis;

// Node workers don't define `self`; browsers + Web Workers do. Alias it so
// templateWorker.js can walk `self` during its sandbox setup.
G.self = G;

// Keep the worker alive across messages; templateWorker calls close() at
// the end of each handler, which we intercept to clear this interval.
const keepalive = setInterval(() => {}, 1000);

// Expose Web Worker globals the module expects. These names are all on the
// sandbox whitelist, so the replaced-accessor pass leaves them intact.
G.postMessage = data => channel.postMessage(data);
G.close = () => { clearInterval(keepalive); };
G.onmessage = null;

// Bridge parent → self.onmessage. Use `self` (whitelisted), not `globalThis`
// (not whitelisted and trapped by the sandbox post-load).
channel.on('message', (data) => {
  try {
    if (typeof self.onmessage === 'function') {
      self.onmessage({ data });
    } else {
      channel.postMessage(['harness: no onmessage']);
    }
  } catch (e) {
    channel.postMessage([`harness caught: ${e && e.message}`]);
  }
});

// Resolve templateWorker path relative to this file.
const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(here, '../../../../src/services/templateWorker.js');

// Load the module (imports handlebars, registers tocToHtml, locks globals,
// sets self.onmessage).
await import(workerPath);
