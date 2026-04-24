<template>
  <div class="explorer flex flex--column" @dragover.prevent @drop.prevent>
    <div class="side-title flex flex--row flex--space-between">
      <div class="flex flex--row">
        <button class="side-title__button side-title__button--new-file button" @click="newItem()" v-title="'New file'">
          <icon-file-plus></icon-file-plus>
        </button>
        <button class="side-title__button side-title__button--new-folder button" @click="newItem(true)" v-title="'New folder'">
          <icon-folder-plus></icon-folder-plus>
        </button>
        <button class="side-title__button side-title__button--delete button" @click="deleteItem()" v-title="'Delete'">
          <icon-delete></icon-delete>
        </button>
        <button class="side-title__button side-title__button--rename button" @click="editItem()" v-title="'Rename'">
          <icon-pen></icon-pen>
        </button>
      </div>
      <button class="side-title__button side-title__button--close button" @click="toggleExplorer(false)" v-title="'Close explorer'">
        <icon-close></icon-close>
      </button>
    </div>
    <div class="explorer__search" v-if="!light">
      <input
        type="text"
        class="explorer__search-input text-input"
        placeholder="Search files and folders…"
        v-model="searchQuery"
        @keydown.esc.stop="searchQuery = ''"
      >
      <button
        v-if="searchQuery"
        class="explorer__search-clear button"
        @click="searchQuery = ''"
        v-title="'Clear search'"
      >×</button>
    </div>
    <div
      ref="tree"
      class="explorer__tree"
      :class="{
        'explorer__tree--new-item': !newChildNode.isNil,
        'explorer__tree--drop-root': isRootDropTarget,
      }"
      v-if="!light"
      tabindex="0"
      @keydown.delete="deleteItem()"
      @mousedown="onTreeMouseDown"
      @dragover.prevent
      @dragenter="onTreeDragEnter"
      @dragleave="onTreeDragLeave"
      @drop.prevent.stop="onTreeDrop"
    >
      <explorer-node :node="rootNode" :depth="0"></explorer-node>
      <div v-if="marquee" class="explorer__marquee" :style="marqueeStyle"></div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex';
import ExplorerNode from './ExplorerNode';
import explorerSvc from '../services/explorerSvc';
import fileImportSvc from '../services/fileImportSvc';
import workspaceSvc from '../services/workspaceSvc';
import badgeSvc from '../services/badgeSvc';
import store from '../store';

