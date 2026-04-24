<template>
  <nav class="navigation-bar" :class="{'navigation-bar--editor': styles.showEditor && !revisionContent, 'navigation-bar--light': light}">
    <!-- Explorer -->
    <div class="navigation-bar__inner navigation-bar__inner--left navigation-bar__inner--button">
      <button class="navigation-bar__button navigation-bar__button--close button" v-if="light" @click="close()" v-title="'Close StackEdit'"><icon-check-circle></icon-check-circle></button>
      <button class="navigation-bar__button navigation-bar__button--explorer-toggler button" v-else tour-step-anchor="explorer" @click="toggleExplorer()" v-title="styles.showExplorer ? 'Click to close file panel' : 'Click to open file panel'"><icon-folder></icon-folder></button>
    </div>
    <!-- Side bar -->
    <div class="navigation-bar__inner navigation-bar__inner--right navigation-bar__inner--button">
      <a class="navigation-bar__button navigation-bar__button--stackedit button" v-if="light" href="app" target="_blank" rel="noopener noreferrer" v-title="'Open StackEdit'"><icon-provider provider-id="stackedit"></icon-provider></a>
      <button class="navigation-bar__button navigation-bar__button--stackedit button" v-else tour-step-anchor="menu" @click="toggleSideBar()" v-title="'Click to open menu'"><icon-provider provider-id="stackedit"></icon-provider></button>
    </div>
    <div class="navigation-bar__inner navigation-bar__inner--right navigation-bar__inner--title flex flex--row">
      <!-- Spinner -->
      <div class="navigation-bar__spinner">
        <div v-if="!offline && showSpinner" class="spinner"></div>
        <icon-sync-off v-if="offline"></icon-sync-off>
      </div>
      <!-- File meta -->
      <div class="navigation-bar__meta" v-if="metaText && !titleFocus" v-title="metaTooltip">{{ metaText }}</div>
      <!-- Title -->
      <div class="navigation-bar__title navigation-bar__title--fake text-input"></div>
      <div class="navigation-bar__title navigation-bar__title--text text-input" :style="{width: titleWidth + 'px'}">{{ title }}</div>
      <input class="navigation-bar__title navigation-bar__title--input text-input" :class="{'navigation-bar__title--focus': titleFocus, 'navigation-bar__title--scrolling': titleScrolling}" :style="{width: titleWidth + 'px'}" @focus="editTitle(true)" @blur="editTitle(false)" @keydown.enter="submitTitle(false)" @keydown.esc.stop="submitTitle(true)" @mouseenter="titleHover = true" @mouseleave="titleHover = false" v-model="title">
      <button class="navigation-bar__button navigation-bar__button--close-file button" v-if="hasCurrentFile" @click="closeCurrentFile" v-title="'Close file'"><icon-close></icon-close></button>
      <!-- Sync/Publish -->
      <div class="flex flex--row" :class="{'navigation-bar__hidden': styles.hideLocations}">
        <a class="navigation-bar__button navigation-bar__button--location button" :class="{'navigation-bar__button--blink': location.id === currentLocation.id}" v-for="location in syncLocations" :key="location.id" :href="location.url" target="_blank" rel="noopener noreferrer" v-title="'Synchronized location'"><icon-provider :provider-id="location.providerId"></icon-provider></a>
        <button class="navigation-bar__button navigation-bar__button--sync button" :disabled="!isSyncPossible || isSyncRequested || offline" @click="requestSync" v-title="'Synchronize now'"><icon-sync></icon-sync></button>
        <a class="navigation-bar__button navigation-bar__button--location button" :class="{'navigation-bar__button--blink': location.id === currentLocation.id}" v-for="location in publishLocations" :key="location.id" :href="location.url" target="_blank" rel="noopener noreferrer" v-title="'Publish location'"><icon-provider :provider-id="location.providerId"></icon-provider></a>
        <button class="navigation-bar__button navigation-bar__button--publish button" :disabled="!publishLocations.length || isPublishRequested || offline" @click="requestPublish" v-title="'Publish now'"><icon-upload></icon-upload></button>
      </div>
      <!-- Revision -->
      <div class="flex flex--row" v-if="revisionContent">
        <button class="navigation-bar__button navigation-bar__button--revision navigation-bar__button--restore button" @click="restoreRevision">Restore</button>
        <button class="navigation-bar__button navigation-bar__button--revision button" @click="setRevisionContent()" v-title="'Close revision'"><icon-close></icon-close></button>
      </div>
    </div>
    <div class="navigation-bar__inner navigation-bar__inner--edit-pagedownButtons">
      <button class="navigation-bar__button button" @click="undo" v-title="'Undo'" :disabled="!canUndo"><icon-undo></icon-undo></button>
      <button class="navigation-bar__button button" @click="redo" v-title="'Redo'" :disabled="!canRedo"><icon-redo></icon-redo></button>
      <div v-for="button in pagedownButtons" :key="button.method">
        <button class="navigation-bar__button button" v-if="button.method" @click="pagedownClick(button.method)" v-title="button.titleWithShortcut">
          <component :is="button.iconClass"></component>
        </button>
        <div class="navigation-bar__spacer" v-else></div>
      </div>
    </div>
  </nav>
