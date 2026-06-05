import timeSvc from '../../services/timeSvc';
import { useGlobalStore } from '../../stores/global';

// Fallback for older browsers / insecure contexts (navigator.clipboard is
// only available on https:// or localhost).
const legacyCopy = (text) => {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(ta);
};

const copyToClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch { /* fall through to legacy */ }
  }
  legacyCopy(text);
};

const setElTitle = (el, title) => {
  el.title = title;
  el.setAttribute('aria-label', title);
};

// v-clipboard: click the element to copy its bound value to the OS clipboard.
const createClipboard = (el, value) => {
  const handler = () => copyToClipboard(value);
  el.addEventListener('click', handler);
  el.seClipboardHandler = handler;
};
const destroyClipboard = (el) => {
  if (el.seClipboardHandler) {
    el.removeEventListener('click', el.seClipboardHandler);
    el.seClipboardHandler = null;
  }
};

// Global directives, registered on the app instance (Vue 3) via app.use() in
// src/index.js. v-show is intentionally NOT here — Vue 3 provides it built-in.
export default {
  install(app) {
    app.directive('focus', {
      mounted(el) {
        el.focus();
        const { value } = el;
        if (value && el.setSelectionRange) {
          el.setSelectionRange(0, value.length);
        }
      },
    });

    app.directive('title', {
      mounted(el, { value }) {
        setElTitle(el, value);
      },
      updated(el, { value, oldValue }) {
        if (value !== oldValue) {
          setElTitle(el, value);
        }
      },
    });

    app.directive('clipboard', {
      mounted(el, { value }) {
        createClipboard(el, value);
      },
      updated(el, { value, oldValue }) {
        if (value !== oldValue) {
          destroyClipboard(el);
          createClipboard(el, value);
        }
      },
      unmounted(el) {
        destroyClipboard(el);
      },
    });
  },
};

// Relative-time formatter — was a Vue 2 global filter (removed in Vue 3).
// Exported as a function and used as a component method; reading timeCounter
// keeps it reactive (re-renders when the global 30s tick advances).
export function formatTime(time) {
  return timeSvc.format(time, useGlobalStore().timeCounter);
}
