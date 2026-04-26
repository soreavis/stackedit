import { debounce } from '../../services/editor/sharedUtils';
import editorSvc from '../../services/editorSvc';
import utils from '../../services/utils';

let savedSelection = null;
const nextTickCbs = [];
const nextTickExecCbs = debounce(() => {
  while (nextTickCbs.length) {
    nextTickCbs.shift()();
  }
  if (savedSelection) {
    editorSvc.clEditor.selectionMgr.setSelectionStartEnd(
      savedSelection.start,
      savedSelection.end,
    );
  }
  savedSelection = null;
});

const nextTick = (cb) => {
  nextTickCbs.push(cb);
  nextTickExecCbs();
};

const nextTickRestoreSelection = () => {
  savedSelection = {
    start: editorSvc.clEditor.selectionMgr.selectionStart,
    end: editorSvc.clEditor.selectionMgr.selectionEnd,
  };
  nextTickExecCbs();
};

// Stage 3 batch 8: when the bridge is active, use the CM6 decoration field
// instead of DOM-wrap. CM6 forbids direct DOM manipulation of the editor
// surface, and decorations also auto-map across edits via the StateField.
function isBridgeMode() {
  return editorSvc.clEditor && typeof editorSvc.clEditor.addClassRange === 'function';
}

export default class EditorClassApplier {
  constructor(classGetter, offsetGetter, properties) {
    this.classGetter = typeof classGetter === 'function' ? classGetter : () => classGetter;
    this.offsetGetter = typeof offsetGetter === 'function' ? offsetGetter : () => offsetGetter;
    this.properties = properties || {};

    if (isBridgeMode()) {
      // CM6 path: a single decoration entry per applier, updated as
      // offsets change. No need for an HTMLCollection — the StateField
      // is the source of truth.
      this.cm6RangeId = null;
      this.eltCollection = []; // legacy property kept for any external readers
      this.lastEltCount = 0;

      this.restoreClass = () => this.applyClass();
      editorSvc.clEditor.on('contentChanged', this.restoreClass);
      nextTick(() => this.restoreClass());
      return;
    }

    // Cledit path (unchanged).
    this.eltCollection = editorSvc.editorElt.getElementsByClassName(this.classGetter()[0]);
    this.lastEltCount = this.eltCollection.length;

    this.restoreClass = () => {
      if (!this.eltCollection.length || this.eltCollection.length !== this.lastEltCount) {
        this.removeClass();
        this.applyClass();
      }
    };

    editorSvc.clEditor.on('contentChanged', this.restoreClass);
    nextTick(() => this.restoreClass());
  }

  applyClass() {
    if (this.stopped) return;
    const offset = this.offsetGetter();
    if (!offset || offset.start === offset.end) return;
    const min = Math.min(offset.start, offset.end);
    const max = Math.max(offset.start, offset.end);
    const classes = this.classGetter();
    const className = classes.join(' ');

    if (isBridgeMode()) {
      // Convert dataset-style properties to plain attributes (CM6 attaches
      // the attrs object directly via .setAttribute on the decorated span).
      const attrs = {};
      Object.entries(this.properties || {}).forEach(([k, v]) => {
        if (v == null) return;
        // EditorClassApplier consumers pass `discussionId` / similar as
        // properties; expose them as data-* attrs on the rendered span.
        attrs[`data-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`] = String(v);
      });
      if (this.cm6RangeId == null) {
        this.cm6RangeId = editorSvc.clEditor.addClassRange(min, max, className, attrs);
      } else {
        editorSvc.clEditor.updateClassRange(this.cm6RangeId, min, max, className);
      }
      return;
    }

    // Cledit path.
    const range = editorSvc.clEditor.selectionMgr.createRange(min, max);
    const properties = {
      ...this.properties,
      className,
    };
    editorSvc.clEditor.watcher.noWatch(() => {
      utils.wrapRange(range, properties);
    });
    if (editorSvc.clEditor.selectionMgr.hasFocus()) {
      nextTickRestoreSelection();
    }
    this.lastEltCount = this.eltCollection.length;
  }

  removeClass() {
    if (isBridgeMode()) {
      if (this.cm6RangeId != null) {
        editorSvc.clEditor.removeClassRange(this.cm6RangeId);
        this.cm6RangeId = null;
      }
      return;
    }
    editorSvc.clEditor.watcher.noWatch(() => {
      utils.unwrapRange(this.eltCollection);
    });
    if (editorSvc.clEditor.selectionMgr.hasFocus()) {
      nextTickRestoreSelection();
    }
  }

  stop() {
    editorSvc.clEditor.off('contentChanged', this.restoreClass);
    nextTick(() => this.removeClass());
    this.stopped = true;
  }
}
