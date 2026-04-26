// Section-dimension helpers used by the scroll-sync plumbing. Each
// section (a paragraph, list, blockquote, heading…) gets measured in
// editor-space, preview-space, and TOC-space, then normalized so empty
// sections borrow height from their neighbors and the proportions hold
// across all three columns.

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

// editorSvc has a `previewCtx.sectionDescList` of dimension-bearing
// objects. The fields on each dimension are SectionDimension instances.
interface SectionDesc {
  editorDimension: SectionDimension;
  previewDimension: SectionDimension;
  tocDimension: SectionDimension;
  editorElt?: HTMLElement;
  previewElt?: HTMLElement;
  tocElt?: HTMLElement;
  // section: the markdown-it section ({ data, text }); editorSvc's
  // SectionDesc constructor stashes it for downstream consumers
  // (textToPreviewDiffs, scroll sync). Optional because the cledit
  // path didn't always need it.
  section?: { text: string; data: string };
}

interface EditorSvcLike {
  previewCtx: { sectionDescList: SectionDesc[] };
  editorElt: HTMLElement;
  previewElt: HTMLElement;
  tocElt: HTMLElement;
  clEditor?: {
    // Stage 3 batch 9: when the CM6 bridge is active, section.elt is
    // never set (CM6 doesn't render `<div class="cledit-section">`
    // wrappers). Instead we measure via `view.coordsAtPos(offset)`
    // — character-offset in the doc maps to a viewport y, which we
    // translate to a scroll-container-relative offsetTop.
    view?: {
      coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number } | null;
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

// Resolve a section's editor-space top offset. Cledit path uses the
// rendered `<div class="cledit-section">` wrapper's offsetTop; CM6
// bridge path computes from char offset via view.coordsAtPos().
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
    const coords = view.coordsAtPos(charOffset);
    if (!coords) return fallback;
    const scrollerRect = editorSvc.editorElt.getBoundingClientRect();
    // editorElt.parentNode is the scroll container in cledit-mode; in
    // bridge-mode editorElt itself wraps the cm-content. Either way,
    // bounding-rect-relative y + scrollTop gives the equivalent of
    // offsetTop within the scrollable surface.
    const scrollTop = (editorSvc.editorElt.parentElement?.scrollTop) ?? editorSvc.editorElt.scrollTop ?? 0;
    return Math.max(0, Math.round(coords.top - scrollerRect.top + scrollTop));
  } catch {
    return fallback;
  }
}

export default {
  measureSectionDimensions(editorSvc: EditorSvcLike): void {
    let editorSectionOffset = 0;
    let previewSectionOffset = 0;
    let tocSectionOffset = 0;
    let sectionDesc = editorSvc.previewCtx.sectionDescList[0];
    let nextSectionDesc: SectionDesc;
    let i = 1;
    // Track running character offset for CM6-mode top resolution.
    let runningCharOffset = sectionDesc?.section?.text?.length ?? 0;
    for (; i < editorSvc.previewCtx.sectionDescList.length; i += 1) {
      nextSectionDesc = editorSvc.previewCtx.sectionDescList[i];

      // Measure editor section
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

      // Measure preview section
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

      // Measure TOC section
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

    // Last section
    sectionDesc = editorSvc.previewCtx.sectionDescList[i - 1];
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
