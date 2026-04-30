// Section-dimension helpers used by the scroll-sync plumbing. Each
// section (a paragraph, list, blockquote, heading…) gets measured in
// editor-space, preview-space, and TOC-space, then normalized so empty
// sections borrow height from their neighbors and the proportions hold
// across all three columns.
//
// This file mirrors the original benweet/stackedit `sectionUtils.js`
// almost verbatim — the dimension normalizer and the per-section
// offset loop are copies. The only CM6 adaptation is in
// `resolveEditorSectionTop`: cledit had per-section DOM wrappers with
// real `offsetTop`, CM6 doesn't, so we fall back to
// `view.lineBlockAt(charOffset).top` (CM6's height map) translated
// from `.cm-content` space into the `.editor` scroll container's
// coordinate space. Once the syntax-tree-driven block decorations in
// `cm6Highlighter.ts` apply heading/code line-height classes to the
// whole document up front (not just the rendered viewport),
// `lineBlockAt` returns stable y-coordinates for every line — which is
// the same property cledit-section divs gave the original.

class SectionDimension {
  startOffset: number;
  endOffset: number;
  height: number;

  constructor(startOffset: number, endOffset: number) {
    this.startOffset = startOffset;
    this.endOffset = endOffset;
    this.height = endOffset - startOffset;
  }
}

interface SectionDesc {
  editorDimension: SectionDimension;
  previewDimension: SectionDimension;
  tocDimension: SectionDimension;
  editorElt?: HTMLElement;
  previewElt?: HTMLElement;
  tocElt?: HTMLElement;
  section?: { text: string; data: string };
  // Source-line range covered by this section in the markdown source.
  // Computed from cumulative `section.text` line counts and used by
  // scroll-sync's line-based editor mapping (see scrollSync.ts).
  startLine?: number;
  lineCount?: number;
}

interface EditorSvcLike {
  previewCtx: { sectionDescList: SectionDesc[] };
  editorElt: HTMLElement;
  previewElt: HTMLElement;
  tocElt: HTMLElement;
  clEditor?: {
    view?: {
      lineBlockAt(pos: number): { top: number; bottom: number; height: number } | null;
    };
  };
}

const dimensionNormalizer = (dimensionName: keyof SectionDesc) => (editorSvc: EditorSvcLike): void => {
  const dimensionList = editorSvc.previewCtx.sectionDescList
    .map(sectionDesc => sectionDesc[dimensionName] as SectionDimension);
  let dimension: SectionDimension;
  let i: number;
  let j: number;
  for (i = 0; i < dimensionList.length; i += 1) {
    dimension = dimensionList[i];
    if (dimension.height) {
      for (j = i + 1; j < dimensionList.length && dimensionList[j].height === 0; j += 1) {
        // Loop
      }
      const normalizeFactor = j - i;
      if (normalizeFactor !== 1) {
        const normalizedHeight = dimension.height / normalizeFactor;
        dimension.height = normalizedHeight;
        dimension.endOffset = dimension.startOffset + dimension.height;
        for (j = i + 1; j < i + normalizeFactor; j += 1) {
          const startOffset = dimension.endOffset;
          dimension = dimensionList[j];
          dimension.startOffset = startOffset;
          dimension.height = normalizedHeight;
          dimension.endOffset = dimension.startOffset + dimension.height;
        }
        i = j - 1;
      }
    }
  }
};

const normalizeEditorDimensions = dimensionNormalizer('editorDimension');
const normalizePreviewDimensions = dimensionNormalizer('previewDimension');
const normalizeTocDimensions = dimensionNormalizer('tocDimension');

// Resolve a section's editor-space top offset. cledit had a per-section
// `editorElt` div with a real `offsetTop`; CM6 doesn't render
// per-section DOM, so we ask CM6's height map for the y-coord of the
// section's first character (via `view.lineBlockAt(charOffset).top`)
// and translate that from `.cm-content` space into the `.editor`
// scroll container's coordinate space. The translation is the constant
// offset between `.cm-content`'s top and `.editor`'s scroll origin —
// stable as long as the editor pane isn't resized, which we re-measure
// on every call so resizes naturally settle on the next sync.
function resolveEditorSectionTop(
  editorSvc: EditorSvcLike,
  desc: SectionDesc,
  charOffset: number,
  fallback: number,
): number {
  if (desc.editorElt) return desc.editorElt.offsetTop;
  const view = editorSvc.clEditor?.view;
  if (!view) return fallback;
  try {
    const block = view.lineBlockAt(charOffset);
    if (!block) return fallback;
    const editorInner = editorSvc.editorElt;
    const cmContent = editorInner.querySelector('.cm-content') as HTMLElement | null;
    if (!cmContent) return fallback;
    const scrollContainer = editorInner.parentElement || editorInner;
    const cmRect = cmContent.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const cmContentTopInContainer = cmRect.top - containerRect.top
      + (scrollContainer.scrollTop || 0);
    return Math.max(0, Math.round(cmContentTopInContainer + block.top));
  } catch {
    return fallback;
  }
}

