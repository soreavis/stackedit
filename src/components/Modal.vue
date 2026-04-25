<template>
  <transition name="modal-fade">
    <div class="modal" :class="{ 'modal--with-banner': !isSponsor }" v-if="config" @keydown.esc.stop="onEscape" @keydown.enter="onEnter" @keydown.tab="onTab" @focusin="onFocusInOut" @focusout="onFocusInOut">
      <div class="modal__sponsor-banner" v-if="!isSponsor">
        StackEdit is <a class="not-tabbable" target="_blank" rel="noopener noreferrer" href="https://github.com/benweet/stackedit/">open source</a>, please consider
        <a class="not-tabbable" href="javascript:void(0)" @click="sponsor">sponsoring</a> for just $5.
      </div>
      <component v-if="currentModalComponent" :is="currentModalComponent"></component>
      <modal-inner v-else aria-label="Dialog">
        <div class="modal__content" v-html="simpleModal.contentHtml(config)"></div>
        <div class="modal__button-bar">
          <button class="button" v-if="simpleModal.rejectText" @click="config.reject()">{{ simpleModal.rejectText }}</button>
          <button class="button button--resolve" v-if="simpleModal.resolveText" @click="config.resolve()">{{ simpleModal.resolveText }}</button>
        </div>
      </modal-inner>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from 'vuex';
import simpleModals from '../data/simpleModals';
import editorSvc from '../services/editorSvc';
import syncSvc from '../services/syncSvc';
import googleHelper from '../services/providers/helpers/googleHelper';
import store from '../store';

import ModalInner from './modals/common/ModalInner';
import FilePropertiesModal from './modals/FilePropertiesModal';
import SettingsModal from './modals/SettingsModal';
import TemplatesModal from './modals/TemplatesModal';
import AboutModal from './modals/AboutModal';
import HtmlExportModal from './modals/HtmlExportModal';
import PdfExportModal from './modals/PdfExportModal';
import PandocExportModal from './modals/PandocExportModal';
import LinkModal from './modals/LinkModal';
import ImageModal from './modals/ImageModal';
import SyncManagementModal from './modals/SyncManagementModal';
import PublishManagementModal from './modals/PublishManagementModal';
import WorkspaceManagementModal from './modals/WorkspaceManagementModal';
import AccountManagementModal from './modals/AccountManagementModal';
import BadgeManagementModal from './modals/BadgeManagementModal';
import SponsorModal from './modals/SponsorModal';
import CommandPaletteModal from './modals/CommandPaletteModal';

// Providers
import GooglePhotoModal from './modals/providers/GooglePhotoModal';
import GoogleDriveAccountModal from './modals/providers/GoogleDriveAccountModal';
import GoogleDriveSaveModal from './modals/providers/GoogleDriveSaveModal';
import GoogleDriveWorkspaceModal from './modals/providers/GoogleDriveWorkspaceModal';
import GoogleDrivePublishModal from './modals/providers/GoogleDrivePublishModal';
import DropboxAccountModal from './modals/providers/DropboxAccountModal';
import DropboxSaveModal from './modals/providers/DropboxSaveModal';
import DropboxPublishModal from './modals/providers/DropboxPublishModal';
import GithubAccountModal from './modals/providers/GithubAccountModal';
import GithubOpenModal from './modals/providers/GithubOpenModal';
import GithubSaveModal from './modals/providers/GithubSaveModal';
import GithubWorkspaceModal from './modals/providers/GithubWorkspaceModal';
import GithubPublishModal from './modals/providers/GithubPublishModal';
import GistSyncModal from './modals/providers/GistSyncModal';
import GistPublishModal from './modals/providers/GistPublishModal';
import GitlabAccountModal from './modals/providers/GitlabAccountModal';
import GitlabOpenModal from './modals/providers/GitlabOpenModal';
import GitlabPublishModal from './modals/providers/GitlabPublishModal';
import GitlabSaveModal from './modals/providers/GitlabSaveModal';
import GitlabWorkspaceModal from './modals/providers/GitlabWorkspaceModal';
import WordpressPublishModal from './modals/providers/WordpressPublishModal';
import BloggerPublishModal from './modals/providers/BloggerPublishModal';
import BloggerPagePublishModal from './modals/providers/BloggerPagePublishModal';
import ZendeskAccountModal from './modals/providers/ZendeskAccountModal';
import ZendeskPublishModal from './modals/providers/ZendeskPublishModal';
import CouchdbWorkspaceModal from './modals/providers/CouchdbWorkspaceModal';
import CouchdbCredentialsModal from './modals/providers/CouchdbCredentialsModal';

