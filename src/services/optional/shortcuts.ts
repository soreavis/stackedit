// @ts-nocheck
// Optional editor service — keyboard / scroll-sync / shortcuts / task-change
// glue. Tightly coupled to editorSvc + cledit dynamic surfaces. .ts rename
// is for migration tracking; full typing comes after editorSvc/cledit are
// properly typed.
import { tinykeys } from 'tinykeys';
import store from '../../store';
import { useModalStore } from '../../stores/modal';
import editorSvc from '../../services/editorSvc';
import syncSvc from '../../services/syncSvc';
import { useFindReplaceStore } from '../../stores/findReplace';

// -----------------------------------------------------------------------------
// Keyboard shortcuts — chord bindings via tinykeys
// -----------------------------------------------------------------------------
// Migration note (Nov 2025): replaced mousetrap@1.6.5 (last release Jan 2020,
// unmaintained) with tinykeys@3 (~1 KB, active). API differs:
//   - tinykeys expects KeyboardEvent.code (e.g. 'KeyB', 'Digit1', 'Space'),
//     not the printed key character.
//   - `$mod` is tinykeys' platform-adaptive Meta/Control (same as mousetrap's
//     `mod`).
//   - No built-in sequence-to-expand support → the two text-expansion triggers
//     (`==> ` → `⇒ `, `<== ` → `⇐ `) are handled by a separate input listener
//     below. That's a cleaner separation — text-expansion is a content concern,
//     not a keyboard concern, and now works on any keyboard layout.

const pagedownHandler = name => () => {
  editorSvc.pagedownEditor.uiManager.doClick(name);
};

const findReplaceOpener = type => () => {
  useFindReplaceStore().open({
    type,
    findText: editorSvc.clEditor.selectionMgr.hasFocus()
      && editorSvc.clEditor.selectionMgr.getSelectedText(),
  });
};

const methods = {
  bold: pagedownHandler('bold'),
  italic: pagedownHandler('italic'),
  strikethrough: pagedownHandler('strikethrough'),
  link: pagedownHandler('link'),
  quote: pagedownHandler('quote'),
  code: pagedownHandler('code'),
  image: pagedownHandler('image'),
  olist: pagedownHandler('olist'),
  ulist: pagedownHandler('ulist'),
  clist: pagedownHandler('clist'),
  heading: pagedownHandler('heading'),
  hr: pagedownHandler('hr'),
  sync() {
    if (syncSvc.isSyncPossible()) {
      syncSvc.requestSync();
    }
  },
  find: findReplaceOpener('find'),
  replace: findReplaceOpener('replace'),
};

const modifierMap = {
  mod: '$mod',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Control',
  meta: 'Meta',
};
const namedKeyMap = {
  space: 'Space',
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
};

// Convert a mousetrap-style chord ("mod+shift+b") into a tinykeys binding
// ("$mod+Shift+KeyB"). Returns null for sequences (space-separated) so the
// caller can hand those off to the text-expander.
function toTinykeys(chord) {
  if (chord.trim().includes(' ')) return null;
  return chord.split('+').map((rawPart) => {
    const part = rawPart.trim();
    const lower = part.toLowerCase();
    if (modifierMap[lower]) return modifierMap[lower];
    if (namedKeyMap[lower]) return namedKeyMap[lower];
    if (/^[a-z]$/i.test(part)) return `Key${part.toUpperCase()}`;
    if (/^[0-9]$/.test(part)) return `Digit${part}`;
    return part;
  }).join('+');
}

const shortcutsAllowed = () => !useModalStore().config
  && store.getters['content/isCurrentEditable'];

const guard = fn => (event) => {
  if (!shortcutsAllowed()) return;
  event.preventDefault();
  fn();
};

// -----------------------------------------------------------------------------
// Text expansion — decoupled from keyboard shortcuts
// -----------------------------------------------------------------------------
// The `expand` shortcut method (from upstream's settings YAML) replaces typed
// sequences with arrow glyphs. Instead of tracking keystrokes, we scan the
// content after each input event and rewrite the recent suffix when it matches.

const expansions = [];
function collectExpansions(computedSettings) {
  expansions.length = 0;
  Object.values(computedSettings.shortcuts || {}).forEach((shortcut) => {
    if (shortcut && shortcut.method === 'expand' && Array.isArray(shortcut.params)) {
      const [trigger, replacement] = shortcut.params;
      if (trigger && replacement) expansions.push({ trigger, replacement });
    }
  });
}

let unbindAll = () => {};

store.watch(
  () => store.getters['data/computedSettings'],
  (computedSettings) => {
    unbindAll();
    const bindings = {};
    Object.entries(computedSettings.shortcuts).forEach(([key, shortcut]) => {
      if (!shortcut) return;
      const method = `${shortcut.method || shortcut}`;
      if (!Object.prototype.hasOwnProperty.call(methods, method)) return;
      const binding = toTinykeys(key);
      // Sequence-style entries (e.g. the `expand` shortcuts) are handled by
      // the text-expansion listener below, not by the chord registry.
      if (!binding) return;
      bindings[binding] = guard(methods[method]);
    });
    unbindAll = tinykeys(window, bindings);
    collectExpansions(computedSettings);
  }, { immediate: true },
);

function applyExpansion() {
  if (!shortcutsAllowed() || !expansions.length) return;
  const { selectionMgr } = editorSvc.clEditor || {};
  if (!selectionMgr) return;
  const offset = selectionMgr.selectionStart;
  if (offset !== selectionMgr.selectionEnd) return;

  expansions.some(({ trigger, replacement }) => {
    if (offset < trigger.length) return false;
    const range = selectionMgr.createRange(offset - trigger.length, offset);
    if (`${range}` !== trigger) return false;
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    const newOffset = (offset - trigger.length) + replacement.length;
    selectionMgr.setSelectionStartEnd(newOffset, newOffset);
    selectionMgr.updateCursorCoordinates(true);
    return true;
  });
}

// Subscribe to editor content changes. editorSvc emits 'contentChanged' on
// every meaningful edit (mutation observer -> cledit).
if (typeof editorSvc.$on === 'function') {
  editorSvc.$on('contentChanged', () => setTimeout(applyExpansion, 1));
}

// Always-on global shortcuts:
//   - Cmd/Ctrl+K  opens the command palette (search-any-action)
//   - Cmd/Ctrl+/  opens the slash-commands palette (insert-only filter)
// Both bypass the user-configurable yaml shortcut binding above because
// they're meta actions (find any other command) — always bound, always
// available, even when an editor element has focus.
tinykeys(window, {
  '$mod+KeyK': (e) => {
    if (useModalStore().config) return;
    e.preventDefault();
    useModalStore().open('commandPalette').catch(() => {});
  },
  '$mod+Slash': (e) => {
    if (useModalStore().config) return;
    e.preventDefault();
    useModalStore().open({ type: 'commandPalette', initialQuery: '' }).catch(() => {});
  },
});