export default {
  measureSectionDimensions(editorSvc: EditorSvcLike): void {
    const list = editorSvc.previewCtx.sectionDescList;
    if (!list.length) return;

    // Source-line range index. Each section's text ends with `\n` per
    // the parser, so the section spans
    // `(text.match(/\n/g) || []).length` source lines. Cumulative
    // startLine = previous section's startLine + lineCount. Line
    // numbers are 1-based to match CM6's `state.doc.lineAt().number`.
    let cumulativeLine = 1;
    for (let k = 0; k < list.length; k += 1) {
      const text = list[k].section?.text || '';
      const lc = Math.max(1, (text.match(/\n/g) || []).length);
      list[k].startLine = cumulativeLine;
      list[k].lineCount = lc;
      cumulativeLine += lc;
    }

    let editorSectionOffset = 0;
    let previewSectionOffset = 0;
    let tocSectionOffset = 0;
    let sectionDesc = list[0];
    let nextSectionDesc: SectionDesc;
    let i = 1;
    let runningCharOffset = sectionDesc?.section?.text?.length ?? 0;
    for (; i < list.length; i += 1) {
      nextSectionDesc = list[i];

      // Editor section: lineBlockAt-derived top offset
      let newEditorSectionOffset = resolveEditorSectionTop(
        editorSvc,
        nextSectionDesc,
        runningCharOffset,
        editorSectionOffset,
      );
      newEditorSectionOffset = newEditorSectionOffset > editorSectionOffset
        ? newEditorSectionOffset
        : editorSectionOffset;
      sectionDesc.editorDimension = new SectionDimension(
        editorSectionOffset,
        newEditorSectionOffset,
      );
      editorSectionOffset = newEditorSectionOffset;

      // Preview section: rendered HTML wrapper offsetTop (real DOM)
      let newPreviewSectionOffset = nextSectionDesc.previewElt
        ? nextSectionDesc.previewElt.offsetTop
        : previewSectionOffset;
      newPreviewSectionOffset = newPreviewSectionOffset > previewSectionOffset
        ? newPreviewSectionOffset
        : previewSectionOffset;
      sectionDesc.previewDimension = new SectionDimension(
        previewSectionOffset,
        newPreviewSectionOffset,
      );
      previewSectionOffset = newPreviewSectionOffset;

      // TOC section: rendered TOC item offsetTop
      let newTocSectionOffset = nextSectionDesc.tocElt
        ? nextSectionDesc.tocElt.offsetTop + (nextSectionDesc.tocElt.offsetHeight / 2)
        : tocSectionOffset;
      newTocSectionOffset = newTocSectionOffset > tocSectionOffset
        ? newTocSectionOffset
        : tocSectionOffset;
      sectionDesc.tocDimension = new SectionDimension(tocSectionOffset, newTocSectionOffset);
      tocSectionOffset = newTocSectionOffset;

      sectionDesc = nextSectionDesc;
      runningCharOffset += nextSectionDesc?.section?.text?.length ?? 0;
    }

    // Last section: clamp to live scrollHeights so it covers any
    // leftover space (rounding, image/font load shifts) and there's
    // never a gap where a scrollTop falls into no section's range.
    sectionDesc = list[i - 1];
    if (sectionDesc) {
      sectionDesc.editorDimension = new SectionDimension(
        editorSectionOffset,
        editorSvc.editorElt.scrollHeight,
      );
      sectionDesc.previewDimension = new SectionDimension(
        previewSectionOffset,
        editorSvc.previewElt.scrollHeight,
      );
      sectionDesc.tocDimension = new SectionDimension(
        tocSectionOffset,
        editorSvc.tocElt.scrollHeight,
      );
    }

    normalizeEditorDimensions(editorSvc);
    normalizePreviewDimensions(editorSvc);
    normalizeTocDimensions(editorSvc);
  },
};
