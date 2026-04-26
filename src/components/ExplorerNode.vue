<template>
  <div v-if="isVisible" class="explorer-node" :class="{'explorer-node--selected': isSelected, 'explorer-node--primary': isPrimary, 'explorer-node--folder': node.isFolder, 'explorer-node--open': isOpen, 'explorer-node--trash': node.isTrash, 'explorer-node--temp': node.isTemp, 'explorer-node--recent': node.isRecent, 'explorer-node--pinned': isPinned, 'explorer-node--drag-target': isDragTargetFolder}" @dragover.prevent @dragenter.stop="node.noDrop || setDragTarget(node)" @dragleave.stop="isDragTarget && setDragTarget()" @drop.prevent.stop="onDrop" @contextmenu="onContextMenu">
    <div class="explorer-node__item-editor" v-if="isEditing" :style="{paddingLeft: leftPadding}" draggable="true" @dragstart.stop.prevent>
      <input type="text" class="text-input" v-focus @blur="submitEdit()" @keydown.stop @keydown.enter="submitEdit()" @keydown.esc.stop="submitEdit(true)" v-model="editingNodeName">
    </div>
    <div class="explorer-node__item" v-else-if="!node.isRoot" :data-node-id="node.item.id" :style="{paddingLeft: leftPadding}" @click="onClick" draggable="true" @dragstart.stop="onDragStart" @dragend.stop="onDragEnd"><span v-if="showCaret" class="explorer-node__caret" @click.stop="onCaretClick" @mousedown.stop>{{ isOpen ? '▾' : '▹' }}</span><span v-for="(part, i) in nameParts" :key="i" :class="{ 'explorer-node__match': part.match }">{{ part.text }}</span><span v-if="isPinned" class="explorer-node__pin" v-title="'Pinned'">📌</span><span v-if="node.recentLabel" class="explorer-node__ts">{{ node.recentLabel }}</span><span v-if="showFileCount" class="explorer-node__count">{{ node.fileCount }}</span><span v-if="showNerdInfo" class="explorer-node__info" @click.stop @mousedown.stop @mouseenter="onInfoEnter" @mouseleave="onInfoLeave">ⓘ</span>
      <icon-provider class="explorer-node__location" v-for="location in node.locations" :key="location.id" :provider-id="location.providerId"></icon-provider>
      <div v-if="infoOpen" class="explorer-node__info-popover" :style="infoPopoverStyle">
        <div class="explorer-node__info-row" v-for="row in nerdInfoRows" :key="row.k"><span class="explorer-node__info-k">{{ row.k }}</span><span class="explorer-node__info-v">{{ row.v }}</span></div>
      </div>
    </div>
    <transition
      name="explorer-folder"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
    >
      <div class="explorer-node__children" v-if="node.isFolder && isOpen">
        <explorer-node v-for="node in node.folders" :key="node.item.id" :node="node" :depth="depth + 1"></explorer-node>
        <div v-if="newChild" class="explorer-node__new-child" :class="{'explorer-node__new-child--folder': newChild.isFolder}" :style="{paddingLeft: childLeftPadding}">
          <input type="text" class="text-input" v-focus @blur="submitNewChild()" @keydown.stop @keydown.enter="submitNewChild()" @keydown.esc.stop="submitNewChild(true)" v-model.trim="newChildName">
        </div>
        <explorer-node v-for="node in node.files" :key="node.item.id" :node="node" :depth="depth + 1"></explorer-node>
      </div>
    </transition>
  </div>
</template>

<script>
import { mapActions as mapPiniaActions } from 'pinia';
import workspaceSvc from '../services/workspaceSvc';
import explorerSvc from '../services/explorerSvc';
import fileImportSvc from '../services/fileImportSvc';
import draftFilesSvc from '../services/draftFilesSvc';
import { useContentStore } from '../stores/content';
import { useFileStore } from '../stores/file';
import { useContextMenuStore } from '../stores/contextMenu';
import badgeSvc from '../services/badgeSvc';
import { useDataStore } from '../stores/data';
import { useExplorerStore } from '../stores/explorer';
import { useGlobalStore } from '../stores/global';

