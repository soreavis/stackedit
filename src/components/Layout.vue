<template>
  <div class="layout" :class="{'layout--revision': revisionContent}">
    <div class="layout__panel flex flex--row" :class="{'flex--end': styles.showSideBar}">
      <div class="layout__panel layout__panel--explorer" v-show="styles.showExplorer" :aria-hidden="!styles.showExplorer" :style="{width: styles.layoutOverflow ? '100%' : constants.explorerWidth + 'px'}">
        <explorer></explorer>
      </div>
      <div class="layout__panel flex flex--column" tour-step-anchor="welcome,end" :style="{width: styles.innerWidth + 'px'}">
        <div class="layout__panel layout__panel--navigation-bar" v-show="styles.showNavigationBar" :style="{height: constants.navigationBarHeight + 'px'}">
          <navigation-bar></navigation-bar>
        </div>
        <div class="layout__panel flex flex--row" :style="{height: styles.innerHeight + 'px'}">
          <div class="layout__panel layout__panel--editor" v-show="styles.showEditor" :style="{width: (styles.editorWidth + styles.editorGutterWidth) + 'px', fontSize: styles.fontSize + 'px'}">
            <div class="gutter" :style="{left: styles.editorGutterLeft + 'px'}">
              <div class="gutter__background" v-if="styles.editorGutterWidth" :style="{width: styles.editorGutterWidth + 'px'}"></div>
            </div>
            <editor></editor>
            <div class="gutter" :style="{left: styles.editorGutterLeft + 'px'}">
              <sticky-comment v-if="styles.editorGutterWidth && stickyComment === 'top'"></sticky-comment>
              <current-discussion v-if="styles.editorGutterWidth"></current-discussion>
            </div>
          </div>
          <div class="layout__panel layout__panel--button-bar" v-show="styles.showEditor" :style="{width: constants.buttonBarWidth + 'px'}">
            <button-bar></button-bar>
          </div>
          <div class="layout__panel layout__panel--preview" v-show="styles.showPreview" :style="{width: (styles.previewWidth + styles.previewGutterWidth) + 'px', fontSize: styles.fontSize + 'px'}">
            <div class="gutter" :style="{left: styles.previewGutterLeft + 'px'}">
              <div class="gutter__background" v-if="styles.previewGutterWidth" :style="{width: styles.previewGutterWidth + 'px'}"></div>
            </div>
            <preview></preview>
            <div class="gutter" :style="{left: styles.previewGutterLeft + 'px'}">
              <sticky-comment v-if="styles.previewGutterWidth && stickyComment === 'top'"></sticky-comment>
              <current-discussion v-if="styles.previewGutterWidth"></current-discussion>
            </div>
          </div>
          <div class="layout__panel layout__panel--find-replace" v-if="showFindReplace">
            <find-replace></find-replace>
          </div>
          <div class="layout__empty flex flex--column flex--center" v-if="!hasCurrentFile">
            <div class="layout__empty-inner">
              <div class="layout__empty-icon">
                <icon-file-multiple></icon-file-multiple>
              </div>
              <div class="layout__empty-title">No file selected</div>
              <p class="layout__empty-hint">Create a new file or pick one from the explorer on the left.</p>
              <button class="button layout__empty-button" @click="createNewFile">New file</button>
            </div>
          </div>
        </div>
        <div class="layout__panel layout__panel--status-bar" v-show="styles.showStatusBar" :style="{height: constants.statusBarHeight + 'px'}">
          <status-bar></status-bar>
        </div>
      </div>
      <div class="layout__panel layout__panel--side-bar" v-show="styles.showSideBar" :style="{width: styles.layoutOverflow ? '100%' : styles.sideBarWidth + 'px'}">
        <side-bar></side-bar>
      </div>
    </div>
    <tour v-if="!light && !layoutSettings.welcomeTourFinished"></tour>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import NavigationBar from './NavigationBar';
import ButtonBar from './ButtonBar';
import StatusBar from './StatusBar';
import Explorer from './Explorer';
import SideBar from './SideBar';
import Editor from './Editor';
import Preview from './Preview';
import Tour from './Tour';
import StickyComment from './gutters/StickyComment';
import CurrentDiscussion from './gutters/CurrentDiscussion';
import FindReplace from './FindReplace';
import editorSvc from '../services/editorSvc';
import markdownConversionSvc from '../services/markdownConversionSvc';
import workspaceSvc from '../services/workspaceSvc';
import draftFilesSvc from '../services/draftFilesSvc';
import store from '../store';
import { useFindReplaceStore } from '../stores/findReplace';