const getTabbables = container => container.querySelectorAll('a[href], button, .textfield, input[type=checkbox]')
  // Filter enabled and visible element
  .cl_filter(el => !el.disabled && el.offsetParent !== null && !el.classList.contains('not-tabbable'));

export default {
  components: {
    ModalInner,
    FilePropertiesModal,
    SettingsModal,
    TemplatesModal,
    AboutModal,
    HtmlExportModal,
    PdfExportModal,
    PandocExportModal,
    LinkModal,
    ImageModal,
    SyncManagementModal,
    PublishManagementModal,
    WorkspaceManagementModal,
    AccountManagementModal,
    BadgeManagementModal,
    SponsorModal,
    CommandPaletteModal,
    // Providers
    GooglePhotoModal,
    GoogleDriveAccountModal,
    GoogleDriveSaveModal,
    GoogleDriveWorkspaceModal,
    GoogleDrivePublishModal,
    DropboxAccountModal,
    DropboxSaveModal,
    DropboxPublishModal,
    GithubAccountModal,
    GithubOpenModal,
    GithubSaveModal,
    GithubWorkspaceModal,
    GithubPublishModal,
    GistSyncModal,
    GistPublishModal,
    GitlabAccountModal,
    GitlabOpenModal,
    GitlabPublishModal,
    GitlabSaveModal,
    GitlabWorkspaceModal,
    WordpressPublishModal,
    BloggerPublishModal,
    BloggerPagePublishModal,
    ZendeskAccountModal,
    ZendeskPublishModal,
    CouchdbWorkspaceModal,
    CouchdbCredentialsModal,
  },
  computed: {
    ...mapGetters([
      'isSponsor',
    ]),
    ...mapGetters('modal', [
      'config',
    ]),
    currentModalComponent() {
      if (this.config.type) {
        let componentName = this.config.type[0].toUpperCase();
        componentName += this.config.type.slice(1);
        componentName += 'Modal';
        if (this.$options.components[componentName]) {
          return componentName;
        }
      }
      return null;
    },
    simpleModal() {
      return simpleModals[this.config.type] || {};
    },
  },
  mounted() {
    this.$watch(
      () => this.config,
      (isOpen) => {
        if (isOpen) {
          const tabbables = getTabbables(this.$el);
          if (tabbables[0]) {
            tabbables[0].focus();
          }
        }
      },
      { immediate: true },
    );
  },
  methods: {
    async sponsor() {
      try {
        if (!store.getters['workspace/sponsorToken']) {
          // User has to sign in
          await store.dispatch('modal/open', 'signInForSponsorship');
          await googleHelper.signin();
          syncSvc.requestSync();
        }
        if (!store.getters.isSponsor) {
          await store.dispatch('modal/open', 'sponsor');
        }
      } catch (e) { /* cancel */ }
    },
    onEscape() {
      this.config.reject();
      editorSvc.clEditor.focus();
    },
    onEnter(evt) {
      // Skip when the user is typing into a multi-line textarea or a
      // contenteditable region — Enter there should insert a newline.
      // Select / input / button targets all forward Enter to the resolve
      // button as the universal "confirm" action.
      const target = evt.target;
      if (target && target.tagName === 'TEXTAREA') return;
      if (target && target.isContentEditable) return;
      const resolve = this.$el && this.$el.querySelector('.button--resolve');
      if (resolve && !resolve.disabled) {
        evt.preventDefault();
        resolve.click();
      }
    },
    onTab(evt) {
      const tabbables = getTabbables(this.$el);
      const firstTabbable = tabbables[0];
      const lastTabbable = tabbables[tabbables.length - 1];
      if (evt.shiftKey && firstTabbable === evt.target) {
        evt.preventDefault();
        lastTabbable.focus();
      } else if (!evt.shiftKey && lastTabbable === evt.target) {
        evt.preventDefault();
        firstTabbable.focus();
      }
    },
    onFocusInOut(evt) {
      const { parentNode } = evt.target;
      if (parentNode && parentNode.parentNode) {
        // Focus effect
        if (parentNode.classList.contains('form-entry__field')
          && parentNode.parentNode.classList.contains('form-entry')) {
          parentNode.parentNode.classList.toggle(
            'form-entry--focused',
            evt.type === 'focusin',
          );
        }
      }
    },
  },
};
</script>

