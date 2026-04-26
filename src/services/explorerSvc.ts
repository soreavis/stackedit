import store from '../store';
import { useFileStore } from '../stores/file';
import { useFolderStore } from '../stores/folder';
import { useModalStore } from '../stores/modal';
import workspaceSvc from './workspaceSvc';
import badgeSvc from './badgeSvc';
import { useDataStore } from '../stores/data';

// ExplorerNode is the tree-shaped wrapper that the `explorer/nodeStructure`
// getter produces. Real shape is rich (folders/files arrays, isRoot/isTrash/
// isTemp/isNil flags, isFolder, item with id/parentId/name) — type just the
// fields we touch here.
interface ExplorerNode {
  isRoot?: boolean;
  isTrash?: boolean;
  isTemp?: boolean;
  isNil?: boolean;
  isFolder?: boolean;
  folders: ExplorerNode[];
  files: ExplorerNode[];
  item: { id: string; parentId?: string; name?: string };
}

// Walk parent chain to see if node lives under a sentinel folder.
function isUnder(node: ExplorerNode, sentinelId: string, nodeMap: Record<string, ExplorerNode>): boolean {
  for (let walk: ExplorerNode | undefined = node; walk; walk = nodeMap[walk.item.parentId as string]) {
    if (walk.item.id === sentinelId) return true;
  }
  return false;
}

