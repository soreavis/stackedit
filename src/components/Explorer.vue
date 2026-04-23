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
    <div
      class="explorer__tree"
      :class="{
        'explorer__tree--new-item': !newChildNode.isNil,
        'explorer__tree--drop-root': isRootDropTarget,
      }"
      v-if="!light"
      tabindex="0"
      @keydown.delete="deleteItem()"
      @dragover.prevent
      @dragenter="onTreeDragEnter"
      @dragleave="onTreeDragLeave"
      @drop.prevent.stop="onTreeDrop"
    >
      <explorer-node :node="rootNode" :depth="0"></explorer-node>
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

      const sourceNode = store.getters['explorer/dragSourceNode'];
      if (sourceNode.isNil) return;
      if (sourceNode.item.parentId === null) return;

      workspaceSvc.storeItem({
        ...sourceNode.item,
        parentId: null,
      });
      badgeSvc.addBadge(sourceNode.isFolder ? 'moveFolder' : 'moveFile');
    },
  },
  created() {
    this.$watch(
      () => store.getters['file/current'].id,
      (currentFileId) => {
        store.commit('explorer/setSelectedId', currentFileId);
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
</style>
