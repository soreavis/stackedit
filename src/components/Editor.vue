<template>
  <div class="editor" :class="{'editor--with-line-numbers': layoutSettings.showLineNumbers}">
    <div v-if="layoutSettings.showLineNumbers" class="editor__line-numbers" :style="{paddingTop: editorTopPadding}" aria-hidden="true">
      <span v-for="n in lineCount" :key="n">{{ n }}</span>
    </div>
    <pre class="editor__inner markdown-highlighting" :style="{padding: styles.editorPadding}" :class="{monospaced: computedSettings.editor.monospacedFontOnly}"></pre>
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

<script>

import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import CommentList from './gutters/CommentList';
import EditorNewDiscussionButton from './gutters/EditorNewDiscussionButton';
import editorSvc from '../services/editorSvc';
import { useFileStore } from '../stores/file';
import { useDataStore } from '../stores/data';
import { useLayoutStore } from '../stores/layout';
import { useDiscussionStore } from '../stores/discussion';
import { isCm6FlagEnabled } from '../services/editor/cm6/cm6Flag';

export default {
  components: {
    CommentList,
    EditorNewDiscussionButton,
  },
  data: () => ({
    lineCount: 1,
    cm6Enabled: isCm6FlagEnabled(),
  }),
  computed: {
    ...mapPiniaState(useFileStore, [
      'isCurrentTemp',
    ]),
    ...mapPiniaState(useLayoutStore, [
      'styles',
    ]),
    ...mapPiniaState(useDataStore, [
      'computedSettings',
      'layoutSettings',
    ]),
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
          this._cm6Handle = mountCm6Editor(this.$refs.cm6Mount, {
            doc: '# CM6 sandbox\n\nStage 3 batch 1 — type here to verify the leaf editor works.\n',
          });
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

    const editorElt = this.$el.querySelector('.editor__inner');
    const onDiscussionEvt = cb => (evt) => {
      let elt = evt.target;
      while (elt && elt !== editorElt) {
        if (elt.discussionId) {
          cb(elt.discussionId);
          return;
        }
        elt = elt.parentNode;
      }
    };

    const classToggler = toggle => (discussionId) => {
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

    this.$watch(
      () => useDiscussionStore().currentDiscussionId,
      (discussionId, oldDiscussionId) => {
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
  beforeDestroy() {
    if (this._cm6Handle) {
      this._cm6Handle.dispose();
      this._cm6Handle = null;
    }
  },
};
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
