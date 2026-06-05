import Vue from 'vue';
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

// Global directives
Vue.directive('focus', {
  mounted(el) {
    el.focus();
    const { value } = el;
    if (value && el.setSelectionRange) {
      el.setSelectionRange(0, value.length);
    }
  },
});

// v-show is a Vue 3 built-in directive (display toggle). The old custom
// override only added aria-hidden on top of display:none, which is redundant
// — display:none already removes the element from the accessibility tree — so
// it's dropped in favor of the built-in (same `v-show="x"` template syntax).

const setElTitle = (el, title) => {
  el.title = title;
  el.setAttribute('aria-label', title);
};
Vue.directive('title', {
  mounted(el, { value }) {
    setElTitle(el, value);
  },
  updated(el, { value, oldValue }) {
    if (value !== oldValue) {
      setElTitle(el, value);
    }
  },
});

// v-clipboard directive: click the element to copy its bound value to the
// OS clipboard. Uses the native async Clipboard API with a hidden-textarea
// fallback for legacy browsers / insecure contexts.
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
Vue.directive('clipboard', {
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

// Global filters
Vue.filter('formatTime', time =>
  // Access the time counter for reactive refresh
  timeSvc.format(time, useGlobalStore().timeCounter));

