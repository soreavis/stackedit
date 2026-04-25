import cledit from './cleditCore';

// cledit's Utils namespace — defer / debounce / event hooks / DOM helpers.
// Attached to the cledit module export at the bottom so call sites can
// reach them as `cledit.Utils.xxx`. Other ported services (tempFileSvc,
// markdownConversionSvc) cast cledit to `any` to read this namespace —
// once cleditCore itself is ported we can drop those casts.

interface UtilsShape {
  isGecko: boolean;
  isWebkit: boolean;
  isMsie: boolean;
  isMac: boolean;
  defer(fn: () => void): void;
  debounce(func: () => void, wait?: number): () => void;
  createEventHooks(object: any): void;
  findContainer(elt: Node, offset: number): { container: Node; offsetInContainer: number };
}

const Utils: Partial<UtilsShape> = {
  isGecko: 'MozAppearance' in document.documentElement.style,
  isWebkit: 'WebkitAppearance' in document.documentElement.style,
  isMsie: 'msTransform' in document.documentElement.style,
  isMac: navigator.userAgent.indexOf('Mac OS X') !== -1,
};

// Faster than setTimeout(0). Credit: https://github.com/stefanpenner/es6-promise
Utils.defer = (() => {
  const queue: Array<(() => void) | undefined> = new Array(1000);
  let queueLength = 0;
  function flush() {
    for (let i = 0; i < queueLength; i += 1) {
      try {
        const fn = queue[i];
        if (fn) fn();
      } catch (e: any) {
        console.error(e.message, e.stack);
      }
      queue[i] = undefined;
    }
    queueLength = 0;
  }

  let iterations = 0;
  const observer = new window.MutationObserver(flush);
  const node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return (fn: () => void) => {
    queue[queueLength] = fn;
    queueLength += 1;
    if (queueLength === 1) {
      iterations = (iterations + 1) % 2;
      node.data = String(iterations);
    }
  };
})();

Utils.debounce = (func: () => void, wait?: number) => {
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
        (Utils.defer as (fn: () => void) => void)(() => {
          isExpected = false;
          func();
        });
      }
    };
};

Utils.createEventHooks = (object: any): void => {
  const listenerMap: Record<string, Array<(...args: unknown[]) => void>> = Object.create(null);
  object.$trigger = (eventType: string, ...args: unknown[]) => {
    const listeners = listenerMap[eventType];
    if (listeners) {
      (listeners as any).forEach((listener: (...args: unknown[]) => void) => {
        try {
          listener.apply(object, args);
        } catch (e: any) {
          console.error(e.message, e.stack);
        }
      });
    }
  };
  object.on = (eventType: string, listener: (...args: unknown[]) => void) => {
    let listeners = listenerMap[eventType];
    if (!listeners) {
      listeners = [];
      listenerMap[eventType] = listeners;
    }
    listeners.push(listener);
  };
  object.off = (eventType: string, listener: (...args: unknown[]) => void) => {
    const listeners = listenerMap[eventType];
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  };
};

Utils.findContainer = (elt: Node, offset: number) => {
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
};

(cledit as any).Utils = Utils;
