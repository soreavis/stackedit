// 600-line legacy editor service. Mixes editorSvcDiscussions +
// editorSvcUtils onto a Vue instance via Object.assign — the composite
// shape stays loosely typed (`any`) until the underlying mixins define
// shared editor-state interfaces.
import { watch } from 'vue';
import Vue from 'vue';
import DiffMatchPatch from 'diff-match-patch';
import Prism from 'prismjs';
// @ts-expect-error — no type declarations published for this package
import markdownItPandocRenderer from 'markdown-it-pandoc-renderer';
import { debounce } from './editor/sharedUtils';
import htmlSanitizer from '../libs/htmlSanitizer';
import markdownConversionSvc from './markdownConversionSvc';
import markdownGrammarSvc from './markdownGrammarSvc';
import sectionUtils from './editor/sectionUtils';
import extensionSvc from './extensionSvc';
import editorSvcDiscussions from './editor/editorSvcDiscussions';
import editorSvcUtils from './editor/editorSvcUtils';
import utils from './utils';
import { useContentStore } from '../stores/content';
import { useContentStateStore } from '../stores/contentState';
import { useModalStore } from '../stores/modal';
import { useDataStore } from '../stores/data';
import { useLayoutStore } from '../stores/layout';

const allowDebounce = (action: (...args: any[]) => any, wait: number): any => {
  let timeoutId: any;
  return (doDebounce: boolean = false, ...params: any[]): void => {
    clearTimeout(timeoutId);
    if (doDebounce) {
      timeoutId = setTimeout(() => action(...params), wait);
    } else {
      action(...params);
    }
  };
};

const diffMatchPatch: any = new DiffMatchPatch();
let instantPreview = true;
let tokens: any;

class SectionDesc {
  section: any;
  editorElt: any;
  previewElt: any;
  tocElt: any;
  html: any;

  constructor(section: any, previewElt: any, tocElt: any, html: any) {
    this.section = section;
    this.editorElt = section.elt;
    this.previewElt = previewElt;
    this.tocElt = tocElt;
    this.html = html;
  }
}

