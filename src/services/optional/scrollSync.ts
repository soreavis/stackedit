// Optional editor service — scroll-sync glue. animationSvc fluent chain
// + dimension descriptors stay loosely typed (`any`); tightening would
// need an animationSvc redesign.
import { watch } from 'vue';
import { useFileStore } from '../../stores/file';
import animationSvc from '../animationSvc';
import editorSvc from '../editorSvc';
import { useDataStore } from '../../stores/data';
import { useLayoutStore } from '../../stores/layout';

// Anchor sync ~20px below viewport top on each side. The eye reads
// content slightly below the top edge, not at it, and aligning the
// reference point a body-line down feels more natural — also matches
// the original benweet/stackedit `constants.scrollOffset = 20`.
const SCROLL_OFFSET = 20;

let editorScrollerElt: any;
let previewScrollerElt: any;
let editorFinishTimeoutId: any;
let previewFinishTimeoutId: any;
let skipAnimation: boolean | undefined;
let isScrollEditor: boolean | undefined;
let isScrollPreview: boolean | undefined;
let isEditorMoving: boolean | undefined;
let isPreviewMoving: boolean | undefined;
let sectionDescList: any[] = [];
// (Legacy fields, kept for the debug overlay's `[warm]` indicator only.
// We no longer run a startup warmup — see the long comment further
// down for why — but the overlay still reports a state, and other
// flag-checks still gate scroll handlers off these.)
const warmupSuppressed = false;
const warmupDone = true;

let throttleTimeoutId: any;
let throttleLastTime = 0;

function throttle(func: () => any, wait: number): void {
  clearTimeout(throttleTimeoutId);
  const currentTime = Date.now();
  const localWait = (wait + throttleLastTime) - currentTime;
  if (localWait < 1) {
    throttleLastTime = currentTime;
    func();
  } else {
    throttleTimeoutId = setTimeout(() => {
      throttleLastTime = Date.now();
      func();
    }, localWait);
  }
}

// Pixel-based sync — copy of the original benweet/stackedit
// `doScrollSync`, with the same `posInSection × height` projection on
// each side. Section editor offsets come from `lineBlockAt` (because
// CM6 doesn't have per-section DOM); section preview offsets come from
// the rendered HTML's `offsetTop` (just like the original).
const doScrollSync = (): void => {
  const localSkipAnimation = skipAnimation || !(useLayoutStore() as any).styles.showSidePreview;
  skipAnimation = false;
  if (!(useDataStore() as any).layoutSettings.scrollSync || sectionDescList.length === 0) {
    return;
  }
  let editorScrollTop = editorScrollerElt.scrollTop;
  if (editorScrollTop < 0) editorScrollTop = 0;
  let previewScrollTop = previewScrollerElt.scrollTop;
  let scrollTo: number;
  if (isScrollEditor) {
    isScrollEditor = false;
    editorScrollTop += SCROLL_OFFSET;
    sectionDescList.some((sectionDesc: any) => {
      if (editorScrollTop > sectionDesc.editorDimension.endOffset) return false;
      const posInSection = (editorScrollTop - sectionDesc.editorDimension.startOffset)
        / (sectionDesc.editorDimension.height || 1);
      scrollTo = (sectionDesc.previewDimension.startOffset
        + (sectionDesc.previewDimension.height * posInSection)) - SCROLL_OFFSET;
      return true;
    });
    scrollTo = Math.max(0, Math.min(
      scrollTo!,
      previewScrollerElt.scrollHeight - previewScrollerElt.offsetHeight,
    ));

    throttle(() => {
      clearTimeout(previewFinishTimeoutId);
      ((animationSvc as any).animate(previewScrollerElt) as any)
        .scrollTop(scrollTo)
        .duration(!localSkipAnimation && 100)
        .start(() => {
          previewFinishTimeoutId = setTimeout(() => {
            isPreviewMoving = false;
          }, 100);
        }, () => {
          isPreviewMoving = true;
        });
    }, localSkipAnimation ? 500 : 10);
  } else if (!(useLayoutStore() as any).styles.showEditor || isScrollPreview) {
    isScrollPreview = false;
    previewScrollTop += SCROLL_OFFSET;
    sectionDescList.some((sectionDesc: any) => {
      if (previewScrollTop > sectionDesc.previewDimension.endOffset) return false;
      const posInSection = (previewScrollTop - sectionDesc.previewDimension.startOffset)
        / (sectionDesc.previewDimension.height || 1);
      scrollTo = (sectionDesc.editorDimension.startOffset
        + (sectionDesc.editorDimension.height * posInSection)) - SCROLL_OFFSET;
      return true;
    });
    scrollTo = Math.max(0, Math.min(
      scrollTo!,
      editorScrollerElt.scrollHeight - editorScrollerElt.offsetHeight,
    ));

    throttle(() => {
      clearTimeout(editorFinishTimeoutId);
      ((animationSvc as any).animate(editorScrollerElt) as any)
        .scrollTop(scrollTo)
        .duration(!localSkipAnimation && 100)
        .start(() => {
          editorFinishTimeoutId = setTimeout(() => {
            isEditorMoving = false;
          }, 100);
        }, () => {
          isEditorMoving = true;
        });
    }, localSkipAnimation ? 500 : 10);
  }
};

