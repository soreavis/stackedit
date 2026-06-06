<template>
  <div class="editor" :class="{'editor--with-line-numbers': layoutSettings.showLineNumbers}">
    <div v-if="layoutSettings.showLineNumbers" class="editor__line-numbers" :style="{paddingTop: editorTopPadding}" aria-hidden="true">
      <span v-for="n in lineCount" :key="n">{{ n }}</span>
    </div>
    <pre class="editor__inner markdown-highlighting" :style="{padding: styles.editorPadding}" :class="{monospaced: computedSettings.editor.monospacedFontOnly}"></pre>
    <div v-if="loading" class="editor__loading" role="status" aria-label="Loading file">
      <div class="editor__loading-spinner"></div>
      <div class="editor__loading-label">Loading…</div>
    </div>
    <div v-if="cm6Enabled" class="editor__cm6-sandbox" aria-label="CodeMirror 6 sandbox (Stage 3 batch 1)">
      <div class="editor__cm6-sandbox-label">CM6 sandbox</div>
      <div ref="cm6Mount" class="editor__cm6-sandbox-mount"></div>
    </div>
    <div class="gutter" :style="{left: styles.editorGutterLeft + 'px'}">
      <comment-list v-if="styles.editorGutterWidth"></comment-list>
      <editor-new-discussion-button v-if="!isCurrentTemp"></editor-new-discussion-button>
    </div>
  </div>
</template>

<script lang="ts">

import { defineComponent, markRaw } from 'vue';
import { mapState as mapPiniaState } from 'pinia';
import CommentList from './gutters/CommentList.vue';
import EditorNewDiscussionButton from './gutters/EditorNewDiscussionButton.vue';
import editorSvc from '../services/editorSvc';
import { useFileStore } from '../stores/file';
import { useDataStore } from '../stores/data';
import { useLayoutStore } from '../stores/layout';
import { useDiscussionStore } from '../stores/discussion';
import { isCm6FlagEnabled } from '../services/editor/cm6/cm6Flag';

