import store from '../store';
import workspaceSvc from './workspaceSvc';
import badgeSvc from './badgeSvc';

// Walk parent chain to see if node lives under a sentinel folder.
function isUnder(node, sentinelId, nodeMap) {
  for (let walk = node; walk; walk = nodeMap[walk.item.parentId]) {
    if (walk.item.id === sentinelId) return true;
  }
  return false;
}

// After a delete, only auto-switch to a replacement that's already VISIBLE —
// i.e. every folder in its ancestor chain is expanded. Otherwise the
// file-watcher would walk up and pop a collapsed folder open, which the
// user finds disorienting when they've just removed something.
function pickVisibleReplacement() {
  const { nodeMap } = store.getters['explorer/nodeStructure'];
  const openNodes = store.state.explorer.openNodes;
  const ids = store.getters['data/lastOpenedIds'];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const file = store.state.file.itemsById[id];
    if (!file || file.parentId === 'trash') continue;
    let visible = true;
    for (
      let parent = nodeMap[file.parentId];
      parent && !parent.isRoot;
      parent = nodeMap[parent.item.parentId]
    ) {
      if (!openNodes[parent.item.id]) {
        visible = false;
        break;
      }
    }
    if (visible) return id;
  }
  return null;
}

async function bulkDelete(selectedNodes) {
  // Drop sentinel roots and empty nodes — users can't bulk-delete Trash/Temp themselves.
  const nodes = selectedNodes.filter(n => !n.isTrash && !n.isTemp && !n.isNil);
  if (!nodes.length) return;

  const { nodeMap } = store.getters['explorer/nodeStructure'];

  // If a folder is selected alongside one of its descendants, drop the
  // descendant — the folder's recursive delete will cover it anyway.
  const ids = new Set(nodes.map(n => n.item.id));
  const effective = nodes.filter((node) => {
    for (let walk = nodeMap[node.item.parentId]; walk; walk = nodeMap[walk.item.parentId]) {
      if (ids.has(walk.item.id)) return false;
    }
    return true;
  });

  const toTrashNodes = [];
  const permanentNodes = [];
  let folders = 0;
  effective.forEach((node) => {
    if (node.isFolder) folders += 1;
    const inTrash = isUnder(node, 'trash', nodeMap);
    const inTemp = isUnder(node, 'temp', nodeMap);
    if (inTrash || inTemp) permanentNodes.push(node);
    else toTrashNodes.push(node);
  });

  try {
    await store.dispatch('modal/open', {
      type: 'bulkDeletion',
      toTrash: toTrashNodes.length,
      permanent: permanentNodes.length,
      folders,
    });
  } catch (e) {
    return; // cancelled
  }

  const currentFileId = store.getters['file/current'].id;
  let doClose = false;

  const recursivePurge = (node) => {
    if (node.isFolder) {
      node.folders.forEach(recursivePurge);
      node.files.forEach((fileNode) => {
        doClose = doClose || fileNode.item.id === currentFileId;
        workspaceSvc.deleteFile(fileNode.item.id);
      });
      store.commit('folder/deleteItem', node.item.id);
    } else {
      doClose = doClose || node.item.id === currentFileId;
      workspaceSvc.deleteFile(node.item.id);
    }
  };

  const recursiveToTrash = (node) => {
    if (node.isFolder) {
      node.folders.forEach(recursiveToTrash);
      node.files.forEach((fileNode) => {
        doClose = doClose || fileNode.item.id === currentFileId;
        workspaceSvc.setOrPatchItem({ id: fileNode.item.id, parentId: 'trash' });
      });
      store.commit('folder/deleteItem', node.item.id);
    } else {
      doClose = doClose || node.item.id === currentFileId;
      workspaceSvc.setOrPatchItem({ id: node.item.id, parentId: 'trash' });
    }
  };

  permanentNodes.forEach(recursivePurge);
  toTrashNodes.forEach(recursiveToTrash);

  if (folders) badgeSvc.addBadge('removeFolder');
  else badgeSvc.addBadge('removeFile');

  // Clear selection after bulk delete.
  store.commit('explorer/setSelectedIds', []);

  if (doClose) {
    store.commit('file/setCurrentId', pickVisibleReplacement());
  }
}

export default {
  newItem(isFolder = false) {
    const selectedNode = store.getters['explorer/selectedNode'];
    let parentId = store.getters['explorer/selectedNodeFolder'].item.id;
    // If the selected folder is collapsed, create at the root instead
    // of burying the new item inside a closed branch.
    if (selectedNode.isFolder
      && !selectedNode.isRoot
      && !store.state.explorer.openNodes[selectedNode.item.id]
    ) {
      parentId = null;
    }
    if (parentId === 'trash' // Not allowed to create new items in the trash
      || (isFolder && parentId === 'temp') // Not allowed to create new folders in the temp folder
    ) {
      parentId = null;
    }
    store.dispatch('explorer/openNode', parentId);
    store.commit('explorer/setNewItem', {
      type: isFolder ? 'folder' : 'file',
      parentId,
    });
  },
  async deleteItem() {
    const selectedNodes = store.getters['explorer/selectedNodes'];
    if (selectedNodes.length > 1) {
      await bulkDelete(selectedNodes);
      return;
    }
    const selectedNode = store.getters['explorer/selectedNode'];
    if (selectedNode.isNil) {
      return;
    }

    if (selectedNode.isTrash || selectedNode.item.parentId === 'trash') {
      try {
        await store.dispatch('modal/open', 'trashDeletion');
      } catch (e) {
        // Cancel
      }
      return;
    }

    // See if we have a confirmation dialog to show
    let moveToTrash = true;
    try {
      if (selectedNode.isTemp) {
        await store.dispatch('modal/open', 'tempFolderDeletion');
        moveToTrash = false;
      } else if (selectedNode.item.parentId === 'temp') {
        await store.dispatch('modal/open', {
          type: 'tempFileDeletion',
          item: selectedNode.item,
        });
        moveToTrash = false;
      } else if (selectedNode.isFolder) {
        await store.dispatch('modal/open', {
          type: 'folderDeletion',
          item: selectedNode.item,
        });
      }
    } catch (e) {
      return; // cancel
    }

    const deleteFile = (id) => {
      if (moveToTrash) {
        workspaceSvc.setOrPatchItem({
          id,
          parentId: 'trash',
        });
      } else {
        workspaceSvc.deleteFile(id);
      }
    };

    if (selectedNode === store.getters['explorer/selectedNode']) {
      const currentFileId = store.getters['file/current'].id;
      let doClose = selectedNode.item.id === currentFileId;
      if (selectedNode.isFolder) {
        const recursiveDelete = (folderNode) => {
          folderNode.folders.forEach(recursiveDelete);
          folderNode.files.forEach((fileNode) => {
            doClose = doClose || fileNode.item.id === currentFileId;
            deleteFile(fileNode.item.id);
          });
          store.commit('folder/deleteItem', folderNode.item.id);
        };
        recursiveDelete(selectedNode);
        badgeSvc.addBadge('removeFolder');
      } else {
        deleteFile(selectedNode.item.id);
        badgeSvc.addBadge('removeFile');
      }
      if (doClose) {
        const replacement = pickVisibleReplacement();
        store.commit('file/setCurrentId', replacement);
      }
    }
  },
};
