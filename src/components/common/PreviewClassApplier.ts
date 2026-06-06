import { debounce, findContainer } from '../../services/editor/sharedUtils';
import editorSvc from '../../services/editorSvc';
import utils from '../../services/utils';

type ClassGetter = string[] | (() => string[]);
type Offset = { start: number; end: number } | null | undefined;
type OffsetGetter = Offset | (() => Offset);

const nextTickCbs: Array<() => void> = [];
const nextTickExecCbs = debounce(() => {
  while (nextTickCbs.length) {
    nextTickCbs.shift()!();
  }
});

const nextTick = (cb: () => void) => {
  nextTickCbs.push(cb);
  nextTickExecCbs();
};

export default class PreviewClassApplier {
  classGetter: () => string[];

  offsetGetter: () => Offset;

  properties: Record<string, unknown>;

  eltCollection: HTMLCollectionOf<Element>;

  lastEltCount: number;

  restoreClass: () => void;

  stopped?: boolean;

  constructor(
    classGetter: ClassGetter,
    offsetGetter: OffsetGetter,
    properties?: Record<string, unknown>,
  ) {
    this.classGetter = typeof classGetter === 'function' ? classGetter : () => classGetter;
    this.offsetGetter = typeof offsetGetter === 'function' ? offsetGetter : () => offsetGetter;
    this.properties = properties || {};
    this.eltCollection = editorSvc.previewElt.getElementsByClassName(this.classGetter()[0]);
    this.lastEltCount = this.eltCollection.length;

    this.restoreClass = () => {
      if (!editorSvc.previewCtxWithDiffs) {
        this.removeClass();
      } else if (!this.eltCollection.length || this.eltCollection.length !== this.lastEltCount) {
        this.removeClass();
        this.applyClass();
      }
    };

    editorSvc.$on('previewCtxWithDiffs', this.restoreClass);
    nextTick(() => this.restoreClass());
  }

  applyClass() {
    if (!this.stopped) {
      const offset = this.offsetGetter();
      if (offset) {
        const offsetStart = editorSvc.getPreviewOffset(
          offset.start,
          editorSvc.previewCtx.sectionDescList,
        );
        const offsetEnd = editorSvc.getPreviewOffset(
          offset.end,
          editorSvc.previewCtx.sectionDescList,
        );
        if (offsetStart != null && offsetEnd != null && offsetStart !== offsetEnd) {
          const start = findContainer(
            editorSvc.previewElt,
            Math.min(offsetStart, offsetEnd),
          );
          const end = findContainer(
            editorSvc.previewElt,
            Math.max(offsetStart, offsetEnd),
          );
          const range = document.createRange();
          range.setStart(start.container, start.offsetInContainer);
          range.setEnd(end.container, end.offsetInContainer);
          const properties = {
            ...this.properties,
            className: this.classGetter().join(' '),
          };
          utils.wrapRange(range, properties);
          this.lastEltCount = this.eltCollection.length;
        }
      }
    }
  }

  removeClass() {
    utils.unwrapRange(this.eltCollection as unknown as ArrayLike<HTMLElement>);
  }

  stop() {
    editorSvc.$off('previewCtxWithDiffs', this.restoreClass);
    nextTick(() => this.removeClass());
    this.stopped = true;
  }
}