export default defineComponent({
  components: {
    CommentList,
    EditorNewDiscussionButton,
  },
  data: () => ({
    lineCount: 1,
    cm6Enabled: isCm6FlagEnabled(),
    // Shown until the editor has parsed + rendered first content. Big
    // markdown files take noticeable time to parse + decorate + apply
    // section measurements; the spinner gives the user immediate
    // feedback that something is happening rather than a blank pre.
    loading: true,
    // Non-reactive handles assigned in mounted()/beforeUnmount(). Declared
    // here so TS knows the shape; wrapped in markRaw where they hold live
    // disposables so Vue doesn't deep-proxy them.
    cm6Handle: null as { dispose: () => void } | null,
    loaderDismiss: null as (() => void) | null,
    loaderUnwatch: null as (() => void) | null,
  }),
  computed: {
    ...mapPiniaState(useFileStore, [
      'isCurrentTemp',
    ]),
    ...mapPiniaState(useLayoutStore, [
      'styles',
    ]),
    ...mapPiniaState(useDataStore, [
      'layoutSettings',
    ]),
    // computedSettings is a loose data-store getter typed `unknown`; expose
    // it through an explicit computed so template member access type-resolves.
    computedSettings(): any {
      return useDataStore().computedSettings;
    },
    editorTopPadding() {
      // Match the editor pre's top padding so the first line number
      // aligns with the first source line.
      const pad = this.styles.editorPadding || '';
      return pad.split(' ')[0] || '0px';
    },
  },
  mounted() {
    if (this.cm6Enabled) {
      // Lazy-load CM6 so flag-off users don't pay the ~250 KB chunk cost.
      import('../services/editor/cm6/cm6Editor').then(({ mountCm6Editor }) => {
        if (this.$refs.cm6Mount) {
          this.cm6Handle = markRaw(mountCm6Editor(this.$refs.cm6Mount as HTMLElement, {
            doc: '# CM6 sandbox\n\nStage 3 batch 1 — type here to verify the leaf editor works.\n',
          }));
        }
      });
    }

    // Recompute line count when content changes (sectionList event fires
    // after every parse). Cheap O(n) split on the editor text.
    const updateLineCount = () => {
      const text = (editorSvc.clEditor && editorSvc.clEditor.getContent && editorSvc.clEditor.getContent()) || '';
      this.lineCount = Math.max(1, text.split('\n').length);
    };
    editorSvc.$on('sectionList', updateLineCount);
    updateLineCount();

    // --- Document-loading overlay -----------------------------------
    // Re-arm the spinner on every file switch so the user gets immediate
    // feedback while a new file is read from IndexedDB + parsed +
    // decorated. Cached / small files load well under the show-delay
    // below, so quick switches never flash the overlay.
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLoaderTimers = () => {
      if (showTimer) clearTimeout(showTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      showTimer = null;
      safetyTimer = null;
    };
    const armLoader = (immediate: boolean) => {
      clearLoaderTimers();
      if (immediate) {
        this.loading = true;
      } else {
        // Delay so cached / fast loads don't flash the overlay.
        showTimer = setTimeout(() => { this.loading = true; }, 150);
      }
      // Belt-and-suspenders: never keep the spinner up longer than 8s
      // even if something goes wrong, so the user is never stuck staring
      // at a blank pane.
      safetyTimer = setTimeout(() => {
        if (showTimer) clearTimeout(showTimer);
        showTimer = null;
        this.loading = false;
      }, 8000);
    };
    const dismissLoader = () => {
      clearLoaderTimers();
      this.loading = false;
    };
    // `sectionList` fires after the bridge's contentChanged handler runs
    // markdown parsing, so by then the editor shows real content.
    // Persistent listener — fires on every switch, not just the first.
    this.loaderDismiss = dismissLoader;
    editorSvc.$on('sectionList', dismissLoader);
    // Re-arm whenever the open file changes. No file selected → no
    // spinner (EmptyDocument takes over the pane instead).
    this.loaderUnwatch = this.$watch(
      () => useFileStore().currentId,
      (id: string | null) => { if (id) armLoader(false); else dismissLoader(); },
    );
    // The file open on mount is already loading: keep the initial overlay
    // (data.loading starts true) but arm the 8s safety; drop it if there
    // is no current file.
    if (useFileStore().currentId) {
      safetyTimer = setTimeout(() => { this.loading = false; }, 8000);
    } else {
      this.loading = false;
    }

    const editorElt = this.$el.querySelector('.editor__inner') as HTMLElement;
    const onDiscussionEvt = (cb: (discussionId: string) => void) => (evt: Event) => {
      let elt = evt.target as (HTMLElement & { discussionId?: string }) | null;
      while (elt && elt !== editorElt) {
        // Cledit path: discussionId is a JS property on the wrap span.
        // CM6 path: data-discussion-id attribute on the decorated span.
        const id = elt.discussionId || (elt.dataset && elt.dataset.discussionId);
        if (id) {
          cb(id);
          return;
        }
        elt = elt.parentNode as (HTMLElement & { discussionId?: string }) | null;
      }
    };

    const classToggler = (toggle: boolean) => (discussionId: string) => {
      Array.from(editorElt.getElementsByClassName(`discussion-editor-highlighting--${discussionId}`))
        .forEach(elt => elt.classList.toggle('discussion-editor-highlighting--hover', toggle));
      Array.from(document.getElementsByClassName(`comment--discussion-${discussionId}`))
        .forEach(elt => elt.classList.toggle('comment--hover', toggle));
    };

    editorElt.addEventListener('mouseover', onDiscussionEvt(classToggler(true)));
    editorElt.addEventListener('mouseout', onDiscussionEvt(classToggler(false)));
    editorElt.addEventListener('click', onDiscussionEvt((discussionId) => {
      useDiscussionStore().setCurrentDiscussionId(discussionId);
    }));

    // Click-to-focus: a click on the empty area around or below the text
    // (the editor padding, or the blank space under a short / empty doc —
    // anywhere outside the CM6 editor box) focuses the editor and drops the
    // caret at the nearest position, falling back to the document end. This
    // makes an empty file editable by clicking anywhere in the pane, not
    // only on its single line. CM6 already handles clicks inside its own
    // box; the gutter (comments / new-discussion button) handles its own.
    this.$el.addEventListener('mousedown', (evt: MouseEvent) => {
      if (evt.button !== 0) return;
      if ((evt.target as HTMLElement).closest('.cm-editor, .gutter, .editor__cm6-sandbox')) return;
      const view = editorSvc.clEditor && editorSvc.clEditor.view;
      if (!view) return;
      const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY });
      evt.preventDefault();
      view.focus();
      // Plain `{anchor}` spec avoids a static @codemirror/state import here
      // (which would pull it into the main bundle, out of the lazy CM6 chunk).
      view.dispatch({ selection: { anchor: pos == null ? view.state.doc.length : pos } });
    });

    this.$watch(
      () => useDiscussionStore().currentDiscussionId,
      (discussionId: string | null, oldDiscussionId: string | null) => {
        if (oldDiscussionId) {
          editorElt.querySelectorAll(`.discussion-editor-highlighting--${oldDiscussionId}`)
            .forEach(elt => elt.classList.remove('discussion-editor-highlighting--selected'));
        }
        if (discussionId) {
          editorElt.querySelectorAll(`.discussion-editor-highlighting--${discussionId}`)
            .forEach(elt => elt.classList.add('discussion-editor-highlighting--selected'));
        }
      },
    );
  },
  beforeUnmount() {
    if (this.cm6Handle) {
      this.cm6Handle.dispose();
      this.cm6Handle = null;
    }
    if (this.loaderUnwatch) {
      this.loaderUnwatch();
      this.loaderUnwatch = null;
    }
    if (this.loaderDismiss) {
      editorSvc.$off('sectionList', this.loaderDismiss);
      this.loaderDismiss = null;
    }
  },
});
</script>