export default {
  components: {
    ExplorerNode,
  },
  data: () => ({
    marquee: null, // { x, y, w, h, baseIds, additive } while dragging; null otherwise
  }),
  computed: {
    ...mapState([
      'light',
    ]),
    ...mapState('explorer', [
      'newChildNode',
    ]),
    ...mapGetters('explorer', [
      'rootNode',
      'selectedNode',
      'dragTargetNodeFolder',
    ]),
    isRootDropTarget() {
      return this.dragTargetNodeFolder && this.dragTargetNodeFolder.isRoot;
    },
    searchQuery: {
      get() { return store.state.explorer.searchQuery; },
      set(value) { store.commit('explorer/setSearchQuery', value); },
    },
    marqueeStyle() {
      if (!this.marquee) return null;
      const { x, y, w, h } = this.marquee;
      return {
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
      };
    },
  },
  methods: {
    ...mapActions('data', [
      'toggleExplorer',
    ]),
    ...mapActions('explorer', [
      'setDragTarget',
    ]),
    newItem: isFolder => explorerSvc.newItem(isFolder),
    deleteItem: () => explorerSvc.deleteItem(),
    editItem() {
      const node = this.selectedNode;
      if (!node.isTrash && !node.isTemp) {
        store.commit('explorer/setEditingId', node.item.id);
      }
    },
    onTreeDragEnter() {
      // Route through the 'fake' sentinel so dragTargetNodeFolder → rootNode.
      this.setDragTarget(this.rootNode);
    },
    onTreeDragLeave(evt) {
      // Only clear when the drag genuinely leaves the tree, not when
      // moving into a descendant explorer-node.
      if (evt.currentTarget.contains(evt.relatedTarget)) return;
      if (this.isRootDropTarget) {
        this.setDragTarget();
      }
    },
    async onTreeDrop(evt) {
      this.setDragTarget();

      if (fileImportSvc.hasMarkdownPayload(evt.dataTransfer)) {
        try {
          await fileImportSvc.importDataTransfer(evt.dataTransfer, null);
        } catch (e) {
          console.error(e);
        }
        return;
      }

      const sourceIds = store.state.explorer.dragSourceIds;
      const { nodeMap } = store.getters['explorer/nodeStructure'];
      let folderMoved = false;
      let fileMoved = false;
      sourceIds.forEach((sourceId) => {
        const sourceNode = nodeMap[sourceId];
        if (!sourceNode || sourceNode.isNil) return;
        if (sourceNode.item.parentId === null) return;
        workspaceSvc.storeItem({
          ...sourceNode.item,
          parentId: null,
        });
        if (sourceNode.isFolder) folderMoved = true;
        else fileMoved = true;
      });
      if (folderMoved) badgeSvc.addBadge('moveFolder');
      else if (fileMoved) badgeSvc.addBadge('moveFile');
    },
    onTreeMouseDown(evt) {
      if (evt.button !== 0) return;
      // Ignore clicks originating on a node — those are handled per-node and
      // participate in the native HTML5 drag start for reparenting.
      if (evt.target.closest('.explorer-node__item, .explorer-node__item-editor')) return;
      const treeElt = this.$refs.tree;
      if (!treeElt) return;
      const rect = treeElt.getBoundingClientRect();
      const startX = evt.clientX - rect.left + treeElt.scrollLeft;
      const startY = evt.clientY - rect.top + treeElt.scrollTop;
      const additive = evt.metaKey || evt.ctrlKey || evt.shiftKey;
      const baseIds = additive
        ? Object.keys(store.state.explorer.selectedIds)
        : [];

      let moved = false;
      const onMove = (moveEvt) => {
        const cx = moveEvt.clientX - rect.left + treeElt.scrollLeft;
        const cy = moveEvt.clientY - rect.top + treeElt.scrollTop;
        const x = Math.min(startX, cx);
        const y = Math.min(startY, cy);
        const w = Math.abs(cx - startX);
        const h = Math.abs(cy - startY);
        if (!moved && (w > 3 || h > 3)) moved = true;
        if (!moved) return;
        this.marquee = { x, y, w, h };
        this.commitMarquee(baseIds, additive);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!moved && !additive) {
          // Plain click on empty area — clear selection.
          store.commit('explorer/setSelectedIds', []);
        }
        this.marquee = null;
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    commitMarquee(baseIds, additive) {
      const treeElt = this.$refs.tree;
      if (!treeElt || !this.marquee) return;
      const { x, y, w, h } = this.marquee;
      const left = x - treeElt.scrollLeft;
      const top = y - treeElt.scrollTop;
      const right = left + w;
      const bottom = top + h;
      const treeRect = treeElt.getBoundingClientRect();
      const hit = new Set(additive ? baseIds : []);
      treeElt.querySelectorAll('.explorer-node__item[data-node-id]').forEach((el) => {
        const id = el.getAttribute('data-node-id');
        if (!id || id === 'trash' || id === 'temp') return;
        const r = el.getBoundingClientRect();
        const relLeft = r.left - treeRect.left;
        const relTop = r.top - treeRect.top;
        const relRight = r.right - treeRect.left;
        const relBottom = r.bottom - treeRect.top;
        const intersects = relLeft < right && relRight > left
          && relTop < bottom && relBottom > top;
        if (intersects) hit.add(id);
      });
      store.commit('explorer/setSelectedIds', [...hit]);
    },
  },
  created() {
    this.$watch(
      () => store.getters['file/current'].id,
      (currentFileId) => {
        store.commit('explorer/setSelectedIds', currentFileId ? [currentFileId] : []);
        store.dispatch('explorer/openNode', currentFileId);
      }, {
        immediate: true,
      },
    );
  },
};
</script>

<style lang="scss">
.explorer,
.explorer__tree {
  height: 100%;
}

.explorer__tree {
  overflow: auto;
  position: relative;

  /* fake element */
  & > .explorer-node > .explorer-node__children > .explorer-node:last-child > .explorer-node__item {
    height: 20px;
    cursor: auto;
  }

  &--drop-root {
    background-color: rgba(0, 128, 255, 0.08);
    box-shadow: inset 0 0 0 2px rgba(0, 128, 255, 0.55);
  }
}

.explorer__marquee {
  position: absolute;
  pointer-events: none;
  background-color: rgba(0, 128, 255, 0.12);
  border: 1px solid rgba(0, 128, 255, 0.6);
  z-index: 2;
}

.explorer__search {
  position: relative;
  padding: 4px 6px 6px 6px;
  flex-shrink: 0;
}

.explorer__search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 22px 4px 8px;
  font-size: 12px;
  height: 26px;
  background-color: rgba(0, 0, 0, 0.04);
  border: 1px solid transparent;
  color: rgba(0, 0, 0, 0.45);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

  &::placeholder {
    color: rgba(0, 0, 0, 0.35);
  }

  &:hover {
    background-color: rgba(0, 0, 0, 0.07);
    color: rgba(0, 0, 0, 0.6);
  }

  &:focus {
    background-color: #fff;
    border-color: rgba(0, 0, 0, 0.25);
    color: rgba(0, 0, 0, 0.85);
    box-shadow: 0 0 0 2px rgba(57, 153, 255, 0.25);
    outline: none;

    &::placeholder {
      color: rgba(0, 0, 0, 0.5);
    }
  }
}

.explorer__search-clear {
  position: absolute;
  top: 6px;
  right: 10px;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;

  &:hover { opacity: 1; }
}
</style>