export default {
  components: {
    NavigationBar,
    ButtonBar,
    StatusBar,
    Explorer,
    SideBar,
    Editor,
    Preview,
    Tour,
    StickyComment,
    CurrentDiscussion,
    FindReplace,
  },
  computed: {
    ...mapState([
      'light',
    ]),
    ...mapState('content', [
      'revisionContent',
    ]),
    ...mapState('discussion', [
      'stickyComment',
    ]),
    ...mapGetters('layout', [
      'constants',
      'styles',
    ]),
    ...mapGetters('data', [
      'layoutSettings',
    ]),
    showFindReplace() {
      return !!useFindReplaceStore().type;
    },
    hasCurrentFile() {
      // Show the editor only when a real file is actually selected. If
      // currentId is null (last file deleted, nothing opened yet, etc.)
      // the placeholder takes over regardless of whether the workspace
      // still contains other files.
      const current = store.getters['file/current'];
      return !!current.id && current.parentId !== 'trash';
    },
  },
  methods: {
    ...mapActions('layout', [
      'updateBodySize',
    ]),
    saveSelection: () => editorSvc.saveSelection(true),
    async createNewFile() {
      try {
        const item = await workspaceSvc.createFile({}, true);
        if (item && item.id) {
          draftFilesSvc.markAsDraft(item.id);
          store.commit('file/setCurrentId', item.id);
        }
      } catch (e) {
        // cancelled
      }
    },
  },
  created() {
    markdownConversionSvc.init(); // Needs to be inited before mount
    this.updateBodySize();
    window.addEventListener('resize', this.updateBodySize);
    window.addEventListener('keyup', this.saveSelection);
    window.addEventListener('mouseup', this.saveSelection);
    window.addEventListener('focusin', this.saveSelection);
    window.addEventListener('contextmenu', this.saveSelection);
  },
  mounted() {
    const editorElt = this.$el.querySelector('.editor__inner');
    const previewElt = this.$el.querySelector('.preview__inner-2');
    const tocElt = this.$el.querySelector('.toc__inner');
    editorSvc.init(editorElt, previewElt, tocElt);

    // Focus on the editor every time reader mode is disabled
    const focus = () => {
      if (this.styles.showEditor) {
        editorSvc.clEditor.focus();
      }
    };
    setTimeout(focus, 100);
    this.$watch(() => this.styles.showEditor, focus);
  },
  destroyed() {
    window.removeEventListener('resize', this.updateStyle);
    window.removeEventListener('keyup', this.saveSelection);
    window.removeEventListener('mouseup', this.saveSelection);
    window.removeEventListener('focusin', this.saveSelection);
    window.removeEventListener('contextmenu', this.saveSelection);
  },
};
</script>

<style lang="scss">
@use 'sass:color';
@use '../styles/variables.scss' as *;

.layout {
  position: absolute;
  width: 100%;
  height: 100%;
}

.layout__panel {
  position: relative;
  width: 100%;
  height: 100%;
  flex: none;
  overflow: hidden;
}

/* Width transition scoped to the right side-bar only — that's where it
   actually pays off (TOC mode grows the pane 280 → 392 px, smooth slide
   reads as intentional). Earlier this rule lived on `.layout__panel`
   broadly, which also animated the editor / preview when the LEFT
   explorer was toggled; during that 220 ms the editor's internal
   CodeMirror content didn't reflow yet and the new wider container
   showed an empty strip on the right for a fraction of a second.
   Restricting to --side-bar makes explorer toggle instant again. */
.layout__panel--side-bar {
  transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.layout__panel--navigation-bar {
  background-color: $navbar-bg;
}

.layout__panel--status-bar {
  background-color: #007acc;
}

.layout__panel--editor {
  background-color: $editor-background-light;

  .app--dark & {
    background-color: $editor-background-dark;
  }

  .gutter__background,
  .comment-list__current-discussion,
  .sticky-comment,
  .current-discussion {
    background-color: color.mix(#000, $editor-background-light, 6.7%);

    .app--dark & {
      background-color: color.mix(#fff, $editor-background-dark, 6.7%);
    }
  }
}

$preview-background-light: #f3f3f3;
$preview-background-dark: #252525;

.layout__panel--preview,
.layout__panel--button-bar {
  background-color: $preview-background-light;

  .app--dark & {
    background-color: $preview-background-dark;
  }
}

.layout__panel--preview {
  .gutter__background,
  .comment-list__current-discussion,
  .sticky-comment,
  .current-discussion {
    background-color: color.mix(#000, $preview-background-light, 6.7%);
  }
}

.layout__panel--explorer,
.layout__panel--side-bar {
  background-color: #ddd;
}

.layout__panel--find-replace {
  background-color: #e6e6e6;
  position: absolute;
  left: 0;
  bottom: 0;
  width: 300px;
  height: auto;
  border-top-right-radius: $border-radius-base;
}

.layout__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    45deg,
    $preview-background-light,
    $preview-background-light 14px,
    color.mix(#000, $preview-background-light, 3%) 14px,
    color.mix(#000, $preview-background-light, 3%) 28px
  );
  color: rgba(0, 0, 0, 0.55);
  text-align: center;
  padding: 20px;

  .app--dark & {
    background: repeating-linear-gradient(
      45deg,
      $preview-background-dark,
      $preview-background-dark 14px,
      color.mix(#fff, $preview-background-dark, 3%) 14px,
      color.mix(#fff, $preview-background-dark, 3%) 28px
    );
    color: rgba(255, 255, 255, 0.6);
  }
}

.layout__empty-inner {
  max-width: 360px;
  padding: 32px 28px;
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: $border-radius-base * 2;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(2px);

  .app--dark & {
    background-color: rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  }
}

.layout__empty-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 14px auto;
  color: rgba(0, 0, 0, 0.35);

  .app--dark & {
    color: rgba(255, 255, 255, 0.4);
  }

  .icon {
    width: 100%;
    height: 100%;
  }
}

.layout__empty-title {
  font-size: 22px;
  font-weight: 500;
  margin-bottom: 8px;
  color: rgba(0, 0, 0, 0.75);

  .app--dark & {
    color: rgba(255, 255, 255, 0.85);
  }
}

.layout__empty-hint {
  font-size: 14px;
  line-height: 1.4;
  margin: 0 0 18px 0;
}

.layout__empty-button {
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
  border-radius: $border-radius-base;
  background-color: rgba(0, 0, 0, 0.08);
  color: inherit;
  cursor: pointer;

  &:hover {
    background-color: rgba(0, 0, 0, 0.14);
  }

  .app--dark &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }
}
</style>