</template>

<script>
import { mapState, mapMutations, mapGetters, mapActions } from 'vuex';
import editorSvc from '../services/editorSvc';
import syncSvc from '../services/syncSvc';
import publishSvc from '../services/publishSvc';
import animationSvc from '../services/animationSvc';
import tempFileSvc from '../services/tempFileSvc';
import utils from '../services/utils';
import pagedownButtons from '../data/pagedownButtons';
import store from '../store';
import workspaceSvc from '../services/workspaceSvc';
import badgeSvc from '../services/badgeSvc';

// According to mousetrap
const mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Ctrl';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(n) {
  return n.toLocaleString();
}

// 220 wpm is a widely-cited mid-range average for adult silent reading;
// round up so very short docs still show "1 min" rather than "0 min".
function formatReadingTime(words) {
  if (!words) return '0 min';
  const mins = Math.max(1, Math.round(words / 220));
  return `${mins} min`;
}

const getShortcut = (method) => {
  let result = '';
  Object.entries(store.getters['data/computedSettings'].shortcuts).some(([keys, shortcut]) => {
    if (`${shortcut.method || shortcut}` === method) {
      result = keys.split('+').map(key => key.toLowerCase()).map((key) => {
        if (key === 'mod') {
          return mod;
        }
        // Capitalize
        return key && `${key[0].toUpperCase()}${key.slice(1)}`;
      }).join('+');
    }
    return result;
  });
  return result && ` – ${result}`;
};