<style lang="scss">
@use 'sass:color';
@use '../styles/variables.scss' as *;

.modal {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: rgba(160, 160, 160, 0.5);
  // Flex-center the card on both axes so modals land in the middle of
  // the viewport instead of floating 40px from the top.
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  overflow: hidden;

  p {
    line-height: 1.5;
  }
}

// When the sponsor banner is visible, reserve space for it so centered
// modals don't slide under it. (60px base + 32px banner.)
.modal--with-banner {
  padding-top: 92px;
}

// Fast open/close easing so modals don't blink in/out. Fades the overlay
// and gently scales the card up from 96% → 100%. 150ms ease-out feels
// responsive but not jarring.
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 150ms ease-out;

  .modal__inner-1 {
    transition: transform 150ms ease-out;
  }
}

.modal-fade-enter,
.modal-fade-leave-to {
  opacity: 0;

  .modal__inner-1 {
    transform: scale(0.96);
  }
}

// Tab-swap transition — used by Settings / File Properties tab panels
// (wrap them in <transition name="tab-swap" mode="out-in">). Cross-fade
// with a small vertical slide so the content change reads as a smooth
// swap rather than a snap. Container height still jumps (CSS can't
// transition flex-auto height in a cross-browser way), but the opacity
// overlap masks it.
.tab-swap-enter-active,
.tab-swap-leave-active {
  transition: opacity 120ms ease-out, transform 120ms ease-out;
}

.tab-swap-enter {
  opacity: 0;
  transform: translateY(4px);
}

.tab-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.modal__sponsor-banner {
  position: fixed;
  z-index: 1;
  width: 100%;
  color: color.adjust($error-color, $lightness: -10%);
  background-color: color.adjust(color.adjust($error-color, $lightness: 33%), $alpha: -0.075);
  font-size: 0.9em;
  line-height: 1.33;
  text-align: center;
  padding: 0.25em 1em;
}

.modal__inner-1 {
  width: 100%;
  min-width: 320px;
  max-width: 600px;
  max-height: 100%;
  display: flex;

  // Ease window-resize and max-width override changes so modals don't
  // snap to a new width when the viewport / per-modal class changes.
  // `interpolate-size: allow-keywords` (Chrome 129+, Firefox 130+)
  // additionally lets the card animate between auto-driven widths;
  // unsupported browsers silently fall back to the snap.
  interpolate-size: allow-keywords;
  transition:
    max-width 250ms ease-out,
    width 250ms ease-out;
}

.modal__inner-2 {
  flex: 1 1 auto;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: #f8f8f8;
  padding: 0 50px;

  // Smooth height changes (tab switches, "Show" expanders, etc.).
  // Same progressive-enhancement pattern as .modal__inner-1.
  interpolate-size: allow-keywords;
  transition:
    max-height 250ms ease-out,
    height 250ms ease-out;
  border-radius: $border-radius-base;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: $border-radius-base;
    width: 100%;
    background-image: linear-gradient(to left, #ffd700, #ffd700 23%, #a5c700 27%, #a5c700 48%, #ff8a00 52%, #ff8a00 73%, #66aefd 77%);
    z-index: 2;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    height: $border-radius-base;
    width: 100%;
    background-image: linear-gradient(to right, #ffd700, #ffd700 23%, #a5c700 27%, #a5c700 48%, #ff8a00 52%, #ff8a00 73%, #66aefd 77%);
    z-index: 2;
  }
}

// Optional pinned header — opt-in via `.modal__header` in the modal's
// template. Does not scroll with the body. Used on long modals where
// the intro / tabs / selector should stay reachable (Badges, Settings,
// Templates).
.modal__header {
  flex: 0 0 auto;
  padding: 50px 0 16px;
  background-color: #f8f8f8;
  position: relative;
  z-index: 1;
}

.modal__content {
  // Scrollable middle of the modal card. The header (if present) stays
  // pinned above and the button bar stays pinned below; only this
  // region scrolls when content exceeds the card's max-height.
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding: 50px 0 0;

  // Scrollbars: invisible by default, fade in on hover. Matches macOS
  // behaviour and keeps the modal chrome clean when content fits.
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  // Combine the scrollbar fade with a height ease so tab switches and
  // "Show more" expanders resize the body smoothly.
  interpolate-size: allow-keywords;
  transition:
    scrollbar-color 200ms ease-out,
    height 250ms ease-out;

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
    transition: background-color 200ms ease-out;
  }

  &:hover {
    scrollbar-color: rgba(0, 0, 0, 0.22) transparent;

    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.22);
    }
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.4);
  }
}

