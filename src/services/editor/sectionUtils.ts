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
}

interface EditorSvcLike {
  previewCtx: { sectionDescList: SectionDesc[] };
  editorElt: HTMLElement;
  previewElt: HTMLElement;
  tocElt: HTMLElement;
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

export default {
  measureSectionDimensions(editorSvc: EditorSvcLike): void {
    let editorSectionOffset = 0;
    let previewSectionOffset = 0;
    let tocSectionOffset = 0;
    let sectionDesc = editorSvc.previewCtx.sectionDescList[0];
    let nextSectionDesc: SectionDesc;
    let i = 1;
    for (; i < editorSvc.previewCtx.sectionDescList.length; i += 1) {
      nextSectionDesc = editorSvc.previewCtx.sectionDescList[i];

      // Measure editor section
      let newEditorSectionOffset = nextSectionDesc.editorElt
        ? nextSectionDesc.editorElt.offsetTop
        : editorSectionOffset;
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