let isPreviewRefreshing: boolean | undefined;
let timeoutId: any;

const forceScrollSync = (): void => {
  if (!isPreviewRefreshing) {
    doScrollSync();
  }
};
watch(() => (useDataStore() as any).layoutSettings.scrollSync, forceScrollSync);

function isOverlayEnabled(): boolean {
  try {
    const settings = (useDataStore() as any).computedSettings;
    if (settings && settings.debug && typeof settings.debug.scrollSyncOverlay === 'boolean') {
      return settings.debug.scrollSyncOverlay;
    }
  } catch {
    // Pinia store may not be ready during boot; treat as disabled.
  }
  return false;
}

function unmountSyncDebugOverlay(): void {
  const el = document.getElementById('scrollsync-debug');
  if (el && el.parentElement) el.parentElement.removeChild(el);
}

function mountSyncDebugOverlay(): void {
  if (typeof window === 'undefined') return;
  if (!isOverlayEnabled()) return;
  if (document.getElementById('scrollsync-debug')) return;
  const mount = (): void => {
    if (!document.body) {
      setTimeout(mount, 50);
      return;
    }
    const el = document.createElement('div');
    el.id = 'scrollsync-debug';
    el.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:32px',
      'background:rgba(20,20,20,0.92)', 'color:#fff',
      'padding:8px 10px',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'border-radius:6px', 'z-index:2147483647',
      'pointer-events:auto', 'min-width:260px',
      'white-space:pre', 'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'cursor:default', 'user-select:none',
    ].join(';');
    el.title = 'click to dismiss · scroll-sync debug';
    el.addEventListener('click', () => el.remove());
    el.textContent = 'sync-debug: waiting for editor…';
    document.body.appendChild(el);
    const fmt = (n: number): string => `${Math.round(n)}`.padStart(5, ' ');
    const findSection = (offset: number, key: 'editorDimension' | 'previewDimension'): number => {
      for (let i = 0; i < sectionDescList.length; i += 1) {
        const d = sectionDescList[i][key];
        if (d && offset <= d.endOffset) return i;
      }
      return -1;
    };
    const previewText = (i: number): string => {
      const s = sectionDescList[i]?.section?.text || '';
      return s.split('\n')[0].slice(0, 24);
    };
    const update = (): void => {
      if (!document.getElementById('scrollsync-debug')) return; // dismissed
      if (!editorScrollerElt || !previewScrollerElt) {
        requestAnimationFrame(update);
        return;
      }
      const eMax = editorScrollerElt.scrollHeight - editorScrollerElt.clientHeight;
      const pMax = previewScrollerElt.scrollHeight - previewScrollerElt.clientHeight;
      const ePct = eMax ? (editorScrollerElt.scrollTop / eMax) * 100 : 0;
      const pPct = pMax ? (previewScrollerElt.scrollTop / pMax) * 100 : 0;
      const drift = ePct - pPct;
      const eIdx = findSection(editorScrollerElt.scrollTop, 'editorDimension');
      const pIdx = findSection(previewScrollerElt.scrollTop, 'previewDimension');
      const eSec = sectionDescList[eIdx];
      const pSec = sectionDescList[pIdx];
      const ePos = eSec?.editorDimension
        ? `[${fmt(eSec.editorDimension.startOffset)}..${fmt(eSec.editorDimension.endOffset)}, h=${fmt(eSec.editorDimension.height)}]`
        : '[?]';
      const pPos = pSec?.previewDimension
        ? `[${fmt(pSec.previewDimension.startOffset)}..${fmt(pSec.previewDimension.endOffset)}, h=${fmt(pSec.previewDimension.height)}]`
        : '[?]';
      el.textContent = [
        `editor : ${fmt(editorScrollerElt.scrollTop)} / ${fmt(eMax)}  ${ePct.toFixed(1).padStart(5)}%`,
        `preview: ${fmt(previewScrollerElt.scrollTop)} / ${fmt(pMax)}  ${pPct.toFixed(1).padStart(5)}%`,
        `drift  : ${drift > 0 ? '+' : ''}${drift.toFixed(1)} pp   sections=${sectionDescList.length}   ${warmupDone ? '[warm]' : '[cold]'}`,
        `ed sec ${eIdx}: "${previewText(eIdx)}" ${ePos}`,
        `pv sec ${pIdx}: "${previewText(pIdx)}" ${pPos}`,
        `ed/pv sec match: ${eIdx === pIdx ? 'yes' : `NO (Δ${pIdx - eIdx})`}`,
      ].join('\n');
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
    // Expose the section list for ad-hoc inspection in DevTools console:
    //   `__scrollSyncDebug.sectionList` returns the live array.
    (window as any).__scrollSyncDebug = {
      get sectionList() { return sectionDescList; },
      get scrollers() { return { editor: editorScrollerElt, preview: previewScrollerElt }; },
      get warmupDone() { return warmupDone; },
      get editorSvc() { return editorSvc; },
      get view() { return (editorSvc as any).clEditor?.view; },
      get topLine() {
        const view = (editorSvc as any).clEditor?.view;
        if (!view || !editorScrollerElt) return null;
        const inner = (editorSvc as any).editorElt as HTMLElement;
        const containerRect = (inner.parentElement || inner).getBoundingClientRect();
        const pos = view.posAtCoords({
          x: containerRect.left + 4,
          y: containerRect.top + SCROLL_OFFSET,
        }, false);
        return pos != null ? view.state.doc.lineAt(pos).number : null;
      },
    };
  };
  mount();
}