export default {
  data: () => ({
    mounted: false,
    title: '',
    titleFocus: false,
    titleHover: false,
  }),
  computed: {
    ...mapState([
      'light',
      'offline',
    ]),
    ...mapState('queue', [
      'isSyncRequested',
      'isPublishRequested',
      'currentLocation',
    ]),
    ...mapState('layout', [
      'canUndo',
      'canRedo',
    ]),
    ...mapState('content', [
      'revisionContent',
    ]),
    ...mapGetters('layout', [
      'styles',
    ]),
    ...mapGetters('syncLocation', {
      syncLocations: 'current',
    }),
    ...mapGetters('publishLocation', {
      publishLocations: 'current',
    }),
    pagedownButtons() {
      return pagedownButtons.map(button => ({
        ...button,
        titleWithShortcut: `${button.title}${getShortcut(button.method)}`,
        iconClass: `icon-${button.icon}`,
      }));
    },
    isSyncPossible() {
      return store.getters['workspace/syncToken'] ||
        store.getters['syncLocation/current'].length;
    },
    showSpinner() {
      return !store.state.queue.isEmpty;
    },
    titleWidth() {
      // Intentional side effect: write the current title into a hidden
      // fake-input element so its rendered width drives the visible input.
      // Upstream pattern since 2017; refactoring to a watch-based flow would
      // introduce a render-frame lag that ruins the typing feel.
      if (!this.mounted) {
        return 0;
      }
      // eslint-disable-next-line vue/no-side-effects-in-computed-properties
      this.titleFakeElt.textContent = this.title;
      const width = this.titleFakeElt.getBoundingClientRect().width + 2; // 2px for the caret
      return Math.min(width, this.styles.titleMaxWidth);
    },
    titleScrolling() {
      const result = this.titleHover && !this.titleFocus;
      if (this.titleInputElt) {
        if (result) {
          const scrollLeft = this.titleInputElt.scrollWidth - this.titleInputElt.offsetWidth;
          animationSvc.animate(this.titleInputElt)
            .scrollLeft(scrollLeft)
            .duration(scrollLeft * 10)
            .easing('inOut')
            .start();
        } else {
          animationSvc.animate(this.titleInputElt)
            .scrollLeft(0)
            .start();
        }
      }
      return result;
    },
    editCancelTrigger() {
      const current = store.getters['file/current'];
      return utils.serializeObject([
        current.id,
        current.name,
      ]);
    },
    hasCurrentFile() {
      return !!store.getters['file/current'].id;
    },
    metaParts() {
      const current = store.getters['file/current'];
      if (!current || !current.id) return null;
      const content = store.getters['content/current'];
      const text = (content && content.text) || '';
      const bytes = new Blob([text]).size;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
      const path = store.getters.pathsByItemId[current.id] || '';
      const parent = path.replace(/[^/]*$/, '').replace(/\/$/, '') || '/';
      const lastOpenedMap = store.getters['data/lastOpened'] || {};
      const lastOpenedTs = lastOpenedMap[current.id];
      return {
        bytes,
        words,
        lines,
        chars: text.length,
        parent,
        path,
        lastOpenedTs,
        fileId: current.id,
      };
    },
    metaText() {
      const m = this.metaParts;
      if (!m) return '';
      const parts = [];
      parts.push(formatBytes(m.bytes));
      parts.push(`${formatNumber(m.words)} w`);
      parts.push(`${formatNumber(m.lines)} l`);
      parts.push(`${formatReadingTime(m.words)} read`);
      if (m.parent && m.parent !== '/') parts.push(m.parent);
      return parts.join(' · ');
    },
    metaTooltip() {
      const m = this.metaParts;
      if (!m) return '';
      const rows = [
        `Path: ${m.path || '—'}`,
        `Size: ${formatBytes(m.bytes)} (${formatNumber(m.chars)} chars)`,
        `Words: ${formatNumber(m.words)}`,
        `Lines: ${formatNumber(m.lines)}`,
        `Reading time: ${formatReadingTime(m.words)} (~220 wpm)`,
        `ID: ${m.fileId}`,
      ];
      if (m.lastOpenedTs) {
        rows.push(`Opened: ${new Date(m.lastOpenedTs).toLocaleString()}`);
      }
      return rows.join('\n');
    },
  },
  methods: {
    ...mapMutations('content', [
      'setRevisionContent',
    ]),
    ...mapActions('content', [
      'restoreRevision',
    ]),
    ...mapActions('data', [
      'toggleExplorer',
      'toggleSideBar',
    ]),
    undo() {
      return editorSvc.clEditor.undoMgr.undo();
    },
    redo() {
      return editorSvc.clEditor.undoMgr.redo();
    },
    requestSync() {
      if (this.isSyncPossible && !this.isSyncRequested) {
        syncSvc.requestSync(true);
      }
    },
    requestPublish() {
      if (this.publishLocations.length && !this.isPublishRequested) {
        publishSvc.requestPublish();
      }
    },
    closeCurrentFile() {
      store.commit('explorer/setUserClosedFile', true);
      store.commit('file/setCurrentId', null);
    },
    pagedownClick(name) {
      if (store.getters['content/isCurrentEditable']) {
        const text = editorSvc.clEditor.getContent();
        editorSvc.pagedownEditor.uiManager.doClick(name);
        if (text !== editorSvc.clEditor.getContent()) {
          badgeSvc.addBadge('formatButtons');
        }
      }
    },
    async editTitle(toggle) {
      this.titleFocus = toggle;
      if (toggle) {
        this.titleInputElt.setSelectionRange(0, this.titleInputElt.value.length);
      } else {
        const title = this.title.trim();
        this.title = store.getters['file/current'].name;
        if (title && this.title !== title) {
          try {
            await workspaceSvc.storeItem({
              ...store.getters['file/current'],
              name: title,
            });
            badgeSvc.addBadge('editCurrentFileName');
          } catch (e) {
            // Cancel
          }
        }
      }
    },
    submitTitle(reset) {
      if (reset) {
        this.title = '';
      }
      this.titleInputElt.blur();
    },
    close() {
      tempFileSvc.close();
    },
  },
  created() {
    this.$watch(
      () => this.editCancelTrigger,
      () => {
        this.title = '';
        this.editTitle(false);
      },
      { immediate: true },
    );
  },
  mounted() {
    this.titleFakeElt = this.$el.querySelector('.navigation-bar__title--fake');
    this.titleInputElt = this.$el.querySelector('.navigation-bar__title--input');
    this.mounted = true;
  },
};
</script>

<style lang="scss">
@use 'sass:color';
@use 'sass:math';
@use '../styles/variables.scss' as *;

.navigation-bar {
  position: absolute;
  width: 100%;
  height: 100%;
  padding-top: 4px;
  overflow: hidden;
}

.navigation-bar__hidden {
  display: none;
}

.navigation-bar__inner--left {
  float: left;

  &.navigation-bar__inner--button {
    margin-right: 12px;
  }
}

.navigation-bar__inner--right {
  float: right;

  /* prevent from seeing wrapped pagedownButtons */
  margin-bottom: 20px;
}