// When a sticky header is present, the content below doesn't need the
// full 50px top padding — the header already provides separation.
.modal__header + .modal__content {
  padding-top: 16px;
}

.modal__content > :first-child,
.modal__content > .modal__image:first-child + * {
  margin-top: 0;
}

.modal__image {
  float: left;
  width: 60px;
  height: 60px;
  margin: 1.5em 1.2em 0.5em 0;

  & + *::after {
    content: '';
    display: block;
    clear: both;
  }
}

.modal__title {
  font-weight: bold;
  font-size: 1.5rem;
  line-height: 1.4;
  margin-top: 2.5rem;
}

.modal__sub-title {
  opacity: 0.6;
  font-size: 0.75rem;
  margin-bottom: 1.5rem;
}

.modal__error {
  color: #de2c00;
}

.modal__info {
  background-color: $info-bg;
  border-radius: $border-radius-base;
  margin: 1.2em 0;
  padding: 0.75em 1.25em;
  font-size: 0.95em;
  line-height: 1.6;

  pre {
    line-height: 1.5;
  }
}

.modal__info--multiline {
  padding-top: 0.1em;
  padding-bottom: 0.1em;
}

.modal__button-bar {
  flex: 0 0 auto;
  padding: 16px 0 40px;
  background-color: #f8f8f8;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  position: relative;
  z-index: 1;
}

.form-entry {
  margin: 1em 0;
}

.form-entry__label {
  display: block;
  font-size: 0.9rem;
  color: #808080;

  .form-entry--focused & {
    color: color.adjust($link-color, $lightness: -10%);
  }

  .form-entry--error & {
    color: color.adjust($error-color, $lightness: -10%);
  }
}

.form-entry__label-info {
  font-size: 0.75rem;
}

.form-entry__field {
  border: 1px solid #b0b0b0;
  border-radius: $border-radius-base;
  position: relative;
  overflow: hidden;

  .form-entry--focused & {
    border-color: $link-color;
    box-shadow: 0 0 0 2.5px color.adjust($link-color, $alpha: -0.67);
  }

  .form-entry--error & {
    border-color: $error-color;
    box-shadow: 0 0 0 2.5px color.adjust($error-color, $alpha: -0.67);
  }
}

.form-entry__actions {
  text-align: right;
  margin: 0.25em;
}

.form-entry__button {
  width: 38px;
  height: 38px;
  padding: 6px;
  display: inline-block;
  background-color: transparent;
  opacity: 0.75;

  &:active,
  &:focus,
  &:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.1);
  }
}

.form-entry__radio,
.form-entry__checkbox {
  margin: 0.25em 1em;

  input {
    margin-right: 0.25em;
  }
}

.form-entry__info {
  font-size: 0.75em;
  opacity: 0.67;
  line-height: 1.4;
  margin: 0.25em 0;
}

.tabs {
  border-bottom: 1px solid $hr-color;
  margin: 1em 0 2em;

  &::after {
    content: '';
    display: block;
    clear: both;
  }
}

.tabs__tab {
  width: 50%;
  float: left;
  text-align: center;
  line-height: 1.4;
  font-weight: 400;
  font-size: 1.1em;
}

.tabs__tab > a {
  width: 100%;
  text-decoration: none;
  padding: 0.67em 0.33em;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  border-top-left-radius: $border-radius-base;
  border-top-right-radius: $border-radius-base;
  color: $link-color;

  /* `:focus-visible` (not `:focus`) so programmatic / mouse-driven focus
     on an inactive tab doesn't paint the grey hover background — that
     made Simple-properties look active after modal open even though YAML
     was the selected tab. Keyboard nav still gets the affordance. */
  &:hover,
  &:focus-visible {
    background-color: rgba(0, 0, 0, 0.05);
  }
}

.tabs__tab--active > a {
  border-bottom: 2px solid $link-color;
  color: inherit;
}
</style>