// Live-toggle the nerd overlay whenever `debug.scrollSyncOverlay` flips
// in user settings. Off by default; users opt in via Custom settings.
watch(
  () => {
    try {
      return !!(useDataStore() as any).computedSettings?.debug?.scrollSyncOverlay;
    } catch {
      return false;
    }
  },
  (enabled) => {
    if (enabled) mountSyncDebugOverlay();
    else unmountSyncDebugOverlay();
  },
  { immediate: true },
);

// Track the editor `scrollHeight` we last re-measured against. CM6 grows
// `scrollHeight` as it incrementally measures lines that come into the
// viewport; once that delta exceeds `RESCALE_THRESHOLD_PX` the cached
// section offsets (which were scaled to the old scrollHeight) need a
// fresh re-measurement. Without this, drift accumulates as the user
// scrolls deeper into the doc and never recovers.
let lastMeasuredEditorScrollHeight = 0;
const RESCALE_THRESHOLD_PX = 50;
let rescaleTimeoutId: any;
function maybeRescaleEditorOffsets(): void {
  const ed = editorScrollerElt;
  if (!ed) return;
  if (Math.abs(ed.scrollHeight - lastMeasuredEditorScrollHeight) <= RESCALE_THRESHOLD_PX) return;
  clearTimeout(rescaleTimeoutId);
  rescaleTimeoutId = setTimeout(() => {
    if (!editorScrollerElt) return;
    if (Math.abs(editorScrollerElt.scrollHeight - lastMeasuredEditorScrollHeight) <= RESCALE_THRESHOLD_PX) return;
    lastMeasuredEditorScrollHeight = editorScrollerElt.scrollHeight;
    (editorSvc as any).measureSectionDimensions(false, false, true);
  }, 120);
}