// Use a vue instance as an event bus
const editorSvc: any = Object.assign(new Vue(), editorSvcDiscussions, editorSvcUtils, {
  // Elements
  editorElt: null as any,
  previewElt: null as any,
  tocElt: null as any,
  // Other objects
  clEditor: null as any,
  options: null as any,
  prismGrammars: null as any,
  converter: null as any,
  parsingCtx: null as any,
  conversionCtx: null as any,
  previewCtx: {
    sectionDescList: [] as any[],
  } as any,
  previewCtxMeasured: null as any,
  previewCtxWithDiffs: null as any,
  sectionList: null as any,
  selectionRange: null as any,
  previewSelectionRange: null as any,
  previewSelectionStartOffset: null as any,

  /**
   * Initialize the Prism grammar with the options
   */
  initPrism(this: any): void {
    const options = {
      ...this.options,
      insideFences: (markdownConversionSvc as any).defaultOptions.insideFences,
    };
    this.prismGrammars = (markdownGrammarSvc as any).makeGrammars(options);
  },

  /**
   * Initialize the markdown-it converter with the options
   */
  initConverter(this: any): void {
    this.converter = (markdownConversionSvc as any).createConverter(this.options, true);
  },

  /**
   * Initialize the cledit editor with markdown-it section parser and Prism highlighter
   */
  initClEditor(this: any): void {
    this.previewCtxMeasured = null;
    editorSvc.$emit('previewCtxMeasured', null);
    this.previewCtxWithDiffs = null;
    editorSvc.$emit('previewCtxWithDiffs', null);
    const options: any = {
      sectionHighlighter: (section: any) => (Prism as any)
        .highlight(section.text, this.prismGrammars[section.data]),
      sectionParser: (text: string) => {
        this.parsingCtx = (markdownConversionSvc as any).parseSections(this.converter, text);
        return this.parsingCtx.sections;
      },
      getCursorFocusRatio: (): number => {
        if ((useDataStore() as any).layoutSettings.focusMode) {
          return 1;
        }
        return 0.15;
      },
    };
    this.initClEditorInternal(options);
    this.restoreScrollPosition();
  },

  /**
   * Finish the conversion initiated by the section parser
   */
  convert(this: any): void {
    this.conversionCtx = (markdownConversionSvc as any).convert(this.parsingCtx, this.conversionCtx);
    // Freeze preview height before refresh swaps section HTML in & out.
    // Without this lock, the scrollbar's max-scroll position changes
    // mid-reflow, the browser reclamps preview.scrollTop, and scroll
    // sync sees the resulting jiggle as user-driven preview scroll —
    // the visible "stutter" while the editor is being typed in or a
    // long file is loading. Original benweet/stackedit did exactly
    // this on `conversionCtx`, then released it on `previewText`.
    if (this.previewElt) {
      this.previewElt.style.height = `${this.previewElt.offsetHeight}px`;
    }
    this.$emit('conversionCtx', this.conversionCtx);
    ({ tokens } = this.parsingCtx.markdownState);
  },

  /**
   * Refresh the preview with the result of `convert()`
   */
  async refreshPreview(this: any): Promise<void> {
    const sectionDescList: any[] = [];
    let sectionPreviewElt: any;
    let sectionTocElt: any;
    let sectionIdx = 0;
    let sectionDescIdx = 0;
    let insertBeforePreviewElt = this.previewElt.firstChild;
    let insertBeforeTocElt = this.tocElt.firstChild;
    let previewHtml = '';
    let loadingImages: any[] = [];
    // Collect Promises returned by extension `sectionPreview` listeners
    // (mermaid is the canonical async one — it ships a placeholder that
    // gets replaced by an SVG seconds later). Without awaiting these,
    // `measureSectionDimensions` runs against the placeholder size and
    // every section after a mermaid block ends up with stale preview
    // pixel offsets that scrolling can never recover from.
    const extensionPromises: Promise<unknown>[] = [];
    this.conversionCtx.htmlSectionDiff.forEach((item: any) => {
      for (let i = 0; i < item[1].length; i += 1) {
        const section = this.conversionCtx.sectionList[sectionIdx];
        if (item[0] === 0) {
          let sectionDesc = this.previewCtx.sectionDescList[sectionDescIdx];
          sectionDescIdx += 1;
          if (sectionDesc.editorElt !== section.elt) {
            // Force textToPreviewDiffs computation
            sectionDesc = new SectionDesc(
              section,
              sectionDesc.previewElt,
              sectionDesc.tocElt,
              sectionDesc.html,
            );
          }
          sectionDescList.push(sectionDesc);
          previewHtml += sectionDesc.html;
          sectionIdx += 1;
          insertBeforePreviewElt = insertBeforePreviewElt.nextSibling;
          insertBeforeTocElt = insertBeforeTocElt.nextSibling;
        } else if (item[0] === -1) {
          sectionDescIdx += 1;
          sectionPreviewElt = insertBeforePreviewElt;
          insertBeforePreviewElt = insertBeforePreviewElt.nextSibling;
          this.previewElt.removeChild(sectionPreviewElt);
          sectionTocElt = insertBeforeTocElt;
          insertBeforeTocElt = insertBeforeTocElt.nextSibling;
          this.tocElt.removeChild(sectionTocElt);
        } else if (item[0] === 1) {
          const html = htmlSanitizer.sanitizeHtml(this.conversionCtx.htmlSectionList[sectionIdx]);
          sectionIdx += 1;

          // Create preview section element
          sectionPreviewElt = document.createElement('div');
          sectionPreviewElt.className = 'cl-preview-section';
          sectionPreviewElt.innerHTML = html;
          if (insertBeforePreviewElt) {
            this.previewElt.insertBefore(sectionPreviewElt, insertBeforePreviewElt);
          } else {
            this.previewElt.appendChild(sectionPreviewElt);
          }
          extensionPromises.push(
            (extensionSvc as any).sectionPreview(sectionPreviewElt, this.options, true),
          );
          loadingImages = [
            ...loadingImages,
            ...Array.prototype.slice.call(sectionPreviewElt.getElementsByTagName('img')),
          ];

          // Create TOC section element
          sectionTocElt = document.createElement('div');
          sectionTocElt.className = 'cl-toc-section';
          const headingElt = sectionPreviewElt.querySelector('h1, h2, h3, h4, h5, h6');
          if (headingElt) {
            const clonedElt: any = headingElt.cloneNode(true);
            clonedElt.removeAttribute('id');
            sectionTocElt.appendChild(clonedElt);
          }
          if (insertBeforeTocElt) {
            this.tocElt.insertBefore(sectionTocElt, insertBeforeTocElt);
          } else {
            this.tocElt.appendChild(sectionTocElt);
          }

          previewHtml += html;
          sectionDescList.push(new SectionDesc(section, sectionPreviewElt, sectionTocElt, html));
        }
      }
    });

    this.tocElt.classList[
      this.tocElt.querySelector('.cl-toc-section *') ? 'remove' : 'add'
    ]('toc-tab--empty');

    this.previewCtx = {
      markdown: this.conversionCtx.text,
      html: previewHtml.replace(/^\s+|\s+$/g, ''),
      text: this.previewElt.textContent,
      sectionDescList,
    };
    this.$emit('previewCtx', this.previewCtx);
    this.makeTextToPreviewDiffs();

    // Wait for images to load
    const loadedPromises = loadingImages.map((imgElt: any) => new Promise<void>((resolve) => {
      if (!imgElt.src) {
        resolve();
        return;
      }
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = imgElt.src;
    }));
    // Wait for BOTH image loads AND async extension renders (mermaid,
    // katex, etc.) BEFORE the single measurement — matches the
    // original benweet/stackedit pattern. Measuring after only image
    // loads gave us stale preview pixel offsets for any section with
    // a mermaid diagram, since the placeholder is tiny but the
    // rendered SVG is hundreds of pixels tall. Promise.allSettled
    // tolerates a single diagram failing to render — every other
    // section still gets correct measurements.
    await Promise.allSettled([
      ...loadedPromises,
      ...extensionPromises,
    ]);

    // Release the height lock that `convert()` placed on previewElt to
    // suppress reflow-jiggle. After this, the preview's scrollHeight
    // reflects the real rendered height (including mermaid SVGs etc.)
    // and scroll-sync can measure correct section offsets.
    if (this.previewElt) {
      this.previewElt.style.removeProperty('height');
    }
    this.measureSectionDimensions(!!this.previewCtxMeasured);
  },

  /**
   * Measure the height of each section in editor, preview and toc.
   */
  measureSectionDimensions: allowDebounce((restoreScrollPosition: boolean = false, force: boolean = false) => {
    if (force || editorSvc.previewCtx !== editorSvc.previewCtxMeasured) {
      (sectionUtils as any).measureSectionDimensions(editorSvc);
      editorSvc.previewCtxMeasured = editorSvc.previewCtx;
      if (restoreScrollPosition) {
        editorSvc.restoreScrollPosition();
      }
      editorSvc.$emit('previewCtxMeasured', editorSvc.previewCtxMeasured);
    }
  }, 500),

  /**
   * Compute the diffs between editor's markdown and preview's html
   * asynchronously unless there is only one section to compute.
   */
  makeTextToPreviewDiffs(this: any): void {
    if (editorSvc.previewCtx !== editorSvc.previewCtxWithDiffs) {
      const makeOne = (): void => {
        let hasOne = false;
        const hasMore = editorSvc.previewCtx.sectionDescList
          .some((sectionDesc: any) => {
            if (!sectionDesc.textToPreviewDiffs) {
              if (hasOne) {
                return true;
              }
              if (!sectionDesc.previewText) {
                sectionDesc.previewText = sectionDesc.previewElt.textContent;
              }
              sectionDesc.textToPreviewDiffs = diffMatchPatch.diff_main(
                sectionDesc.section.text,
                sectionDesc.previewText,
              );
              hasOne = true;
            }
            return false;
          });
        if (hasMore) {
          setTimeout(() => makeOne(), 10);
        } else {
          editorSvc.previewCtxWithDiffs = editorSvc.previewCtx;
          editorSvc.$emit('previewCtxWithDiffs', editorSvc.previewCtxWithDiffs);
        }
      };
      makeOne();
    }
  },

  /**
   * Save editor selection/scroll state into the store.
   */
  saveContentState: allowDebounce(() => {
    const scrollPosition = editorSvc.getScrollPosition() ||
      (useContentStateStore() as any).current.scrollPosition;
    (useContentStateStore() as any).patchCurrent({
      selectionStart: editorSvc.clEditor.selectionMgr.selectionStart,
      selectionEnd: editorSvc.clEditor.selectionMgr.selectionEnd,
      scrollPosition,
    });
  }, 100),

  /**
   * Report selection from the preview to the editor.
   */
  saveSelection: allowDebounce(() => {
    const selection = window.getSelection();
    let range: any = selection && selection.rangeCount && selection.getRangeAt(0);
    if (range) {
      if (

        !(editorSvc.previewElt.compareDocumentPosition(range.startContainer) &
          window.Node.DOCUMENT_POSITION_CONTAINED_BY) ||
        !(editorSvc.previewElt.compareDocumentPosition(range.endContainer) &
          window.Node.DOCUMENT_POSITION_CONTAINED_BY)

      ) {
        range = null;
      }
    }
    if (editorSvc.previewSelectionRange !== range) {
      let previewSelectionStartOffset: any;
      let previewSelectionEndOffset: any;
      if (range) {
        const startRange = document.createRange();
        startRange.setStart(editorSvc.previewElt, 0);
        startRange.setEnd(range.startContainer, range.startOffset);
        previewSelectionStartOffset = `${startRange}`.length;
        previewSelectionEndOffset = previewSelectionStartOffset + `${range}`.length;
        const editorStartOffset = editorSvc.getEditorOffset(previewSelectionStartOffset);
        const editorEndOffset = editorSvc.getEditorOffset(previewSelectionEndOffset);
        if (editorStartOffset != null && editorEndOffset != null) {
          editorSvc.clEditor.selectionMgr.setSelectionStartEnd(
            editorStartOffset,
            editorEndOffset,
          );
        }
      }
      editorSvc.previewSelectionRange = range;
      editorSvc.$emit('previewSelectionRange', editorSvc.previewSelectionRange);
    }
  }, 50),

  /**
   * Returns the pandoc AST generated from the file tokens and the converter options
   */
  getPandocAst(this: any): any {
    return tokens && (markdownItPandocRenderer as any)(tokens, this.converter.options);
  },

  /**
   * Pass the elements to the store and initialize the editor.
   */
  init(this: any, editorElt: HTMLElement, previewElt: HTMLElement, tocElt: HTMLElement): void {
    this.editorElt = editorElt;
    this.previewElt = previewElt;
    this.tocElt = tocElt;

    this.createClEditor(editorElt);

    this.clEditor.on('contentChanged', (content: any, diffs: any, sectionList: any) => {
      this.parsingCtx = {
        ...this.parsingCtx,
        sectionList,
      };
    });
    this.clEditor.undoMgr.on('undoStateChange', () => {
      const canUndo = this.clEditor.undoMgr.canUndo();
      if (canUndo !== useLayoutStore().canUndo) {
        useLayoutStore().setCanUndo(canUndo);
      }
      const canRedo = this.clEditor.undoMgr.canRedo();
      if (canRedo !== useLayoutStore().canRedo) {
        useLayoutStore().setCanRedo(canRedo);
      }
    });
    // Stage 3 batch 11 — pagedown removed. NavigationBar / shortcuts
    // dispatch directly through cm6Commands; link / image modals are
    // wired at the call site (linkCommand / imageCommand factories
    // accept the modal opener as an argument).

    this.editorElt.parentNode.addEventListener('scroll', () => this.saveContentState(true));
    this.previewElt.parentNode.addEventListener('scroll', () => this.saveContentState(true));

    const refreshPreview = allowDebounce(() => {
      this.convert();
      if (instantPreview) {
        this.refreshPreview();
        this.measureSectionDimensions(false, true);
      } else {
        setTimeout(() => this.refreshPreview(), 10);
      }
      instantPreview = false;
    }, 25);

    let newSectionList: any;
    let newSelectionRange: any;
    const onEditorChanged = allowDebounce(() => {
      if (this.sectionList !== newSectionList) {
        this.sectionList = newSectionList;
        this.$emit('sectionList', this.sectionList);
        refreshPreview(!instantPreview);
      }
      if (this.selectionRange !== newSelectionRange) {
        this.selectionRange = newSelectionRange;
        this.$emit('selectionRange', this.selectionRange);
      }
      this.saveContentState();
    }, 10);

    this.clEditor.selectionMgr.on('selectionChanged', (start: any, end: any, selectionRange: any) => {
      newSelectionRange = selectionRange;
      onEditorChanged(!instantPreview);
    });

    /* -----------------------------
     * Inline images
     */

    const imgCache: any = Object.create(null);

    const hashImgElt = (imgElt: any): string => `${imgElt.src}:${imgElt.width || -1}:${imgElt.height || -1}`;

    const addToImgCache = (imgElt: any): void => {
      const hash = hashImgElt(imgElt);
      let entries = imgCache[hash];
      if (!entries) {
        entries = [];
        imgCache[hash] = entries;
      }
      entries.push(imgElt);
    };

    const getFromImgCache = (imgEltsToCache: any): any => {
      const hash = hashImgElt(imgEltsToCache);
      const entries = imgCache[hash];
      if (!entries) {
        return null;
      }
      let imgElt: any;
      return entries
        .some((entry: any) => {
          if (this.editorElt.contains(entry)) {
            return false;
          }
          imgElt = entry;
          return true;
        }) && imgElt;
    };

    const triggerImgCacheGc = debounce(() => {
      Object.entries(imgCache).forEach(([src, entries]: [string, any]) => {
        // Filter entries that are not attached to the DOM
        const filteredEntries = entries.filter((imgElt: any) => this.editorElt.contains(imgElt));
        if (filteredEntries.length) {
          imgCache[src] = filteredEntries;
        } else {
          delete imgCache[src];
        }
      });
    }, 100);

    let imgEltsToCache: any[] = [];
    if ((useDataStore() as any).computedSettings.editor.inlineImages) {
      this.clEditor.highlighter.on('sectionHighlighted', (section: any) => {
        Array.from(section.elt.getElementsByClassName('token img')).forEach((imgTokenElt: any) => {
          const srcElt = imgTokenElt.querySelector('.token.cl-src');
          if (srcElt) {
            // Create an img element before the .img.token and wrap both elements
            // into a .token.img-wrapper
            const imgElt = document.createElement('img');
            imgElt.style.display = 'none';
            const uri = srcElt.textContent;
            if (!/^unsafe/.test((htmlSanitizer as any).sanitizeUri(uri, true))) {
              imgElt.onload = () => {
                imgElt.style.display = '';
              };
              imgElt.src = uri;
              // Take img size into account
              const sizeElt = imgTokenElt.querySelector('.token.cl-size');
              if (sizeElt) {
                const match = sizeElt.textContent.match(/=(\d*)x(\d*)/);
                if (match[1]) {
                  imgElt.width = parseInt(match[1], 10);
                }
                if (match[2]) {
                  imgElt.height = parseInt(match[2], 10);
                }
              }
              imgEltsToCache.push(imgElt);
            }
            const imgTokenWrapper = document.createElement('span');
            imgTokenWrapper.className = 'token img-wrapper';
            imgTokenElt.parentNode.insertBefore(imgTokenWrapper, imgTokenElt);
            imgTokenWrapper.appendChild(imgElt);
            imgTokenWrapper.appendChild(imgTokenElt);
          }
        });
      });
    }

    this.clEditor.highlighter.on('highlighted', () => {
      imgEltsToCache.forEach((imgElt: any) => {
        const cachedImgElt = getFromImgCache(imgElt);
        if (cachedImgElt) {
          // Found a previously loaded image that has just been released
          imgElt.parentNode.replaceChild(cachedImgElt, imgElt);
        } else {
          addToImgCache(imgElt);
        }
      });
      imgEltsToCache = [];
      // Eject released images from cache
      triggerImgCacheGc();
    });

    this.clEditor.on('contentChanged', (content: any, diffs: any, sectionList: any) => {
      newSectionList = sectionList;
      onEditorChanged(!instantPreview);
    });

    // clEditorSvc.setPreviewElt(element[0].querySelector('.preview__inner-2'))
    // var previewElt = element[0].querySelector('.preview')
    // clEditorSvc.isPreviewTop = previewElt.scrollTop < 10
    // previewElt.addEventListener('scroll', function () {
    //   var isPreviewTop = previewElt.scrollTop < 10
    //   if (isPreviewTop !== clEditorSvc.isPreviewTop) {
    //     clEditorSvc.isPreviewTop = isPreviewTop
    //     scope.$apply()
    //   }
    // })

    // Watch file content changes
    let lastContentId: any = null;
    let lastProperties: any;
    watch(
      () => (useContentStore() as any).currentChangeTrigger,
      () => {
        const content: any = useContentStore().current;
        // Track ID changes
        let initClEditor = false;
        if (content.id !== lastContentId) {
          instantPreview = true;
          lastContentId = content.id;
          initClEditor = true;
        }
        // Track properties changes
        if (content.properties !== lastProperties) {
          lastProperties = content.properties;
          const options = (extensionSvc as any).getOptions((useContentStore() as any).currentProperties);
          if (utils.serializeObject(options) !== utils.serializeObject(this.options)) {
            this.options = options;
            this.initPrism();
            this.initConverter();
            initClEditor = true;
          }
        }
        if (initClEditor) {
          this.initClEditor();
        }
        // Apply potential text and discussion changes
        this.applyContent();
      }, {
        immediate: true,
      },
    );

    // Disable editor if hidden or if no content is loaded
    watch(
      () => (useContentStore() as any).isCurrentEditable,
      (editable: any) => this.clEditor.toggleEditable(!!editable), {
        immediate: true,
      },
    );

    watch(
      () => utils.serializeObject((useLayoutStore() as any).styles),
      () => this.measureSectionDimensions(false, true, true),
    );

    this.initHighlighters();
    this.$emit('inited');
  },
});

export default editorSvc;
