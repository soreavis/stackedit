import Vue from 'vue';
import emptyFile from '../data/empties/emptyFile';
import emptyFolder from '../data/empties/emptyFolder';

const setter = propertyName => (state, value) => {
  state[propertyName] = value;
};

function debounceAction(action, wait) {
  let timeoutId;
  return (context) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => action(context), wait);
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

export default {
  namespaced: true,
  state: {
    selectedId: null,
    selectedIds: {}, // map of id → true; includes the primary selectedId
    editingId: null,
    dragSourceId: null,
    dragSourceIds: [], // ordered list for multi-drag; falls back to [dragSourceId]
    dragTargetId: null,
    newChildNode: nilFileNode,
    openNodes: {},
    searchQuery: '',
    userClosedFile: false, // set when user explicitly closes current file
  },
  mutations: {
    setSelectedId: setter('selectedId'),
    setSelectedIds(state, ids) {
      const map = {};
      (ids || []).forEach((id) => { if (id) map[id] = true; });
      state.selectedIds = map;
      // Keep selectedId inside the set — pick last if it drifted out.
      if (!state.selectedId || !map[state.selectedId]) {
        state.selectedId = ids && ids.length ? ids[ids.length - 1] : null;
      }
    },
    toggleSelectedId(state, id) {
      if (!id) return;
      const next = { ...state.selectedIds };
      if (next[id]) {
        delete next[id];
        if (state.selectedId === id) {
          const keys = Object.keys(next);
          state.selectedId = keys[keys.length - 1] || null;
        }
      } else {
        next[id] = true;
        state.selectedId = id;
      }
      state.selectedIds = next;
    },
    setEditingId: setter('editingId'),
    setDragSourceId: setter('dragSourceId'),
    setDragSourceIds: setter('dragSourceIds'),
    setDragTargetId: setter('dragTargetId'),
    setSearchQuery: setter('searchQuery'),
    setUserClosedFile: setter('userClosedFile'),
    setNewItem(state, item) {
      state.newChildNode = item ? new Node(item, [], item.type === 'folder') : nilFileNode;
    },
    setNewItemName(state, name) {
      state.newChildNode.item.name = name;
    },
    toggleOpenNode(state, id) {
      Vue.set(state.openNodes, id, !state.openNodes[id]);
    },
    setOpenNodes(state, openNodes) {
      state.openNodes = openNodes || {};
    },
  },
  getters: {
    nodeStructure: (state, getters, rootState, rootGetters) => {
      const rootNode = new Node(emptyFolder(), [], true);
      rootNode.isRoot = true;

      // Create Trash node
      const trashFolderNode = new Node(emptyFolder(), [], true);
      trashFolderNode.item.id = 'trash';
      trashFolderNode.item.name = 'Trash';
      trashFolderNode.noDrag = true;
      trashFolderNode.isTrash = true;
      trashFolderNode.parentNode = rootNode;

      // Create Temp node
      const tempFolderNode = new Node(emptyFolder(), [], true);
      tempFolderNode.item.id = 'temp';
      tempFolderNode.item.name = 'Temp';
      tempFolderNode.noDrag = true;
      tempFolderNode.noDrop = true;
      tempFolderNode.isTemp = true;
      tempFolderNode.parentNode = rootNode;

      // Fill nodeMap with all file and folder nodes
      const nodeMap = {
        trash: trashFolderNode,
        temp: tempFolderNode,
      };
      rootGetters['folder/items'].forEach((item) => {
        nodeMap[item.id] = new Node(item, [], true);
      });
      const syncLocationsByFileId = rootGetters['syncLocation/filteredGroupedByFileId'];
      const publishLocationsByFileId = rootGetters['publishLocation/filteredGroupedByFileId'];
      rootGetters['file/items'].forEach((item) => {
        const locations = [
          ...syncLocationsByFileId[item.id] || [],
          ...publishLocationsByFileId[item.id] || [],
        ];
        nodeMap[item.id] = new Node(item, locations);
      });

      // Build the tree
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

      // Sort honoring user's mode + pinned folders.
      const localSettings = rootGetters['data/localSettings'] || {};
      const sortMode = localSettings.explorerSort || 'name';
      const pinnedFolderIds = localSettings.pinnedFolderIds || {};
      const lastOpened = rootGetters['data/lastOpened'] || {};
      const lastCreated = rootGetters['data/lastCreated'] || {};
      const comparator = makeComparator(sortMode, lastOpened, lastCreated, pinnedFolderIds);
      rootNode.sortChildren(comparator);

      // Compute recursive descendant-file counts for every folder.
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

      // Synthesize a Recent folder at the very top, clones of real file
      // nodes (same item.id — clicks still open the real file). Ranked by
      // data/lastOpened timestamp, capped at 10 entries.
      const recentFolderNode = new Node(emptyFolder(), [], true);
      recentFolderNode.item.id = 'recent';
      recentFolderNode.item.name = 'Recent';
      recentFolderNode.noDrag = true;
      recentFolderNode.noDrop = true;
      recentFolderNode.isRecent = true;
      recentFolderNode.parentNode = rootNode;
      const recentIds = Object.entries(lastOpened)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .filter(id => nodeMap[id] && !nodeMap[id].isFolder && nodeMap[id].item.parentId !== 'trash')
        .slice(0, 10);
      recentFolderNode.files = recentIds.map((id) => {
        const original = nodeMap[id];
        const clone = new Node(original.item, original.locations);
        clone.parentNode = recentFolderNode;
        clone.noDrag = true;
        return clone;
      });
      recentFolderNode.fileCount = recentFolderNode.files.length;

      // Add Trash, Temp, Recent nodes
      rootNode.folders.unshift(tempFolderNode);
      tempFolderNode.files.forEach((node) => {
        node.noDrop = true;
      });
      rootNode.folders.unshift(trashFolderNode);
      if (recentFolderNode.files.length) {
        rootNode.folders.unshift(recentFolderNode);
      }

      // Add a fake file at the end of the root folder to allow drag and drop into it
      rootNode.files.push(fakeFileNode);
      return {
        nodeMap,
        rootNode,
      };
    },
    nodeMap: (state, { nodeStructure }) => nodeStructure.nodeMap,
    rootNode: (state, { nodeStructure }) => nodeStructure.rootNode,
    newChildNodeParent: (state, getters) => getParent(state.newChildNode, getters),
    selectedNode: ({ selectedId }, { nodeMap }) => nodeMap[selectedId] || nilFileNode,
    selectedNodeFolder: (state, getters) => getFolder(getters.selectedNode, getters),
    selectedNodes: ({ selectedIds }, { nodeMap }) => Object.keys(selectedIds)
      .map(id => nodeMap[id])
      .filter(node => node && !node.isNil),
    searchMatchIds: ({ searchQuery }, { rootNode }) => {
      const q = (searchQuery || '').trim().toLowerCase();
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
      visit(rootNode);
      return matches;
    },
    editingNode: ({ editingId }, { nodeMap }) => nodeMap[editingId] || nilFileNode,
    dragSourceNode: ({ dragSourceId }, { nodeMap }) => nodeMap[dragSourceId] || nilFileNode,
    dragTargetNode: ({ dragTargetId }, { nodeMap }) => {
      if (dragTargetId === 'fake') {
        return fakeFileNode;
      }
      return nodeMap[dragTargetId] || nilFileNode;
    },
    dragTargetNodeFolder: ({ dragTargetId }, getters) => {
      if (dragTargetId === 'fake') {
        return getters.rootNode;
      }
      return getFolder(getters.dragTargetNode, getters);
    },
  },
  actions: {
    openNode({
      state,
      getters,
      commit,
      dispatch,
    }, id) {
      const node = getters.nodeMap[id];
      if (node) {
        if (node.isFolder && !state.openNodes[id]) {
          commit('toggleOpenNode', id);
        }
        dispatch('openNode', node.item.parentId);
      }
    },
    openDragTarget: debounceAction(({ state, dispatch }) => {
      dispatch('openNode', state.dragTargetId);
    }, 1000),
    setDragTarget({ state, commit, getters, dispatch }, node) {
      if (!node) {
        commit('setDragTargetId');
        return;
      }
      // Root has no real id; route through the 'fake' sentinel so
      // dragTargetNodeFolder resolves back to rootNode (see getters).
      if (node.isRoot) {
        commit('setDragTargetId', 'fake');
        return;
      }
      // Make sure target folder is not a descendant of any dragged source.
      const folderNode = getFolder(node, getters);
      const sourceIds = state.dragSourceIds && state.dragSourceIds.length
        ? state.dragSourceIds
        : [getters.dragSourceNode.item.id];
      const { nodeMap } = getters;
      for (let parentNode = folderNode;
        parentNode;
        parentNode = nodeMap[parentNode.item.parentId]
      ) {
        if (sourceIds.includes(parentNode.item.id)) {
          commit('setDragTargetId');
          return;
        }
      }

      commit('setDragTargetId', node.item.id);
      dispatch('openDragTarget');
    },
  },
};
