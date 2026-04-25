import cledit from './cleditCore';

interface CleditEditor {
  $contentElt: HTMLElement;
  [key: string]: unknown;
}

// MutationObserver wrapper around the editor's content element. The
// `noWatch` helper temporarily disconnects the observer for programmatic
// edits the watcher shouldn't echo back to its listener.
function Watcher(this: any, editor: CleditEditor, listener: MutationCallback) {
  this.isWatching = false;
  let contentObserver: MutationObserver | undefined;
  this.startWatching = () => {
    this.stopWatching();
    this.isWatching = true;
    contentObserver = new window.MutationObserver(listener);
    contentObserver.observe(editor.$contentElt, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };
  this.stopWatching = () => {
    if (contentObserver) {
      contentObserver.disconnect();
      contentObserver = undefined;
    }
    this.isWatching = false;
  };
  this.noWatch = (cb: () => void) => {
    if (this.isWatching === true) {
      this.stopWatching();
      cb();
      this.startWatching();
    } else {
      cb();
    }
  };
}

(cledit as any).Watcher = Watcher;
