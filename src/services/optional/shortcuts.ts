// Keyboard / shortcuts / text-expansion glue.
//
// Coupled to editorSvc's dynamic surface (`.clEditor`, `.$on`) — those
// fields aren't statically typed because editorSvc is built via
// Object.assign mixins. Cast through permissive types at the boundary
// rather than designing an editorSvc-wide interface for one consumer.
import { watch } from 'vue';
import { tinykeys } from 'tinykeys';
import { useContentStore } from '../../stores/content';
import { useModalStore } from '../../stores/modal';
import editorSvc from '../../services/editorSvc';
import syncSvc from '../../services/syncSvc';
import { useFindReplaceStore } from '../../stores/findReplace';
import { useDataStore } from '../../stores/data';
import {
  cm6Commands,
  linkCommand as makeCm6LinkCommand,
  imageCommand as makeCm6ImageCommand,
} from '../editor/cm6/cm6Commands';

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

// Stage 3 batch 11: CM6 bridge is the only editor; pagedown is gone.
// Each toolbar / shortcut name maps to a cm6Commands entry (link / image
// take a modal opener, the rest are direct lookups; `hr` is renamed
// to `horizontalRule`).
type ModalOpenerCb = (url: string | null) => void;

const pagedownHandler = (name: string) => (): void => {
  const view = (editorSvc as any).clEditor.view;
  const command = name === 'link'
    ? makeCm6LinkCommand((cb: ModalOpenerCb) => useModalStore().open({ type: 'link', callback: cb as unknown as (...args: unknown[]) => void }) as unknown as Promise<void>)
    : name === 'image'
      ? makeCm6ImageCommand((cb: ModalOpenerCb) => useModalStore().open({ type: 'image', callback: cb as unknown as (...args: unknown[]) => void }) as unknown as Promise<void>)
      : (cm6Commands as Record<string, (view: unknown) => unknown>)[name === 'hr' ? 'horizontalRule' : name];
  if (command) command(view);
};

const findReplaceOpener = (type: 'find' | 'replace') => (): void => {
  const selectionMgr = (editorSvc as any).clEditor.selectionMgr;
  useFindReplaceStore().open({
    type,
    findText: selectionMgr.hasFocus()
      ? selectionMgr.getSelectedText()
      : '',
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

const modifierMap: Record<string, string> = {
  mod: '$mod',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Control',
  meta: 'Meta',
};
const namedKeyMap: Record<string, string> = {
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
function toTinykeys(chord: string): string | null {
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

const shortcutsAllowed = (): boolean => !useModalStore().config
  && useContentStore().isCurrentEditable;

const guard = (fn: () => void) => (event: KeyboardEvent): void => {
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

interface Expansion { trigger: string; replacement: string }
interface Shortcut { method?: string; params?: unknown[] }

const expansions: Expansion[] = [];
function collectExpansions(computedSettings: { shortcuts?: Record<string, Shortcut | string> }): void {
  expansions.length = 0;
  Object.values(computedSettings.shortcuts || {}).forEach((shortcut) => {
    if (shortcut && typeof shortcut === 'object' && shortcut.method === 'expand' && Array.isArray(shortcut.params)) {
      const [trigger, replacement] = shortcut.params as [string, string];
      if (trigger && replacement) expansions.push({ trigger, replacement });
    }
  });
}

let unbindAll: () => void = () => {};

watch(
  () => useDataStore().computedSettings,
  (computedSettings: Record<string, unknown>) => {
    unbindAll();
    const bindings: Record<string, (event: KeyboardEvent) => void> = {};
    const shortcutsMap = (computedSettings.shortcuts || {}) as Record<string, Shortcut | string>;
    Object.entries(shortcutsMap).forEach(([key, shortcut]) => {
      if (!shortcut) return;
      const method = typeof shortcut === 'string'
        ? shortcut
        : `${shortcut.method || ''}`;
      if (!Object.prototype.hasOwnProperty.call(methods, method)) return;
      const binding = toTinykeys(key);
      // Sequence-style entries (e.g. the `expand` shortcuts) are handled by
      // the text-expansion listener below, not by the chord registry.
      if (!binding) return;
      bindings[binding] = guard((methods as Record<string, () => void>)[method]);
    });
    unbindAll = tinykeys(window, bindings);
    collectExpansions(computedSettings as { shortcuts?: Record<string, Shortcut | string> });
  }, { immediate: true },
);

interface EditorSelectionMgr {
  selectionStart: number;
  selectionEnd: number;
  hasFocus(): boolean;
  getSelectedText(): string;
}
interface EditorSurface {
  selectionMgr: EditorSelectionMgr;
  getContent(): string;
  replace(start: number, end: number, text: string): void;
}

function applyExpansion(): void {
  if (!shortcutsAllowed() || !expansions.length) return;
  const editor = (editorSvc as any).clEditor as EditorSurface | undefined;
  if (!editor) return;
  const { selectionMgr } = editor;
  if (!selectionMgr) return;
  const offset = selectionMgr.selectionStart;
  if (offset !== selectionMgr.selectionEnd) return;
  // Stage 3 regression fix: cledit's path used selectionMgr.createRange()
  // + range.deleteContents() / insertNode() to swap the trigger inline.
  // The CM6 bridge returns a plain `{ from, to }` from createRange, so
  // those Range methods don't exist. Read the doc text directly and use
  // editor.replace(start, end, text) — works on both bridge + cledit
  // (CodeEditor / NewComment still use cledit).
  const content = editor.getContent();

  expansions.some(({ trigger, replacement }) => {
    if (offset < trigger.length) return false;
    const start = offset - trigger.length;
    if (content.slice(start, offset) !== trigger) return false;
    editor.replace(start, offset, replacement);
    return true;
  });
}

// Subscribe to editor content changes. editorSvc.$emit('sectionList', ...)
// fires on every meaningful edit (debounced via onEditorChanged in
// editorSvc). Previous binding was 'contentChanged' which editorSvc
// itself never emits — that was a stale listener from the era when
// shortcuts.ts attached directly to cledit. Triggers fired only via
// other paths in cledit mode; on the CM6 bridge they didn't fire at
// all, which is why text-expansion was the visible regression after
// Stage 3 cutover.
const editorEvents = editorSvc as unknown as { $on?: (event: string, handler: () => void) => void };
if (typeof editorEvents.$on === 'function') {
  editorEvents.$on('sectionList', () => setTimeout(applyExpansion, 1));
}

// Always-on global shortcuts:
//   - Cmd/Ctrl+K  opens the command palette (search-any-action)
//   - Cmd/Ctrl+/  opens the slash-commands palette (insert-only filter)
// Both bypass the user-configurable yaml shortcut binding above because
// they're meta actions (find any other command) — always bound, always
// available, even when an editor element has focus.
tinykeys(window, {
  '$mod+KeyK': (e: KeyboardEvent) => {
    if (useModalStore().config) return;
    e.preventDefault();
    useModalStore().open('commandPalette').catch(() => {});
  },
  '$mod+Slash': (e: KeyboardEvent) => {
    if (useModalStore().config) return;
    e.preventDefault();
    useModalStore().open({ type: 'commandPalette', initialQuery: '' }).catch(() => {});
  },
});
