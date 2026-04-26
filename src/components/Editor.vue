<template>
  <div class="editor" :class="{'editor--with-line-numbers': layoutSettings.showLineNumbers}">
    <div v-if="layoutSettings.showLineNumbers" class="editor__line-numbers" :style="{paddingTop: editorTopPadding}" aria-hidden="true">
      <span v-for="n in lineCount" :key="n">{{ n }}</span>
    </div>
    <pre class="editor__inner markdown-highlighting" :style="{padding: styles.editorPadding}" :class="{monospaced: computedSettings.editor.monospacedFontOnly}"></pre>
    <div class="gutter" :style="{left: styles.editorGutterLeft + 'px'}">
      <comment-list v-if="styles.editorGutterWidth"></comment-list>
      <editor-new-discussion-button v-if="!isCurrentTemp"></editor-new-discussion-button>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import { mapState as mapPiniaState } from 'pinia';
import CommentList from './gutters/CommentList';
import EditorNewDiscussionButton from './gutters/EditorNewDiscussionButton';
import editorSvc from '../services/editorSvc';
import store from '../store';
import { useFileStore } from '../stores/file';

export default {
  components: {
    CommentList,
    EditorNewDiscussionButton,
  },
  data: () => ({
    lineCount: 1,
  }),
  computed: {
    ...mapPiniaState(useFileStore, [
      'isCurrentTemp',
    ]),
    ...mapGetters('layout', [
      'styles',
    ]),
    ...mapGetters('data', [
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
      store.commit('discussion/setCurrentDiscussionId', discussionId);
    }));

    this.$watch(
      () => store.state.discussion.currentDiscussionId,
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