.navigation-bar__inner--button {
  margin: 0 4px;
}

.navigation-bar__inner--edit-pagedownButtons {
  margin-left: 15px;

  .navigation-bar__button,
  .navigation-bar__spacer {
    float: left;
  }
}

.navigation-bar__inner--title * {
  flex: none;
}

.navigation-bar__button,
.navigation-bar__spacer {
  height: 36px;
  padding: 0 4px;

  /* prevent from seeing wrapped pagedownButtons */
  margin-bottom: 20px;
}

.navigation-bar__button {
  width: 34px;
  padding: 0 7px;
  transition: opacity 0.25s;

  .navigation-bar__inner--button & {
    padding: 0 4px;
    width: 38px;

    &.navigation-bar__button--stackedit {
      opacity: 0.85;

      &:active,
      &:focus,
      &:hover {
        opacity: 1;
      }
    }
  }
}

.navigation-bar__button--revision {
  width: 38px;

  &:first-child {
    margin-left: 10px;
  }

  &:last-child {
    margin-right: 10px;
  }
}

.navigation-bar__button--restore {
  width: auto;
}

.navigation-bar__title {
  margin: 0 4px;
  font-size: 21px;

  .layout--revision & {
    position: absolute;
    left: -9999px;
  }
}

.navigation-bar__title,
.navigation-bar__button {
  display: inline-block;
  color: $navbar-color;
  background-color: transparent;
}

.navigation-bar__button--sync,
.navigation-bar__button--publish {
  padding: 0 6px;
  margin: 0 5px;
}

.navigation-bar__button[disabled] {
  &,
  &:active,
  &:focus,
  &:hover {
    color: $navbar-color;
  }
}

.navigation-bar__title--input,
.navigation-bar__button {
  &:active,
  &:focus,
  &:hover {
    color: $navbar-hover-color;
    background-color: $navbar-hover-background;
  }
}

.navigation-bar__button--location {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  padding: 2px;
  margin-top: 8px;
  opacity: 0.5;
  background-color: rgba(255, 255, 255, 0.2);

  &:active,
  &:focus,
  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.2);
  }
}

.navigation-bar__button--blink {
  animation: blink 1s linear infinite;
}

.navigation-bar__title--fake {
  position: absolute;
  left: -9999px;
  width: auto;
  white-space: pre-wrap;
}

.navigation-bar__title--text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  .navigation-bar--editor & {
    display: none;
  }
}

.navigation-bar__title--input,
.navigation-bar__inner--edit-pagedownButtons {
  display: none;

  .navigation-bar--editor & {
    display: block;
  }
}

.navigation-bar__button {
  display: none;

  .navigation-bar__inner--button &,
  .navigation-bar--editor & {
    display: inline-block;
  }
}

.navigation-bar__button--revision {
  display: inline-block;
}

.navigation-bar__button--close {
  color: color.adjust($link-color, $lightness: 15%);

  &:active,
  &:focus,
  &:hover {
    color: color.adjust($link-color, $lightness: 25%);
  }
}

.navigation-bar__title--input {
  cursor: pointer;

  &.navigation-bar__title--focus {
    cursor: text;
  }

  .navigation-bar--light & {
    display: none;
  }
}

$r: 10px;
$d: $r * 2;
$b: math.div($d, 10);
$t: 3000ms;

.navigation-bar__meta {
  margin: 14px 10px 0 10px;
  font-size: 11px;
  line-height: 1.2;
  opacity: 0.55;
  color: $navbar-color;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
  cursor: help;
}

.navigation-bar__button--close-file {
  opacity: 0.6;
  margin-left: 4px;

  &:hover { opacity: 1; }
}

.navigation-bar__spinner {
  width: 24px;
  margin: 7px 0 0 8px;

  .icon {
    width: 24px;
    height: 24px;
    color: color.adjust($error-color, $alpha: -0.5);
  }
}

.spinner {
  width: $d;
  height: $d;
  display: block;
  position: relative;
  border: $b solid color.adjust($navbar-color, $alpha: -0.5);
  border-radius: 50%;
  margin: 2px;

  &::before,
  &::after {
    content: "";
    position: absolute;
    display: block;
    width: $b;
    background-color: $navbar-color;
    border-radius: $b * 0.5;
    transform-origin: 50% 0;
  }

  &::before {
    height: $r * 0.4;
    left: $r - $b * 1.5;
    top: 50%;
    animation: spin $t linear infinite;
  }

  &::after {
    height: $r * 0.6;
    left: $r - $b * 1.5;
    top: 50%;
    animation: spin math.div($t, 4) linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes blink {
  50% {
    opacity: 1;
  }
}
</style>