export default {
  name: 'explorer-node', // Required for recursivity
  props: ['node', 'depth'],
  data: () => ({
    editingValue: '',
    infoOpen: false,
    infoPopoverStyle: null,
  }),
  computed: {
    leftPadding() {
      return `${this.depth * 15}px`;
    },
    childLeftPadding() {
      return `${(this.depth + 1) * 15}px`;
    },
    isSelected() {
      return !!useExplorerStore().selectedIds[this.node.item.id]
        || useExplorerStore().selectedNode === this.node;
    },
    isPrimary() {
      return useExplorerStore().selectedNode === this.node;
    },
    showCaret() {
      // Real clickable caret for regular folders only. Sentinels (Trash /
      // Temp / Recent) keep their legacy pseudo-element caret and single-
      // click toggle.
      return this.node.isFolder
        && !this.node.isTrash
        && !this.node.isTemp
        && !this.node.isRecent;
    },
    showFileCount() {
      // Don't show (0) for empty regular folders — less visual noise.
      // Skip the synthetic root too: its count covers the whole workspace
      // but the row itself has no name, so the badge looks orphaned.
      return this.node.isFolder
        && !this.node.isRoot
        && typeof this.node.fileCount === 'number'
        && this.node.fileCount > 0;
    },
    isPinned() {
      if (!this.node.isFolder || this.node.isTrash || this.node.isTemp || this.node.isRecent || this.node.isRoot) {
        return false;
      }
      const pinned = (useDataStore().localSettings || {}).pinnedFolderIds || {};
      return !!pinned[this.node.item.id];
    },
    showNerdInfo() {
      // Show a hover-only info glyph on the primary-selected row — gives a
      // tooltip with size/words/path/etc without cluttering every row.
      return this.isPrimary
        && !this.node.isNil
        && !this.node.isTrash
        && !this.node.isTemp
        && !this.node.isRecent
        && !this.node.isRoot;
    },
    nerdInfoRows() {
      const id = this.node.item.id;
      const path = useGlobalStore().pathsByItemId[id] || '';
      const rows = [
        { k: 'Name', v: this.node.item.name || '—' },
        { k: 'Path', v: path || '—' },
        { k: 'Type', v: this.node.isFolder ? 'Folder' : 'File' },
        { k: 'ID', v: id },
      ];
      if (this.node.isFolder) {
        rows.push({ k: 'Contains', v: `${this.node.fileCount || 0} files` });
      } else {
        const entry = useContentStore().itemsById[`${id}/content`];
        const text = (entry && entry.text) || '';
        if (text) {
          const bytes = new Blob([text]).size;
          const words = text.trim() ? text.trim().split(/\s+/).length : 0;
          const lines = text.split(/\r\n|\r|\n/).length;
          const mins = words ? Math.max(1, Math.round(words / 220)) : 0;
          rows.push({ k: 'Size', v: bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB` });
          rows.push({ k: 'Words', v: words.toLocaleString() });
          rows.push({ k: 'Lines', v: lines.toLocaleString() });
          rows.push({ k: 'Read', v: `${mins} min` });
        } else {
          rows.push({ k: 'Size', v: '(open file to load)' });
        }
      }
      const lastOpened = (useDataStore().lastOpened || {})[id];
      if (lastOpened) {
        rows.push({ k: 'Opened', v: new Date(lastOpened).toLocaleString() });
      }
      return rows;
    },
    isVisible() {
      const matchIds = useExplorerStore().searchMatchIds;
      if (!matchIds) return true;
      if (this.node.isRoot) return true;
      return matchIds.has(this.node.item.id);
    },
    nameParts() {
      const name = this.node.item.name || '';
      const q = (useExplorerStore().searchQuery || '').trim();
      if (!q) return [{ text: name, match: false }];
      const lowerName = name.toLowerCase();
      const lowerQ = q.toLowerCase();
      const parts = [];
      let i = 0;
      while (i < name.length) {
        const idx = lowerName.indexOf(lowerQ, i);
        if (idx === -1) {
          parts.push({ text: name.slice(i), match: false });
          break;
        }
        if (idx > i) parts.push({ text: name.slice(i, idx), match: false });
        parts.push({ text: name.slice(idx, idx + q.length), match: true });
        i = idx + q.length;
      }
      if (!parts.length) parts.push({ text: name, match: false });
      return parts;
    },
    isEditing() {
      return useExplorerStore().editingNode === this.node;
    },
    isDragTarget() {
      return useExplorerStore().dragTargetNode === this.node;
    },
    isDragTargetFolder() {
      return useExplorerStore().dragTargetNodeFolder === this.node;
    },
    isOpen() {
      if (this.node.isRoot) return true;
      // While searching, any folder that contains a match expands automatically
      // so the user can see the match without manually drilling in.
      const matchIds = useExplorerStore().searchMatchIds;
      if (matchIds && this.node.isFolder && matchIds.has(this.node.item.id)) {
        return true;
      }
      return !!useExplorerStore().openNodes[this.node.item.id];
    },
    newChild() {
      return useExplorerStore().newChildNodeParent === this.node
        && useExplorerStore().newChildNode;
    },
    newChildName: {
      get() {
        return useExplorerStore().newChildNode.item.name;
      },
      set(value) {
        useExplorerStore().setNewItemName(value);
      },
    },
    editingNodeName: {
      get() {
        return useExplorerStore().editingNode.item.name;
      },
      set(value) {
        this.editingValue = value.trim();
      },
    },
  },
  methods: {
    ...mapPiniaActions(useExplorerStore, [
      'setEditingId',
    ]),
    ...mapPiniaActions(useExplorerStore, [
      'setDragTarget',
    ]),
    select(id = this.node.item.id, doOpen = true) {
      const node = useExplorerStore().nodeMap[id];
      if (!node) {
        return false;
      }
      useExplorerStore().setSelectedIds([id]);
      if (doOpen) {
        // Files open in the editor. Regular folders are selected but no
        // longer toggle open on a plain click — the caret or a second
        // click on the already-selected folder handles that.
        setTimeout(() => {
          if (node.isFolder) {
            if (node.isTrash || node.isTemp || node.isRoot) {
              useExplorerStore().toggleOpenNode(id);
            }
          } else if (useFileStore().currentId !== id) {
            useFileStore().setCurrentId(id);
            badgeSvc.addBadge('switchFile');
          }
        }, 10);
      }
      return true;
    },
    onClick(evt) {
      const id = this.node.item.id;
      // Sentinel nodes (trash/temp/recent/root) don't participate in multi-
      // select. A plain click just toggles their open state.
      if (this.node.isTrash || this.node.isTemp || this.node.isRoot) {
        this.select();
        return;
      }
      if (this.node.isRecent) {
        useExplorerStore().toggleOpenNode(id);
        return;
      }
      if (evt.shiftKey) {
        const ids = this.collectRange(useExplorerStore().selectedId, id);
        useExplorerStore().setSelectedIds(ids);
        return;
      }
      if (evt.metaKey || evt.ctrlKey) {
        useExplorerStore().toggleSelectedId(id);
        return;
      }
      // Second plain click on an already-selected regular folder toggles
      // its open/close state. First click just selects.
      if (this.node.isFolder && useExplorerStore().selectedId === id) {
        useExplorerStore().toggleOpenNode(id);
        return;
      }
      this.select();
    },
    onCaretClick() {
      // Caret toggles open/close independently of selection.
      useExplorerStore().toggleOpenNode(this.node.item.id);
    },
    collectRange(anchorId, targetId) {
      // Use the live DOM to get visible nodes in render order.
      const nodes = Array.from(document.querySelectorAll('.explorer__tree .explorer-node__item[data-node-id]'));
      const ids = nodes
        .map(el => el.getAttribute('data-node-id'))
        .filter(id => id && id !== 'trash' && id !== 'temp');
      if (!anchorId || !ids.includes(anchorId)) return [targetId];
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(targetId);
      if (a === -1 || b === -1) return [targetId];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return ids.slice(lo, hi + 1);
    },
    onDragStart(evt) {
      if (this.node.noDrag) {
        evt.preventDefault();
        return;
      }
      const id = this.node.item.id;
      const selected = useExplorerStore().selectedIds;
      const isInMulti = !!selected[id] && Object.keys(selected).length > 1;
      const ids = isInMulti ? Object.keys(selected) : [id];
      useExplorerStore().setDragSourceId(id);
      useExplorerStore().setDragSourceIds(ids);
      // Fix for Firefox
      // See https://stackoverflow.com/a/3977637/1333165
      evt.dataTransfer.setData('Text', '');

      // If the file's content is already loaded in memory, attach a
      // DownloadURL + text/plain payload so dragging onto the OS /
      // Finder / desktop produces a real .md file. No-op for folders,
      // multi-select drags, and unloaded files.
      if (!this.node.isFolder && !isInMulti) {
        const entry = useContentStore().itemsById[`${id}/content`];
        if (entry && typeof entry.text === 'string') {
          try {
            const blob = new Blob([entry.text], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const filename = `${this.node.item.name || 'untitled'}.md`;
            evt.dataTransfer.setData('DownloadURL', `text/markdown:${filename}:${url}`);
            evt.dataTransfer.setData('text/plain', entry.text);
            this._dragBlobUrl = url;
          } catch (e) {
            // Swallow — internal drag still works.
          }
        }
      }
    },
    onDragEnd() {
      this.setDragTarget();
      if (this._dragBlobUrl) {
        URL.revokeObjectURL(this._dragBlobUrl);
        this._dragBlobUrl = null;
      }
    },
    async submitNewChild(cancel) {
      const { newChildNode } = useExplorerStore();
      if (!cancel && !newChildNode.isNil && newChildNode.item.name) {
        try {
          if (newChildNode.isFolder) {
            const item = await workspaceSvc.storeItem(newChildNode.item);
            this.select(item.id);
            badgeSvc.addBadge('createFolder');
          } else {
            const item = await workspaceSvc.createFile(newChildNode.item);
            draftFilesSvc.markAsDraft(item.id);
            this.select(item.id);
            badgeSvc.addBadge('createFile');
          }
        } catch (e) {
          // Cancel
        }
      }
      useExplorerStore().setNewItem(null);
    },
    async submitEdit(cancel) {
      const { item, isFolder } = useExplorerStore().editingNode;
      const value = this.editingValue;
      this.setEditingId(null);
      if (!cancel && item.id && value && item.name !== value) {
        try {
          await workspaceSvc.storeItem({
            ...item,
            name: value,
          });
          badgeSvc.addBadge(isFolder ? 'renameFolder' : 'renameFile');
        } catch (e) {
          // Cancel
        }
      }
    },
    async onDrop(evt) {
      const targetNode = useExplorerStore().dragTargetNodeFolder;
      this.setDragTarget();
      if (targetNode.isNil) return;

      // External file drop (from OS) — import .md files into the drop target.
      if (fileImportSvc.hasMarkdownPayload(evt.dataTransfer)) {
        const parentId = targetNode.isRoot ? null : targetNode.item.id;
        try {
          await fileImportSvc.importDataTransfer(evt.dataTransfer, parentId);
        } catch (e) {
          console.error(e);
        }
        return;
      }

      // Internal drag — move one or many workspace items into the target folder.
      const sourceIds = useExplorerStore().dragSourceIds;
      const { nodeMap } = useExplorerStore().nodeStructure;
      let folderMoved = false;
      let fileMoved = false;
      sourceIds.forEach((sourceId) => {
        const sourceNode = nodeMap[sourceId];
        if (!sourceNode || sourceNode.isNil) return;
        if (sourceNode.item.id === targetNode.item.id) return;
        // Prevent moving a folder into itself or its own descendants.
        for (let walk = targetNode; walk; walk = nodeMap[walk.item.parentId]) {
          if (walk.item.id === sourceNode.item.id) return;
        }
        workspaceSvc.storeItem({
          ...sourceNode.item,
          parentId: targetNode.item.id,
        });
        if (sourceNode.isFolder) folderMoved = true;
        else fileMoved = true;
      });
      if (folderMoved) badgeSvc.addBadge('moveFolder');
      else if (fileMoved) badgeSvc.addBadge('moveFile');
    },
    async onContextMenu(evt) {
      if (this.select(undefined, false)) {
        evt.preventDefault();
        evt.stopPropagation();
        const isFile = !this.node.isFolder && !this.node.isNil;
        const isRegularFolder = this.node.isFolder && !this.node.isTrash && !this.node.isTemp && !this.node.isRecent && !this.node.isRoot;
        const isPinned = this.isPinned;
        const item = await useContextMenuStore().open({
          coordinates: {
            left: evt.clientX,
            top: evt.clientY,
          },
          items: [{
            name: 'New file',
            disabled: !this.node.isFolder || this.node.isTrash || this.node.isRecent,
            perform: () => explorerSvc.newItem(false),
          }, {
            name: 'New folder',
            disabled: !this.node.isFolder || this.node.isTrash || this.node.isTemp || this.node.isRecent,
            perform: () => explorerSvc.newItem(true),
          }, {
            type: 'separator',
          }, {
            name: 'Duplicate',
            disabled: !isFile,
            perform: () => this.duplicateFile(),
          }, {
            name: 'Reveal in editor',
            disabled: !isFile,
            perform: () => this.revealInEditor(),
          }, {
            name: 'Copy path',
            disabled: this.node.isTrash || this.node.isTemp || this.node.isRecent || this.node.isRoot,
            perform: () => this.copyPath(),
          }, {
            name: isPinned ? 'Unpin folder' : 'Pin folder',
            disabled: !isRegularFolder,
            perform: () => this.togglePin(),
          }, {
            type: 'separator',
          }, {
            name: 'Rename',
            disabled: this.node.isTrash || this.node.isTemp || this.node.isRecent,
            perform: () => this.setEditingId(this.node.item.id),
          }, {
            name: 'Delete',
            perform: () => explorerSvc.deleteItem(),
          }],
        });
        if (item) {
          item.perform();
        }
      }
    },
    async duplicateFile() {
      try {
        const original = useFileStore().itemsById[this.node.item.id];
        if (!original) return;
        const content = await (await import('../services/localDbSvc')).default
          .loadItem(`${original.id}/content`);
        const copy = await workspaceSvc.createFile({
          name: `${original.name} (copy)`,
          parentId: original.parentId || null,
          text: (content && content.text) || '',
          properties: (content && content.properties) || '',
        }, true);
        useFileStore().setCurrentId(copy.id);
      } catch (e) {
        console.error(e);
      }
    },
    async copyPath() {
      const path = useGlobalStore().pathsByItemId[this.node.item.id] || this.node.item.name || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(path);
          return;
        }
      } catch (e) { /* fall through */ }
      const ta = document.createElement('textarea');
      ta.value = path;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    },
    revealInEditor() {
      useFileStore().setCurrentId(this.node.item.id);
    },
    onInfoEnter(evt) {
      const r = evt.currentTarget.getBoundingClientRect();
      // Anchor the popover just below the icon, aligned to its right edge
      // so it doesn't clip off-screen when the explorer is at the left.
      this.infoPopoverStyle = {
        top: `${r.bottom + 6}px`,
        left: `${r.left - 240}px`,
      };
      this.infoOpen = true;
    },
    onInfoLeave() {
      this.infoOpen = false;
    },
    togglePin() {
      const pinned = { ...((useDataStore().localSettings || {}).pinnedFolderIds || {}) };
      const id = this.node.item.id;
      if (pinned[id]) delete pinned[id];
      else pinned[id] = true;
      useDataStore().patchLocalSettings({ pinnedFolderIds: pinned });
    },
    // Folder expand/collapse easing. Vue's <transition> needs JS hooks to
    // animate variable-height content: read the natural height after the
    // element is mounted, drive `style.height` from 0 → that value (or
    // back), then unset so nested children can grow freely. Reduced-motion
    // users get an instant toggle (the CSS rule strips the transition).
    onBeforeEnter(el) {
      el.style.height = '0';
      el.style.overflow = 'hidden';
    },
    onEnter(el, done) {
      const h = el.scrollHeight;
      // Force reflow so the browser commits the 0 → h transition.
      void el.offsetHeight;
      el.style.height = `${h}px`;
      const onEnd = () => {
        el.removeEventListener('transitionend', onEnd);
        done();
      };
      el.addEventListener('transitionend', onEnd);
    },
    onAfterEnter(el) {
      el.style.height = '';
      el.style.overflow = '';
    },
    onBeforeLeave(el) {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflow = 'hidden';
    },
    onLeave(el, done) {
      void el.offsetHeight;
      el.style.height = '0';
      const onEnd = () => {
        el.removeEventListener('transitionend', onEnd);
        done();
      };
      el.addEventListener('transitionend', onEnd);
    },
  },
};
</script>

<style lang="scss">
$item-font-size: 14px;

.explorer-node--drag-target {
  background-color: rgba(0, 128, 255, 0.2);
}

.explorer-node__item {
  position: relative;
  cursor: pointer;
  font-size: $item-font-size;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding-right: 5px;

  .explorer-node--selected > & {
    background-color: rgba(0, 0, 0, 0.2);

    .explorer__tree:focus & {
      background-color: #39f;
      color: #fff;
    }
  }

  .explorer__tree--new-item & {
    opacity: 0.33;
  }

  .explorer-node__location {
    float: right;
    width: 18px;
    height: 18px;
    margin: 2px 1px;
  }
}

.explorer-node--trash,
.explorer-node--temp {
  color: rgba(0, 0, 0, 0.5);
}

// Sentinel folders (Trash / Temp / Recent) and edit/new-child placeholders
// keep the pseudo-element caret. Regular folders use the real <span> caret
// so it can receive its own click without selecting the row.
.explorer-node--trash > .explorer-node__item,
.explorer-node--temp > .explorer-node__item,
.explorer-node--recent > .explorer-node__item,
.explorer-node--folder > .explorer-node__item-editor,
.explorer-node__new-child--folder {
  &::before {
    content: '▹';
    position: absolute;
    margin-left: -13px;
  }
}

.explorer-node--trash.explorer-node--open > .explorer-node__item,
.explorer-node--temp.explorer-node--open > .explorer-node__item,
.explorer-node--recent.explorer-node--open > .explorer-node__item,
.explorer-node--folder.explorer-node--open > .explorer-node__item-editor {
  &::before {
    content: '▾';
  }
}

.explorer-node__caret {
  position: absolute;
  width: 13px;
  margin-left: -13px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  line-height: inherit;
}

.explorer-node__match {
  background-color: rgba(255, 210, 0, 0.55);
  color: inherit;
  border-radius: 2px;

  .explorer-node--selected > .explorer-node__item & {
    background-color: rgba(255, 220, 0, 0.85);
    color: #000;
  }
}

.explorer-node__count {
  float: right;
  margin-left: 6px;
  font-size: 0.7em;
  font-weight: 500;
  padding: 0 6px;
  background-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.55);
  border-radius: 10px;
  line-height: 1.6;

  .explorer__tree:focus .explorer-node--selected > .explorer-node__item & {
    background-color: rgba(255, 255, 255, 0.25);
    color: #fff;
  }
}

.explorer-node__pin {
  font-size: 0.7em;
  margin-left: 4px;
  opacity: 0.7;
}

.explorer-node__info {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  opacity: 0.7;
  cursor: help;

  &:hover { opacity: 1; }

  .explorer__tree:focus .explorer-node--selected > .explorer-node__item & {
    color: rgba(255, 255, 255, 0.95);
    opacity: 0.9;

    &:hover { opacity: 1; }
  }
}

.explorer-node__info-popover {
  position: fixed;
  z-index: 20;
  min-width: 240px;
  max-width: 320px;
  padding: 8px 10px;
  background-color: rgba(25, 27, 30, 0.96);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  font-size: 11px;
  line-height: 1.45;
  pointer-events: none;
  backdrop-filter: blur(2px);
}

.explorer-node__info-row {
  display: flex;
  gap: 8px;
  align-items: baseline;

  & + & { margin-top: 2px; }
}

.explorer-node__info-k {
  flex: 0 0 58px;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
}

.explorer-node__info-v {
  flex: 1 1 auto;
  color: rgba(255, 255, 255, 0.95);
  word-break: break-all;
}

.explorer-node__ts {
  float: right;
  margin-left: 6px;
  font-size: 0.7em;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;

  .explorer__tree:focus .explorer-node--selected > .explorer-node__item & {
    opacity: 0.85;
    color: rgba(255, 255, 255, 0.9);
  }
}

.explorer-node--recent > .explorer-node__item {
  font-style: italic;
}

$new-child-height: 25px;

.explorer-node__item-editor,
.explorer-node__new-child {
  padding: 1px 10px;

  .text-input {
    font-size: $item-font-size;
    padding: 2px;
    height: $new-child-height;
  }
}

/* Folder expand/collapse easing — JS hooks in the component drive the
   height value 0 ↔ scrollHeight, the CSS just supplies the curve. The
   transition lives only on the explorer-folder transition states so it
   doesn't bleed into other height changes (rename, search filter, etc.). */
.explorer-folder-enter-active,
.explorer-folder-leave-active {
  transition: height 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .explorer-folder-enter-active,
  .explorer-folder-leave-active {
    transition: none;
  }
}
</style>
