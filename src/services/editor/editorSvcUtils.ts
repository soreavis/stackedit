import DiffMatchPatch from 'diff-match-patch';
import cleditRaw from './cledit';
import animationSvc from '../animationSvc';
import store from '../../store';
import { useContentStateStore } from '../../stores/contentState';
import { useLayoutStore } from '../../stores/layout';

// cledit / editorSvc are still partially typed; cast cledit to `any` so
// `cledit.Utils.findContainer` resolves without a deep types port.
const cledit = cleditRaw as any;

const diffMatchPatch = new DiffMatchPatch();

// Methods here are mixed onto the editorSvc object via `Object.assign`,
// so `this` is editorSvc itself. Keep `this` typed loosely (`any`) since
// the editorSvc surface is huge and cross-cutting.
type EditorSvcThis = any;

interface ScrollPosition {
  sectionIdx: number;
  posInSection: number;
}

export default {
  /**
   * Get an object describing the position of the scroll bar in the file.
   */
  getScrollPosition(this: EditorSvcThis, elt?: HTMLElement): ScrollPosition | undefined {
    const useElt = elt || (useLayoutStore().styles.showEditor
      ? this.editorElt
      : this.previewElt);
    const dimensionKey = useElt === this.editorElt ? 'editorDimension' : 'previewDimension';
    const { scrollTop } = useElt.parentNode;
    let result: ScrollPosition | undefined;
    if (this.previewCtxMeasured) {
      this.previewCtxMeasured.sectionDescList.some((sectionDesc: any, sectionIdx: number) => {
        if (scrollTop >= sectionDesc[dimensionKey].endOffset) {
          return false;
        }
        const posInSection = (scrollTop - sectionDesc[dimensionKey].startOffset)
          / (sectionDesc[dimensionKey].height || 1);
        result = {
          sectionIdx,
          posInSection,
        };
        return true;
      });
    }
    return result;
  },

  /**
   * Restore the scroll position from the current file content state.
   */
  restoreScrollPosition(this: EditorSvcThis): void {
    const { scrollPosition }: { scrollPosition?: ScrollPosition } = (useContentStateStore() as any).current;
    if (scrollPosition && this.previewCtxMeasured) {
      const sectionDesc = this.previewCtxMeasured.sectionDescList[scrollPosition.sectionIdx];
      if (sectionDesc) {
        const editorScrollTop = sectionDesc.editorDimension.startOffset
          + (sectionDesc.editorDimension.height * scrollPosition.posInSection);
        this.editorElt.parentNode.scrollTop = Math.floor(editorScrollTop);
        const previewScrollTop = sectionDesc.previewDimension.startOffset
          + (sectionDesc.previewDimension.height * scrollPosition.posInSection);
        this.previewElt.parentNode.scrollTop = Math.floor(previewScrollTop);
      }
    }
  },

  /**
   * Get the offset in the preview corresponding to the offset of the markdown in the editor
   */
  getPreviewOffset(
    this: EditorSvcThis,
    editorOffset: number,
    sectionDescList?: any[],
  ): number | null {
    const list = sectionDescList || (this.previewCtxWithDiffs || {}).sectionDescList;
    if (!list) {
      return null;
    }
    let offset = editorOffset;
    let previewOffset: number | null = 0;
    list.some((sectionDesc: any) => {
      if (!sectionDesc.textToPreviewDiffs) {
        previewOffset = null;
        return true;
      }
      if (sectionDesc.section.text.length >= offset) {
        previewOffset = (previewOffset as number)
          + diffMatchPatch.diff_xIndex(sectionDesc.textToPreviewDiffs, offset);
        return true;
      }
      offset -= sectionDesc.section.text.length;
      previewOffset = (previewOffset as number) + sectionDesc.previewText.length;
      return false;
    });
    return previewOffset;
  },

  /**
   * Get the offset of the markdown in the editor corresponding to the offset in the preview
   */
  getEditorOffset(
    this: EditorSvcThis,
    previewOffset: number,
    sectionDescList?: any[],
  ): number | null {
    const list = sectionDescList || (this.previewCtxWithDiffs || {}).sectionDescList;
    if (!list) {
      return null;
    }
    let offset = previewOffset;
    let editorOffset: number | null = 0;
    list.some((sectionDesc: any) => {
      if (!sectionDesc.textToPreviewDiffs) {
        editorOffset = null;
        return true;
      }
      if (sectionDesc.previewText.length >= offset) {
        const previewToTextDiffs = sectionDesc.textToPreviewDiffs
          .map((diff: [number, string]) => [-diff[0], diff[1]]);
        editorOffset = (editorOffset as number)
          + diffMatchPatch.diff_xIndex(previewToTextDiffs, offset);
        return true;
      }
      offset -= sectionDesc.previewText.length;
      editorOffset = (editorOffset as number) + sectionDesc.section.text.length;
      return false;
    });
    return editorOffset;
  },

  /**
   * Get the coordinates of an offset in the preview
   */
  getPreviewOffsetCoordinates(this: EditorSvcThis, offset: number): { top: number; height: number; left: number } {
    const start = cledit.Utils.findContainer(this.previewElt, offset && offset - 1);
    const end = cledit.Utils.findContainer(this.previewElt, offset || offset + 1);
    const range = document.createRange();
    range.setStart(start.container, start.offsetInContainer);
    range.setEnd(end.container, end.offsetInContainer);
    const rect = range.getBoundingClientRect();
    const contentRect = this.previewElt.getBoundingClientRect();
    return {
      top: Math.round((rect.top - contentRect.top) + this.previewElt.scrollTop),
      height: Math.round(rect.height),
      left: Math.round((rect.right - contentRect.left) + this.previewElt.scrollLeft),
    };
  },

  /**
   * Scroll the preview (or the editor if preview is hidden) to the specified anchor
   */
  scrollToAnchor(this: EditorSvcThis, anchor: string): void {
    let scrollTop = 0;
    const scrollerElt: HTMLElement = this.previewElt.parentNode;
    const elt = document.getElementById(anchor);
    if (elt) {
      scrollTop = elt.offsetTop;
    }
    const maxScrollTop = scrollerElt.scrollHeight - scrollerElt.offsetHeight;
    if (scrollTop < 0) {
      scrollTop = 0;
    } else if (scrollTop > maxScrollTop) {
      scrollTop = maxScrollTop;
    }
    (animationSvc as any).animate(scrollerElt)
      .scrollTop(scrollTop)
      .duration(360)
      .start();
  },
};