// After a delete, only auto-switch to a replacement that's already VISIBLE —
// i.e. every folder in its ancestor chain is expanded. Otherwise the
// file-watcher would walk up and pop a collapsed folder open, which the
// user finds disorienting when they've just removed something.
function pickVisibleReplacement(): string | null {
  const { nodeMap } = store.getters['explorer/nodeStructure'];
  const openNodes = store.state.explorer.openNodes;
  const ids: string[] = useDataStore().lastOpenedIds;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const file = (useFileStore().itemsById as Record<string, any>)[id];
    if (!file || file.parentId === 'trash') continue;
    let visible = true;
    for (
      let parent: ExplorerNode | undefined = nodeMap[file.parentId];
      parent && !parent.isRoot;
      parent = nodeMap[parent.item.parentId as string]
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

async function bulkDelete(selectedNodes: ExplorerNode[]): Promise<void> {
  // Drop sentinel roots and empty nodes — users can't bulk-delete Trash/Temp themselves.
  const nodes = selectedNodes.filter(n => !n.isTrash && !n.isTemp && !n.isNil);
  if (!nodes.length) return;

  const { nodeMap }: { nodeMap: Record<string, ExplorerNode> } = store.getters['explorer/nodeStructure'];

  // If a folder is selected alongside one of its descendants, drop the
  // descendant — the folder's recursive delete will cover it anyway.
  const ids = new Set(nodes.map(n => n.item.id));
  const effective = nodes.filter((node) => {
    for (let walk = nodeMap[node.item.parentId as string]; walk; walk = nodeMap[walk.item.parentId as string]) {
      if (ids.has(walk.item.id)) return false;
    }
    return true;
  });

  const toTrashNodes: ExplorerNode[] = [];
  const permanentNodes: ExplorerNode[] = [];
  let folders = 0;
  effective.forEach((node) => {
    if (node.isFolder) folders += 1;
    const inTrash = isUnder(node, 'trash', nodeMap);
    const inTemp = isUnder(node, 'temp', nodeMap);
    if (inTrash || inTemp) permanentNodes.push(node);
    else toTrashNodes.push(node);
  });

  try {
    await useModalStore().open({
      type: 'bulkDeletion',
      toTrash: toTrashNodes.length,
      permanent: permanentNodes.length,
      folders,
    });
  } catch {
    return; // cancelled
  }

  const currentFileId = useFileStore().current.id;
  let doClose = false;

  const recursivePurge = (node: ExplorerNode): void => {
    if (node.isFolder) {
      node.folders.forEach(recursivePurge);
      node.files.forEach((fileNode) => {
        doClose = doClose || fileNode.item.id === currentFileId;
        workspaceSvc.deleteFile(fileNode.item.id);
      });
      useFolderStore().deleteItem(node.item.id);
    } else {
      doClose = doClose || node.item.id === currentFileId;
      workspaceSvc.deleteFile(node.item.id);
    }
  };

  const recursiveToTrash = (node: ExplorerNode): void => {
    if (node.isFolder) {
      node.folders.forEach(recursiveToTrash);
      node.files.forEach((fileNode) => {
        doClose = doClose || fileNode.item.id === currentFileId;
        (workspaceSvc as any).setOrPatchItem({ id: fileNode.item.id, parentId: 'trash' });
      });
      useFolderStore().deleteItem(node.item.id);
    } else {
      doClose = doClose || node.item.id === currentFileId;
      (workspaceSvc as any).setOrPatchItem({ id: node.item.id, parentId: 'trash' });
    }
  };

  permanentNodes.forEach(recursivePurge);
  toTrashNodes.forEach(recursiveToTrash);

  if (folders) badgeSvc.addBadge('removeFolder');
  else badgeSvc.addBadge('removeFile');

  // Clear selection after bulk delete.
  store.commit('explorer/setSelectedIds', []);

  if (doClose) {
    useFileStore().setCurrentId(pickVisibleReplacement());
  }
}

export default {
  newItem(isFolder = false): void {
    const selectedNode: ExplorerNode = store.getters['explorer/selectedNode'];
    let parentId: string | null = store.getters['explorer/selectedNodeFolder'].item.id;
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
  async deleteItem(): Promise<void> {
    const selectedNodes: ExplorerNode[] = store.getters['explorer/selectedNodes'];
    if (selectedNodes.length > 1) {
      await bulkDelete(selectedNodes);
      return;
    }
    const selectedNode: ExplorerNode = store.getters['explorer/selectedNode'];
    if (selectedNode.isNil) {
      return;
    }

    if (selectedNode.isTrash || selectedNode.item.parentId === 'trash') {
      try {
        await useModalStore().open('trashDeletion');
      } catch {
        // Cancel
      }
      return;
    }

    // See if we have a confirmation dialog to show
    let moveToTrash = true;
    try {
      if (selectedNode.isTemp) {
        await useModalStore().open('tempFolderDeletion');
        moveToTrash = false;
      } else if (selectedNode.item.parentId === 'temp') {
        await useModalStore().open({
          type: 'tempFileDeletion',
          item: selectedNode.item,
        });
        moveToTrash = false;
      } else if (selectedNode.isFolder) {
        await useModalStore().open({
          type: 'folderDeletion',
          item: selectedNode.item,
        });
      }
    } catch {
      return; // cancel
    }

    const deleteFile = (id: string): void => {
      if (moveToTrash) {
        (workspaceSvc as any).setOrPatchItem({
          id,
          parentId: 'trash',
        });
      } else {
        workspaceSvc.deleteFile(id);
      }
    };

    if (selectedNode === store.getters['explorer/selectedNode']) {
      const currentFileId = useFileStore().current.id;
      let doClose = selectedNode.item.id === currentFileId;
      if (selectedNode.isFolder) {
        const recursiveDelete = (folderNode: ExplorerNode): void => {
          folderNode.folders.forEach(recursiveDelete);
          folderNode.files.forEach((fileNode) => {
            doClose = doClose || fileNode.item.id === currentFileId;
            deleteFile(fileNode.item.id);
          });
          useFolderStore().deleteItem(folderNode.item.id);
        };
        recursiveDelete(selectedNode);
        badgeSvc.addBadge('removeFolder');
      } else {
        deleteFile(selectedNode.item.id);
        badgeSvc.addBadge('removeFile');
      }
      if (doClose) {
        const replacement = pickVisibleReplacement();
        useFileStore().setCurrentId(replacement);
      }
    }
  },
};
