// Optional editor service — scroll-sync glue. animationSvc fluent chain
// + dimension descriptors stay loosely typed (`any`); tightening would
// need an animationSvc redesign.
import { watch } from 'vue';
import { useFileStore } from '../../stores/file';
import animationSvc from '../animationSvc';
import editorSvc from '../editorSvc';
import { useDataStore } from '../../stores/data';
import { useLayoutStore } from '../../stores/layout';

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

const doScrollSync = (): void => {
  const localSkipAnimation = skipAnimation || !(useLayoutStore() as any).styles.showSidePreview;
  skipAnimation = false;
  if (!(useDataStore() as any).layoutSettings.scrollSync || sectionDescList.length === 0) {
    return;
  }
  let editorScrollTop = editorScrollerElt.scrollTop;
  if (editorScrollTop < 0) {
    editorScrollTop = 0;
  }
  const previewScrollTop = previewScrollerElt.scrollTop;
  let scrollTo: any;
  if (isScrollEditor) {
    // Scroll the preview
    isScrollEditor = false;
    sectionDescList.some((sectionDesc: any) => {
      if (editorScrollTop > sectionDesc.editorDimension.endOffset) {
        return false;
      }
      const posInSection = (editorScrollTop - sectionDesc.editorDimension.startOffset)
        / (sectionDesc.editorDimension.height || 1);
      scrollTo = (sectionDesc.previewDimension.startOffset
        + (sectionDesc.previewDimension.height * posInSection));
      return true;
    });
    scrollTo = Math.min(
      scrollTo,
      previewScrollerElt.scrollHeight - previewScrollerElt.offsetHeight,
    );

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
    }, localSkipAnimation ? 500 : 50);
  } else if (!(useLayoutStore() as any).styles.showEditor || isScrollPreview) {
    // Scroll the editor
    isScrollPreview = false;
    sectionDescList.some((sectionDesc: any) => {
      if (previewScrollTop > sectionDesc.previewDimension.endOffset) {
        return false;
      }
      const posInSection = (previewScrollTop - sectionDesc.previewDimension.startOffset)
        / (sectionDesc.previewDimension.height || 1);
      scrollTo = (sectionDesc.editorDimension.startOffset
        + (sectionDesc.editorDimension.height * posInSection));
      return true;
    });
    scrollTo = Math.min(
      scrollTo,
      editorScrollerElt.scrollHeight - editorScrollerElt.offsetHeight,
    );

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
    }, localSkipAnimation ? 500 : 50);
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

(editorSvc as any).$on('inited', () => {
  editorScrollerElt = (editorSvc as any).editorElt.parentNode;
  previewScrollerElt = (editorSvc as any).previewElt.parentNode;

  editorScrollerElt.addEventListener('scroll', () => {
    if (isEditorMoving) {
      return;
    }
    isScrollEditor = true;
    isScrollPreview = false;
    doScrollSync();
  });

  previewScrollerElt.addEventListener('scroll', () => {
    if (isPreviewMoving || isPreviewRefreshing) {
      return;
    }
    isScrollPreview = true;
    isScrollEditor = false;
    doScrollSync();
  });
});

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
    forceScrollSync();
  }
});