<style lang="scss">
@use '../styles/variables.scss' as *;

.editor {
  position: absolute;
  width: 100%;
  height: 100%;
  /* Vertical scrolling only. The inner <pre> uses `white-space: pre-wrap;
     word-break: break-word` so prose can never produce horizontal overflow,
     and fenced code blocks (`pre > code`) already get their own
     `overflow-x: auto` from base.scss. Setting `overflow: auto` here used
     to leave a permanent horizontal scrollbar on macOS systems with
     "Always show scrollbars". */
  overflow-x: hidden;
  overflow-y: auto;
}

/* Optional left-side line-number gutter, toggled via the button-bar
   `Toggle line numbers` button. Rendered as absolutely-positioned
   spans stacked at the same line-height as the editor so each number
   aligns with one source line. Wrapped (visually-multi-row) source
   lines still get a single number on the first row — like every code
   editor. */
.editor__line-numbers {
  position: absolute;
  left: 0;
  top: 0;
  width: 44px;
  padding-right: 8px;
  text-align: right;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.35);
  pointer-events: none;
  user-select: none;
  z-index: 1;

  .app--dark & {
    color: rgba(255, 255, 255, 0.3);
  }

  span {
    display: block;
  }
}

.editor--with-line-numbers .editor__inner {
  padding-left: 52px !important;
}

/* Loading state shown until the editor has parsed and rendered first
   content. Pinned to the editor pane (sticky-like via position:sticky
   would require scroll context; we use position:fixed with the parent
   editor's bounding box mapped via top/left in JS would be over-kill —
   absolute centered inside .editor is enough since the editor is the
   visible viewport). */
.editor__loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(2px);
  z-index: 5;
  pointer-events: none;
  font: 13px/1.4 $font-family-main;
  color: rgba(0, 0, 0, 0.55);

  .app--dark & {
    background: rgba(20, 20, 20, 0.55);
    color: rgba(255, 255, 255, 0.7);
  }
}

.editor__loading-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(0, 0, 0, 0.12);
  border-top-color: rgba(0, 0, 0, 0.55);
  animation: editor-spinner 0.9s linear infinite;

  .app--dark & {
    border-color: rgba(255, 255, 255, 0.18);
    border-top-color: rgba(255, 255, 255, 0.7);
  }
}

.editor__loading-label {
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 600;
}

@keyframes editor-spinner {
  to { transform: rotate(360deg); }
}

/* Stage 3 batch 1 sandbox: appears only with `?cm6=1` query param.
   Pinned bottom-right so it doesn't fight cledit for layout. Removed
   along with cledit at Stage 3 cutover (batch 7). */
.editor__cm6-sandbox {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 480px;
  max-width: calc(100vw - 32px);
  height: 280px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .app--dark & {
    background: rgba(40, 40, 40, 0.97);
    border-color: rgba(255, 255, 255, 0.18);
  }
}

.editor__cm6-sandbox-label {
  flex: none;
  padding: 4px 10px;
  font: 600 11px/1.4 monospace;
  background: rgba(0, 0, 0, 0.06);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  letter-spacing: 0.04em;
  text-transform: uppercase;

  .app--dark & {
    background: rgba(255, 255, 255, 0.08);
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }
}

.editor__cm6-sandbox-mount {
  flex: 1;
  min-height: 0;
  overflow: auto;

  .cm-editor {
    height: 100%;
  }
}

.editor__inner {
  margin: 0;
  font-family: $font-family-main;
  font-variant-ligatures: no-common-ligatures;
  white-space: pre-wrap;
  word-break: break-word;
  word-wrap: break-word;

  * {
    line-height: $line-height-base;
  }

  .cledit-section {
    font-family: inherit;
  }

  .hide {
    display: none;
  }

  &.monospaced {
    font-family: $font-family-monospace !important;
    font-size: $font-size-monospace !important;

    * {
      font-size: inherit !important;
    }
  }
}
</style>