(editorSvc as any).$on('inited', () => {
  editorScrollerElt = (editorSvc as any).editorElt.parentNode;
  previewScrollerElt = (editorSvc as any).previewElt.parentNode;
  mountSyncDebugOverlay();

  editorScrollerElt.addEventListener('scroll', () => {
    if (warmupSuppressed || isEditorMoving) {
      return;
    }
    // No per-scroll re-measure — the original benweet/stackedit didn't
    // re-measure on each scroll either. Re-reading previewElt offsetTop
    // mid-scroll produces slightly different section pixel ranges each
    // call (sub-pixel reflow, lazy-loaded content), and `doScrollSync`
    // then computes a slightly-different `scrollTo` for the same editor
    // position — preview jiggles. Trust the measurement we did at
    // `previewCtxMeasured` time and let scroll just look it up.
    isScrollEditor = true;
    isScrollPreview = false;
    doScrollSync();
  });

  previewScrollerElt.addEventListener('scroll', () => {
    if (warmupSuppressed || isPreviewMoving || isPreviewRefreshing) {
      return;
    }
    isScrollPreview = true;
    isScrollEditor = false;
    doScrollSync();
  });
});

// Editor-height warmup is intentionally removed.
//
// The previous version walked `editorScrollerElt.scrollTop` through the
// whole document in viewport-sized steps so CM6's height map would have
// real measured heights for every line before the first sync. For a big
// markdown file this took multiple seconds with the editor invisible
// (opacity 0), which read to users as a slow / blocked initial load.
//
// `sectionUtils.measureSectionDimensions` now derives editor section
// heights deterministically from the source content (line type ×
// known CSS pixel heights) and scales to the live scrollHeight, and
// `maybeRescaleEditorOffsets` re-runs that measurement on the fly
// whenever scrollHeight drifts past 50px from its last cached value as
// CM6 incrementally measures new lines under scroll. So we no longer
// depend on the heightmap being fully populated up-front, and the
// warmup is pure cost. Removed.

(editorSvc as any).$on('sectionList', () => {
  clearTimeout(timeoutId);
  isPreviewRefreshing = true;
  sectionDescList = [];
});

(editorSvc as any).$on('previewCtx', () => {
  // Assume the user is writing in the editor
  isScrollEditor = (useLayoutStore() as any).styles.showEditor;
  // A preview scrolling event can occur if height is smaller
  timeoutId = setTimeout(() => {
    isPreviewRefreshing = false;
  }, 100);
});

watch(
  () => (useLayoutStore() as any).styles.showEditor,
  (showEditor: boolean) => {
    isScrollEditor = showEditor;
    isScrollPreview = !showEditor;
    skipAnimation = true;
  },
);

// file lives in Pinia; use $subscribe instead of Vuex store.watch.
useFileStore().$subscribe(() => {
  skipAnimation = true;
});

(editorSvc as any).$on('previewCtxMeasured', (previewCtxMeasured: any) => {
  if (previewCtxMeasured) {
    ({ sectionDescList } = previewCtxMeasured);
    if (editorScrollerElt) {
      lastMeasuredEditorScrollHeight = editorScrollerElt.scrollHeight;
    }
    forceScrollSync();
  }
});
