// Stage 3 batch 11 — small utility module that survives the cledit
// deletion. The original cledit.Utils namespace had ~10 helpers; only
// `debounce` and `findContainer` were reached from outside cledit/
// (counted via `grep cledit.Utils.X` over src/). This file inherits
// those two verbatim so consumers can keep using them after cledit
// itself goes away.
//
// Both helpers are pure DOM / scheduling utilities — no editor state
// involved.

// "Defer" is faster than setTimeout(0) — uses MutationObserver to
// schedule a microtask-flavored task. Kept because debounce(fn) (no
// wait arg) calls it.
let queue: Array<(() => void) | undefined> = new Array(1000);
let queueLength = 0;
let observer: MutationObserver | null = null;
let observerNode: Text | null = null;
let iterations = 0;

function ensureObserver(): void {
  if (observer || typeof window === 'undefined') return;
  function flush() {
    for (let i = 0; i < queueLength; i += 1) {
      try {
        const fn = queue[i];
        if (fn) fn();
      } catch (e) {
        console.error(e);
      }
      queue[i] = undefined;
    }
    queueLength = 0;
  }
  observer = new window.MutationObserver(flush);
  observerNode = document.createTextNode('');
  observer.observe(observerNode, { characterData: true });
}

export function defer(fn: () => void): void {
  ensureObserver();
  queue[queueLength] = fn;
  queueLength += 1;
  if (queueLength === 1 && observerNode) {
    iterations = (iterations + 1) % 2;
    observerNode.data = String(iterations);
  }
}

export function debounce(func: () => void, wait?: number): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let isExpected = false;
  return wait
    ? () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(func, wait);
    }
    : () => {
      if (!isExpected) {
        isExpected = true;
        defer(() => {
          isExpected = false;
          func();
        });
      }
    };
}

// Walk the DOM tree counting text-character offsets to find the leaf
// node + in-node offset that holds character `offset` of the contents.
// Used by editorSvcUtils.getPreviewOffsetCoordinates to position the
// preview's range on a specific source-character.
export function findContainer(elt: Node, offset: number): { container: Node; offsetInContainer: number } {
  let containerOffset = 0;
  let container: Node;
  let child: Node | null = elt;
  do {
    container = child;
    child = child.firstChild;
    if (child) {
      do {
        const len = (child.textContent || '').length;
        if (containerOffset <= offset && containerOffset + len > offset) {
          break;
        }
        containerOffset += len;
        child = child.nextSibling;
      } while (child);
    }
  } while (child && child.firstChild && child.nodeType !== 3);

  if (child) {
    return {
      container: child,
      offsetInContainer: offset - containerOffset,
    };
  }
  while (container.lastChild) {
    container = container.lastChild;
  }
  return {
    container,
    offsetInContainer: container.nodeType === 3 ? (container.textContent || '').length : 0,
  };
}
