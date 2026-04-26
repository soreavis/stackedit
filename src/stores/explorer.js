import { defineStore } from 'pinia';
import emptyFile from '../data/empties/emptyFile';
import emptyFolder from '../data/empties/emptyFolder';
import { useFolderStore } from './folder';
import { useFileStore } from './file';
import { useSyncLocationStore } from './syncLocation';
import { usePublishLocationStore } from './publishLocation';
import { useDataStore } from './data';

function debounceAction(action, wait) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => action.apply(this, args), wait);
  };
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byName = (a, b) => collator.compare(a.item.name, b.item.name);

function makeComparator(mode, lastOpened, lastCreated, pinnedFolderIds) {
  const byActivity = (a, b) => {
    const getTs = (n) => {
      if (mode === 'modified') {
        return (lastOpened[n.item.id] || 0)
          || ((lastCreated[n.item.id] && lastCreated[n.item.id].created) || 0);
      }
      if (mode === 'created') {
        return (lastCreated[n.item.id] && lastCreated[n.item.id].created) || 0;
      }
      return 0;
    };
    const diff = getTs(b) - getTs(a);
    if (diff !== 0) return diff;
    return byName(a, b);
  };
  const base = mode === 'name' ? byName : byActivity;
  return (a, b) => {
    if (a.isFolder && b.isFolder) {
      const pa = pinnedFolderIds[a.item.id] ? 0 : 1;
      const pb = pinnedFolderIds[b.item.id] ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return base(a, b);
  };
}

class Node {
  constructor(item, locations = [], isFolder = false) {
    this.item = item;
    this.locations = locations;
    this.isFolder = isFolder;
    if (isFolder) {
      this.folders = [];
      this.files = [];
    }
  }

  sortChildren(comparator) {
    if (this.isFolder) {
      this.folders.sort(comparator);
      this.files.sort(comparator);
      this.folders.forEach(child => child.sortChildren(comparator));
    }
  }
}

const nilFileNode = new Node(emptyFile());
nilFileNode.isNil = true;
const fakeFileNode = new Node(emptyFile());
fakeFileNode.item.id = 'fake';
fakeFileNode.noDrag = true;

function getParent({ item, isNil }, { nodeMap, rootNode }) {
  if (isNil) {
    return nilFileNode;
  }
  return nodeMap[item.parentId] || rootNode;
}

function getFolder(node, getters) {
  return node.item.type === 'folder' ?
    node :
    getParent(node, getters);
}

export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    selectedId: null,
    selectedIds: {},
    editingId: null,
    dragSourceId: null,
    dragSourceIds: [],
    dragTargetId: null,
    newChildNode: nilFileNode,
    openNodes: {},
    searchQuery: '',
    userClosedFile: false,
    recentSnapshot: null,
  }),
  getters: {
    nodeStructure(state) {
      const rootNode = new Node(emptyFolder(), [], true);
      rootNode.isRoot = true;

      const trashFolderNode = new Node(emptyFolder(), [], true);
      trashFolderNode.item.id = 'trash';
      trashFolderNode.item.name = 'Trash';
      trashFolderNode.noDrag = true;
      trashFolderNode.isTrash = true;
      trashFolderNode.parentNode = rootNode;

      const tempFolderNode = new Node(emptyFolder(), [], true);
      tempFolderNode.item.id = 'temp';
      tempFolderNode.item.name = 'Temp';
      tempFolderNode.noDrag = true;
      tempFolderNode.noDrop = true;
      tempFolderNode.isTemp = true;
      tempFolderNode.parentNode = rootNode;

      const nodeMap = {
        trash: trashFolderNode,
        temp: tempFolderNode,
      };
      useFolderStore().items.forEach((item) => {
        nodeMap[item.id] = new Node(item, [], true);
      });
      const syncLocationsByFileId = useSyncLocationStore().filteredGroupedByFileId;
      const publishLocationsByFileId = usePublishLocationStore().filteredGroupedByFileId;
      useFileStore().items.forEach((item) => {
        const locations = [
          ...syncLocationsByFileId[item.id] || [],
          ...publishLocationsByFileId[item.id] || [],
        ];
        nodeMap[item.id] = new Node(item, locations);
      });

      Object.entries(nodeMap).forEach(([, node]) => {
        let parentNode = nodeMap[node.item.parentId];
        if (!parentNode || !parentNode.isFolder) {
          if (node.isTrash || node.isTemp) {
            return;
          }
          parentNode = rootNode;
        }
        if (node.isFolder) {
          parentNode.folders.push(node);
        } else {
          parentNode.files.push(node);
        }
        node.parentNode = parentNode;
      });

      const localSettings = useDataStore().localSettings || {};
      const sortMode = localSettings.explorerSort || 'name';
      const pinnedFolderIds = localSettings.pinnedFolderIds || {};
      const lastOpened = useDataStore().lastOpened || {};
      const lastCreated = useDataStore().lastCreated || {};
      const comparator = makeComparator(sortMode, lastOpened, lastCreated, pinnedFolderIds);
      rootNode.sortChildren(comparator);

      const countFiles = (node) => {
        if (!node.isFolder) return 1;
        let total = (node.files || [])
          .filter(f => f.item.id !== 'fake')
          .length;
        (node.folders || []).forEach((f) => { total += countFiles(f); });
        node.fileCount = total;
        return total;
      };
      countFiles(rootNode);

      const recentFolderNode = new Node(emptyFolder(), [], true);
      recentFolderNode.item.id = 'recent';
      recentFolderNode.item.name = 'Recent';
      recentFolderNode.noDrag = true;
      recentFolderNode.noDrop = true;
      recentFolderNode.isRecent = true;
      recentFolderNode.parentNode = rootNode;
      const snapshot = state.recentSnapshot && state.recentSnapshot.length
        ? state.recentSnapshot
        : Object.entries(lastOpened)
          .sort((a, b) => b[1] - a[1])
          .map(([id, ts]) => ({ id, ts }));
      const recentIds = snapshot
        .map(entry => entry.id)
        .filter(id => nodeMap[id] && !nodeMap[id].isFolder && nodeMap[id].item.parentId !== 'trash')
        .slice(0, 10);
      const tsById = Object.fromEntries(snapshot.map(e => [e.id, e.ts]));
      const formatRelative = (ts) => {
        if (!ts) return '';
        const diff = Date.now() - ts;
        const min = 60000;
        if (diff < min) return 'now';
        if (diff < 60 * min) return `${Math.round(diff / min)}m`;
        if (diff < 24 * 60 * min) return `${Math.round(diff / (60 * min))}h`;
        if (diff < 7 * 24 * 60 * min) return `${Math.round(diff / (24 * 60 * min))}d`;
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      };
      recentFolderNode.files = recentIds.map((id) => {
        const original = nodeMap[id];
        const clone = new Node(original.item, original.locations);
        clone.parentNode = recentFolderNode;
        clone.noDrag = true;
        clone.recentLabel = formatRelative(tsById[id]);
        return clone;
      });
      recentFolderNode.fileCount = recentFolderNode.files.length;

      rootNode.folders.unshift(tempFolderNode);
      tempFolderNode.files.forEach((node) => {
        node.noDrop = true;
      });
      rootNode.folders.unshift(trashFolderNode);
      if (recentFolderNode.files.length) {
        rootNode.folders.unshift(recentFolderNode);
      }

      rootNode.files.push(fakeFileNode);
      return {
        nodeMap,
        rootNode,
      };
    },
    nodeMap() { return this.nodeStructure.nodeMap; },
    rootNode() { return this.nodeStructure.rootNode; },
    newChildNodeParent(state) {
      return getParent(state.newChildNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
    selectedNode() {
      return this.nodeMap[this.selectedId] || nilFileNode;
    },
    selectedNodeFolder() {
      return getFolder(this.selectedNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
    selectedNodes() {
      return Object.keys(this.selectedIds)
        .map(id => this.nodeMap[id])
        .filter(node => node && !node.isNil);
    },
    searchMatchIds() {
      const q = (this.searchQuery || '').trim().toLowerCase();
      if (!q) return null;
      const matches = new Set();
      const visit = (node) => {
        if (!node || !node.item) return false;
        let any = false;
        if (node.item.name && node.item.name.toLowerCase().includes(q)) {
          matches.add(node.item.id);
          any = true;
        }
        if (node.isFolder) {
          node.folders.forEach((child) => {
            if (visit(child)) any = true;
          });
          (node.files || []).forEach((child) => {
            if (child.item.id === 'fake') return;
            if (visit(child)) any = true;
          });
          if (any && node.item.id) matches.add(node.item.id);
        }
        return any;
      };
      visit(this.rootNode);
      return matches;
    },
    editingNode() {
      return this.nodeMap[this.editingId] || nilFileNode;
    },
    dragSourceNode() {
      return this.nodeMap[this.dragSourceId] || nilFileNode;
    },
    dragTargetNode() {
      if (this.dragTargetId === 'fake') return fakeFileNode;
      return this.nodeMap[this.dragTargetId] || nilFileNode;
    },
    dragTargetNodeFolder() {
      if (this.dragTargetId === 'fake') return this.rootNode;
      return getFolder(this.dragTargetNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
  },
  actions: {
    setSelectedId(value) { this.selectedId = value; },
    setSelectedIds(ids) {
      const map = {};
      (ids || []).forEach((id) => { if (id) map[id] = true; });
      this.selectedIds = map;
      if (!this.selectedId || !map[this.selectedId]) {
        this.selectedId = ids && ids.length ? ids[ids.length - 1] : null;
      }
    },
    toggleSelectedId(id) {
      if (!id) return;
      const next = { ...this.selectedIds };
      if (next[id]) {
        delete next[id];
        if (this.selectedId === id) {
          const keys = Object.keys(next);
          this.selectedId = keys[keys.length - 1] || null;
        }
      } else {
        next[id] = true;
        this.selectedId = id;
      }
      this.selectedIds = next;
    },
    setEditingId(value) { this.editingId = value; },
    setDragSourceId(value) { this.dragSourceId = value; },
    setDragSourceIds(value) { this.dragSourceIds = value; },
    setDragTargetId(value) { this.dragTargetId = value; },
    setSearchQuery(value) { this.searchQuery = value; },
    setUserClosedFile(value) { this.userClosedFile = value; },
    setRecentSnapshot(value) { this.recentSnapshot = value; },
    setNewItem(item) {
      this.newChildNode = item ? new Node(item, [], item.type === 'folder') : nilFileNode;
    },
    setNewItemName(name) {
      this.newChildNode.item.name = name;
    },
    toggleOpenNode(id) {
      this.openNodes = { ...this.openNodes, [id]: !this.openNodes[id] };
    },
    setOpenNodes(openNodes) {
      this.openNodes = openNodes || {};
    },
    openNode(id) {
      const node = this.nodeMap[id];
      if (node) {
        if (node.isFolder && !this.openNodes[id]) {
          this.toggleOpenNode(id);
        }
        this.openNode(node.item.parentId);
      }
    },
    openDragTarget: debounceAction(function open() {
      this.openNode(this.dragTargetId);
    }, 1000),
    setDragTarget(node) {
      if (!node) {
        this.setDragTargetId();
        return;
      }
      if (node.isRoot) {
        this.setDragTargetId('fake');
        return;
      }
      const folderNode = getFolder(node, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
      const sourceIds = this.dragSourceIds && this.dragSourceIds.length
        ? this.dragSourceIds
        : [this.dragSourceNode.item.id];
      const { nodeMap } = this;
      for (let parentNode = folderNode;
        parentNode;
        parentNode = nodeMap[parentNode.item.parentId]
      ) {
        if (sourceIds.includes(parentNode.item.id)) {
          this.setDragTargetId();
          return;
        }
      }

      this.setDragTargetId(node.item.id);
      this.openDragTarget();
    },
  },
});
