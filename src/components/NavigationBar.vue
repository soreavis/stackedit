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
      <input class="navigation-bar__title navigation-bar__title--input text-input" :class="{'navigation-bar__title--focus': titleFocus, 'navigation-bar__title--scrolling': titleScrolling}" :style="{width: titleWidth + 'px'}" @focus="editTitle(true)" @blur="editTitle(false)" @keydown.enter="submitTitle(false)" @keydown.esc.stop="submitTitle(true)" @mouseenter="titleHover = true" @mouseleave="titleHover = false" @contextmenu="onTitleContextMenu" v-model="title">
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
        <button class="navigation-bar__button button" v-if="button.method" @click="pagedownClick(button.method, $event)" v-title="button.titleWithShortcut">
          <component :is="button.iconClass"></component>
        </button>
        <div class="navigation-bar__spacer" v-else></div>
      </div>
      <div class="navigation-bar__spacer"></div>
      <div v-for="button in customButtons" :key="button.method">
        <button class="navigation-bar__button button" :class="{'navigation-bar__button--separated': button.separated}" @click="customClick(button, $event)" v-title="button.title">
          <component :is="button.iconClass"></component>
        </button>
      </div>
    </div>
  </nav>
</template>

<script>
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import editorSvc from '../services/editorSvc';
import syncSvc from '../services/syncSvc';
import publishSvc from '../services/publishSvc';
import animationSvc from '../services/animationSvc';
import tempFileSvc from '../services/tempFileSvc';
import utils from '../services/utils';
import pagedownButtons from '../data/pagedownButtons';
import customToolbarButtons from '../data/customToolbarButtons';
import {
  cm6Commands,
  linkCommand as makeCm6LinkCommand,
  imageCommand as makeCm6ImageCommand,
} from '../services/editor/cm6/cm6Commands';
import { usePublishLocationStore } from '../stores/publishLocation';
import { useSyncLocationStore } from '../stores/syncLocation';
import { useWorkspaceStore } from '../stores/workspace';
import { useContentStore } from '../stores/content';
import { useFileStore } from '../stores/file';
import { useModalStore } from '../stores/modal';
import workspaceSvc from '../services/workspaceSvc';
import badgeSvc from '../services/badgeSvc';
import { useContextMenuStore } from '../stores/contextMenu';
import { useQueueStore } from '../stores/queue';
import { useDataStore } from '../stores/data';
import { useLayoutStore } from '../stores/layout';
import { useExplorerStore } from '../stores/explorer';
import { useGlobalStore } from '../stores/global';

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
  Object.entries(useDataStore().computedSettings.shortcuts).some(([keys, shortcut]) => {
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
    ...mapPiniaState(useGlobalStore, [
      'light',
      'offline',
    ]),
    ...mapPiniaState(useQueueStore, [
      'isSyncRequested',
      'isPublishRequested',
      'currentLocation',
    ]),
    ...mapPiniaState(useLayoutStore, [
      'canUndo',
      'canRedo',
    ]),
    ...mapPiniaState(useContentStore, [
      'revisionContent',
    ]),
    ...mapPiniaState(useLayoutStore, [
      'styles',
    ]),
    ...mapPiniaState(useSyncLocationStore, {
      syncLocations: 'current',
    }),
    ...mapPiniaState(usePublishLocationStore, {
      publishLocations: 'current',
    }),
    pagedownButtons() {
      return pagedownButtons.map(button => ({
        ...button,
        titleWithShortcut: `${button.title}${getShortcut(button.method)}`,
        iconClass: `icon-${button.icon}`,
      }));
    },
    customButtons() {
      return customToolbarButtons.map(button => ({
        ...button,
        iconClass: `icon-${button.icon}`,
      }));
    },
    isSyncPossible() {
      return useWorkspaceStore().syncToken ||
        useSyncLocationStore().current.length;
    },
    showSpinner() {
      return !useQueueStore().isEmpty;
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
      const current = useFileStore().current;
      return utils.serializeObject([
        current.id,
        current.name,
      ]);
    },
    hasCurrentFile() {
      return !!useFileStore().current.id;
    },
    metaParts() {
      const current = useFileStore().current;
      if (!current || !current.id) return null;
      const content = useContentStore().current;
      const text = (content && content.text) || '';
      const bytes = new Blob([text]).size;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
      const path = useGlobalStore().pathsByItemId[current.id] || '';
      const parent = path.replace(/[^/]*$/, '').replace(/\/$/, '') || '/';
      const lastOpenedMap = useDataStore().lastOpened || {};
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
    ...mapPiniaActions(useContentStore, {
      setRevisionContent: 'setRevisionContentRaw',
      restoreRevision: 'restoreRevision',
    }),
    ...mapPiniaActions(useDataStore, [
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
      useExplorerStore().setUserClosedFile(true);
      useFileStore().setCurrentId(null);
    },
    async onTitleContextMenu(evt) {
      if (!this.hasCurrentFile) return;
      evt.preventDefault();
      const item = await useContextMenuStore().open({
        coordinates: { left: evt.clientX, top: evt.clientY },
        items: [{
          name: 'Rename',
          perform: () => this.titleInputElt && this.titleInputElt.focus(),
        }, {
          name: 'File properties',
          perform: () => useModalStore().open('fileProperties').catch(() => {}),
        }, {
          name: 'Copy path',
          perform: () => this.copyCurrentFilePath(),
        }, {
          type: 'separator',
        }, {
          name: 'Close file',
          perform: () => this.closeCurrentFile(),
        }],
      });
      if (item) item.perform();
    },
    async copyCurrentFilePath() {
      const id = useFileStore().current.id;
      if (!id) return;
      const path = useGlobalStore().pathsByItemId[id] || useFileStore().current.name || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(path);
        }
      } catch (e) { /* ignore */ }
    },
    pagedownClick(name, evt) {
      if (!useContentStore().isCurrentEditable) return;
      // Heading button opens a level picker (H1-H6) instead of cycling
      // through pagedown's 3 levels. More direct and exposes H4-H6 which
      // upstream's button never reached.
      if (name === 'heading') {
        return this.openHeadingMenu(evt);
      }
      const before = editorSvc.clEditor.getContent();
      // Stage 3 batch 10: when the CM6 bridge is active, dispatch
      // through cm6Commands. Falls back to pagedown for the cledit path.
      const view = editorSvc.clEditor && editorSvc.clEditor.view;
      if (view) {
        const command = name === 'link'
          ? makeCm6LinkCommand(cb => useModalStore().open({ type: 'link', callback: cb }))
          : name === 'image'
            ? makeCm6ImageCommand(cb => useModalStore().open({ type: 'image', callback: cb }))
            : cm6Commands[name === 'hr' ? 'horizontalRule' : name];
        if (command) command(view);
      } else {
        editorSvc.pagedownEditor.uiManager.doClick(name);
      }
      if (before !== editorSvc.clEditor.getContent()) {
        badgeSvc.addBadge('formatButtons');
      }
      return undefined;
    },
    async openHeadingMenu(evt) {
      const rect = evt.currentTarget.getBoundingClientRect();
      const items = [1, 2, 3, 4, 5, 6].map(level => ({
        name: `H${level}`,
        perform: () => this.applyHeading(level),
      }));
      const item = await useContextMenuStore().open({
        coordinates: { left: rect.left, top: rect.bottom + 4 },
        items,
      });
      if (item) item.perform();
    },
    applyHeading(level) {
      // CM6 bridge path: dispatch via cm6Commands.headingN (which also
      // strips the existing prefix before re-applying).
      const view = editorSvc.clEditor && editorSvc.clEditor.view;
      if (view) {
        const command = cm6Commands[`heading${level}`];
        if (command) command(view);
        return;
      }
      const sel = editorSvc.clEditor.selectionMgr;
      const content = editorSvc.clEditor.getContent();
      const cursor = Math.min(sel.selectionStart, sel.selectionEnd);
      // Find the current line's bounds.
      const lineStart = content.lastIndexOf('\n', cursor - 1) + 1;
      let lineEnd = content.indexOf('\n', cursor);
      if (lineEnd === -1) lineEnd = content.length;
      const lineText = content.slice(lineStart, lineEnd);
      // Strip an existing heading prefix so re-applying replaces rather
      // than nests (`### foo` + apply H1 → `# foo`, not `# ### foo`).
      const stripped = lineText.replace(/^#{1,6}\s+/, '');
      const newLine = `${'#'.repeat(level)} ${stripped}`;
      editorSvc.clEditor.replace(lineStart, lineEnd, newLine);
      // Cursor lands at end of the prefix so typing extends the heading.
      const caret = lineStart + level + 1;
      sel.setSelectionStartEnd(caret, caret);
      badgeSvc.addBadge('formatButtons');
    },
    customClick(button, evt) {
      // Custom toolbar buttons (math, mermaid, inline code, etc.) bypass
      // pagedown's UIManager and operate on cledit directly. Action
      // functions live in src/data/customToolbarButtons.js. Buttons with
      // `dropdown: true` open a contextMenu popover anchored under the
      // button instead of running an action directly.
      if (!useContentStore().isCurrentEditable) return;
      if (button.dropdown) {
        return this.openCustomDropdown(button, evt);
      }
      const before = editorSvc.clEditor.getContent();
      try {
        const result = button.action(editorSvc);
        // Some actions (linkFromClipboard) are async — treat the
        // promise's resolution as the boundary for the badge check.
        if (result && typeof result.then === 'function') {
          return result.then(() => {
            if (before !== editorSvc.clEditor.getContent()) {
              badgeSvc.addBadge('formatButtons');
            }
          });
        }
      } catch (e) {
        console.error(`[toolbar:${button.method}]`, e);
      }
      if (before !== editorSvc.clEditor.getContent()) {
        badgeSvc.addBadge('formatButtons');
      }
      return undefined;
    },
    async openCustomDropdown(button, evt) {
      const rect = evt.currentTarget.getBoundingClientRect();
      const items = button.items.map(item => ({
        name: item.name,
        perform: () => item.perform(editorSvc),
      }));
      const item = await useContextMenuStore().open({
        coordinates: { left: rect.left, top: rect.bottom + 4 },
        items,
      });
      if (item) {
        const before = editorSvc.clEditor.getContent();
        item.perform();
        if (before !== editorSvc.clEditor.getContent()) {
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
        this.title = useFileStore().current.name;
        if (title && this.title !== title) {
          try {
            await workspaceSvc.storeItem({
              ...useFileStore().current,
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

/* Visual separator before the tidy / magic-wand button — rendered as a
   pseudo-element on the button itself rather than a sibling divider div.
   The earlier sibling-div approach pushed an extra ~13 px into the float
   context, which on tight viewports tipped the wand to a wrapped second
   row that the nav bar's `overflow: hidden` then clipped (= "vanished
   on click"). Keeping it inline costs only the 8 px left margin and
   adds no element to the float layout. */
.navigation-bar__button--separated {
  position: relative;
  margin-left: 8px;

  &::before {
    content: '';
    position: absolute;
    left: -4px;
    top: 9px;
    width: 1px;
    height: 18px;
    background-color: rgba(255, 255, 255, 0.4);
  }
}

.navigation-bar__button {
  /* Slimmed from `width: 34; padding: 0 7px` (= 48 px effective) to
     fit the wave-2/3 toolbar growth on common 1366–1920 px viewports
     without wrapping. With ~37 buttons, every saved pixel matters; the
     SVGs themselves render fine at 28×24. */
  width: 30px;
  padding: 0 5px;
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
  /* No bg on `:focus` or `:focus-visible` — earlier we tried both and
     Chromium's `:focus-visible` heuristic still triggers for the
     post-click retained-focus state on some flows (folder toggle,
     toolbar buttons), leaving the button stuck-highlighted until the
     user clicked elsewhere. Keyboard navigation still gets a clear
     blue outline from `app.scss`'s `:focus-visible { outline: ... }`
     rule, so tab-nav users aren't left without an affordance. */
  &:active,
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
