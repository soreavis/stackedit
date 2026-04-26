// Optional editor service — keyboard / scroll-sync / shortcuts / task-change
// glue. Tightly coupled to editorSvc + the CM6 bridge.
//
// Stage 3 batch 11: keystrokes.ts deleted — its enter/tab handlers
// (list continuation, list auto-numbering, smart tab indent) are
// covered by `markdownKeymap` from `@codemirror/lang-markdown` and
// CM6's `indentWithTab` which the bridge wires into its default
// keymap. The list auto-renumbering on Tab inside an ordered list
// is a feature regression vs cledit; tracked as a follow-up if users
// notice.
import './shortcuts';
import './scrollSync';
import './taskChange';
