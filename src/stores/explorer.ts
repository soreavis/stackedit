import { defineStore } from 'pinia';
import emptyFile from '../data/empties/emptyFile';
import emptyFolder from '../data/empties/emptyFolder';
import { useFolderStore } from './folder';
import { useFileStore } from './file';
import { useSyncLocationStore } from './syncLocation';
import { usePublishLocationStore } from './publishLocation';
import { useDataStore } from './data';

interface ExplorerItem {
  id: string;
  name?: string;
  type?: string;
  parentId?: string | null;
  [key: string]: unknown;
}

interface ExplorerNodeShape {
  item: ExplorerItem;
  locations: unknown[];
  isFolder: boolean;
  folders?: ExplorerNodeShape[];
  files?: ExplorerNodeShape[];
  isNil?: boolean;
  isRoot?: boolean;
  isTrash?: boolean;
  isTemp?: boolean;
  isRecent?: boolean;
  noDrag?: boolean;
  noDrop?: boolean;
  parentNode?: ExplorerNodeShape;
  fileCount?: number;
  recentLabel?: string;
  sortChildren(comparator: (a: ExplorerNodeShape, b: ExplorerNodeShape) => number): void;
}

type LastOpenedMap = Record<string, number>;
type LastCreatedMap = Record<string, { created: number }>;

function debounceAction<This, Args extends unknown[]>(action: (this: This, ...args: Args) => void, wait: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function debounced(this: This, ...args: Args): void {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => action.apply(this, args), wait);
  };
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byName = (a: ExplorerNodeShape, b: ExplorerNodeShape): number => collator.compare(a.item.name as string, b.item.name as string);

function makeComparator(
  mode: string,
  lastOpened: LastOpenedMap,
  lastCreated: LastCreatedMap,
  pinnedFolderIds: Record<string, boolean>,
): (a: ExplorerNodeShape, b: ExplorerNodeShape) => number {
  const byActivity = (a: ExplorerNodeShape, b: ExplorerNodeShape): number => {
    const getTs = (n: ExplorerNodeShape): number => {
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
  return (a: ExplorerNodeShape, b: ExplorerNodeShape) => {
    if (a.isFolder && b.isFolder) {
      const pa = pinnedFolderIds[a.item.id] ? 0 : 1;
      const pb = pinnedFolderIds[b.item.id] ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return base(a, b);
  };
}

class Node implements ExplorerNodeShape {
  item: ExplorerItem;
  locations: unknown[];
  isFolder: boolean;
  folders?: ExplorerNodeShape[];
  files?: ExplorerNodeShape[];
  isNil?: boolean;
  isRoot?: boolean;
  isTrash?: boolean;
  isTemp?: boolean;
  isRecent?: boolean;
  noDrag?: boolean;
  noDrop?: boolean;
  parentNode?: ExplorerNodeShape;
  fileCount?: number;
  recentLabel?: string;

  constructor(item: ExplorerItem, locations: unknown[] = [], isFolder = false) {
    this.item = item;
    this.locations = locations;
    this.isFolder = isFolder;
    if (isFolder) {
      this.folders = [];
      this.files = [];
    }
  }

  sortChildren(comparator: (a: ExplorerNodeShape, b: ExplorerNodeShape) => number): void {
    if (this.isFolder) {
      (this.folders as ExplorerNodeShape[]).sort(comparator);
      (this.files as ExplorerNodeShape[]).sort(comparator);
      (this.folders as ExplorerNodeShape[]).forEach(child => child.sortChildren(comparator));
    }
  }
}

const nilFileNode = new Node(emptyFile() as unknown as ExplorerItem);
nilFileNode.isNil = true;
const fakeFileNode = new Node(emptyFile() as unknown as ExplorerItem);
fakeFileNode.item.id = 'fake';
fakeFileNode.noDrag = true;

interface NodeMapContext {
  nodeMap: Record<string, ExplorerNodeShape>;
  rootNode: ExplorerNodeShape;
}

function getParent(node: ExplorerNodeShape, ctx: NodeMapContext): ExplorerNodeShape {
  if (node.isNil) {
    return nilFileNode;
  }
  return ctx.nodeMap[node.item.parentId as string] || ctx.rootNode;
}

function getFolder(node: ExplorerNodeShape, ctx: NodeMapContext): ExplorerNodeShape {
  return node.item.type === 'folder'
    ? node
    : getParent(node, ctx);
}

interface ExplorerState {
  selectedId: string | null;
  selectedIds: Record<string, boolean>;
  editingId: string | null;
  dragSourceId: string | null;
  dragSourceIds: string[];
  dragTargetId: string | null;
  newChildNode: ExplorerNodeShape;
  openNodes: Record<string, boolean>;
  searchQuery: string;
  userClosedFile: boolean;
  recentSnapshot: { id: string; ts: number }[] | null;
}

export const useExplorerStore = defineStore('explorer', {
  state: (): ExplorerState => ({
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
    nodeStructure(state): NodeMapContext {
      const rootNode = new Node(emptyFolder() as unknown as ExplorerItem, [], true);
      rootNode.isRoot = true;

      const trashFolderNode = new Node(emptyFolder() as unknown as ExplorerItem, [], true);
      trashFolderNode.item.id = 'trash';
      trashFolderNode.item.name = 'Trash';
      trashFolderNode.noDrag = true;
      trashFolderNode.isTrash = true;
      trashFolderNode.parentNode = rootNode;

      const tempFolderNode = new Node(emptyFolder() as unknown as ExplorerItem, [], true);
      tempFolderNode.item.id = 'temp';
      tempFolderNode.item.name = 'Temp';
      tempFolderNode.noDrag = true;
      tempFolderNode.noDrop = true;
      tempFolderNode.isTemp = true;
      tempFolderNode.parentNode = rootNode;

      const nodeMap: Record<string, ExplorerNodeShape> = {
        trash: trashFolderNode,
        temp: tempFolderNode,
      };
      (useFolderStore().items as ExplorerItem[]).forEach((item) => {
        nodeMap[item.id] = new Node(item, [], true);
      });
      const syncLocationsByFileId = (useSyncLocationStore() as any).filteredGroupedByFileId as Record<string, unknown[]>;
      const publishLocationsByFileId = (usePublishLocationStore() as any).filteredGroupedByFileId as Record<string, unknown[]>;
      (useFileStore().items as ExplorerItem[]).forEach((item) => {
        const locations = [
          ...syncLocationsByFileId[item.id] || [],
          ...publishLocationsByFileId[item.id] || [],
        ];
        nodeMap[item.id] = new Node(item, locations);
      });

      Object.entries(nodeMap).forEach(([, node]) => {
        let parentNode = nodeMap[node.item.parentId as string];
        if (!parentNode || !parentNode.isFolder) {
          if (node.isTrash || node.isTemp) {
            return;
          }
          parentNode = rootNode;
        }
        if (node.isFolder) {
          (parentNode.folders as ExplorerNodeShape[]).push(node);
        } else {
          (parentNode.files as ExplorerNodeShape[]).push(node);
        }
        node.parentNode = parentNode;
      });

      const localSettings = ((useDataStore() as any).localSettings || {}) as Record<string, unknown>;
      const sortMode = (localSettings.explorerSort as string) || 'name';
      const pinnedFolderIds = (localSettings.pinnedFolderIds as Record<string, boolean>) || {};
      const lastOpened = ((useDataStore() as any).lastOpened || {}) as LastOpenedMap;
      const lastCreated = ((useDataStore() as any).lastCreated || {}) as LastCreatedMap;
      const comparator = makeComparator(sortMode, lastOpened, lastCreated, pinnedFolderIds);
      rootNode.sortChildren(comparator);

      const countFiles = (node: ExplorerNodeShape): number => {
        if (!node.isFolder) return 1;
        let total = (node.files || [])
          .filter(f => f.item.id !== 'fake')
          .length;
        (node.folders || []).forEach((f) => { total += countFiles(f); });
        node.fileCount = total;
        return total;
      };
      countFiles(rootNode);

      const recentFolderNode = new Node(emptyFolder() as unknown as ExplorerItem, [], true);
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
      const formatRelative = (ts: number | undefined): string => {
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

      (rootNode.folders as ExplorerNodeShape[]).unshift(tempFolderNode);
      (tempFolderNode.files as ExplorerNodeShape[]).forEach((node) => {
        node.noDrop = true;
      });
      (rootNode.folders as ExplorerNodeShape[]).unshift(trashFolderNode);
      if (recentFolderNode.files.length) {
        (rootNode.folders as ExplorerNodeShape[]).unshift(recentFolderNode);
      }

      (rootNode.files as ExplorerNodeShape[]).push(fakeFileNode);
      return {
        nodeMap,
        rootNode,
      };
    },
    nodeMap(): Record<string, ExplorerNodeShape> { return this.nodeStructure.nodeMap; },
    rootNode(): ExplorerNodeShape { return this.nodeStructure.rootNode; },
    newChildNodeParent(state): ExplorerNodeShape {
      return getParent(state.newChildNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
    selectedNode(): ExplorerNodeShape {
      return this.nodeMap[this.selectedId as string] || nilFileNode;
    },
    selectedNodeFolder(): ExplorerNodeShape {
      return getFolder(this.selectedNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
    selectedNodes(): ExplorerNodeShape[] {
      return Object.keys(this.selectedIds)
        .map(id => this.nodeMap[id])
        .filter((node): node is ExplorerNodeShape => !!node && !node.isNil);
    },
    searchMatchIds(): Set<string> | null {
      const q = (this.searchQuery || '').trim().toLowerCase();
      if (!q) return null;
      const matches = new Set<string>();
      const visit = (node: ExplorerNodeShape | undefined): boolean => {
        if (!node || !node.item) return false;
        let any = false;
        if (node.item.name && (node.item.name as string).toLowerCase().includes(q)) {
          matches.add(node.item.id);
          any = true;
        }
        if (node.isFolder) {
          (node.folders as ExplorerNodeShape[]).forEach((child) => {
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
    editingNode(): ExplorerNodeShape {
      return this.nodeMap[this.editingId as string] || nilFileNode;
    },
    dragSourceNode(): ExplorerNodeShape {
      return this.nodeMap[this.dragSourceId as string] || nilFileNode;
    },
    dragTargetNode(): ExplorerNodeShape {
      if (this.dragTargetId === 'fake') return fakeFileNode;
      return this.nodeMap[this.dragTargetId as string] || nilFileNode;
    },
    dragTargetNodeFolder(): ExplorerNodeShape {
      if (this.dragTargetId === 'fake') return this.rootNode;
      return getFolder(this.dragTargetNode, {
        nodeMap: this.nodeMap,
        rootNode: this.rootNode,
      });
    },
  },
  actions: {
    setSelectedId(value: string | null): void { this.selectedId = value; },
    setSelectedIds(ids: string[] | null | undefined): void {
      const map: Record<string, boolean> = {};
      (ids || []).forEach((id) => { if (id) map[id] = true; });
      this.selectedIds = map;
      if (!this.selectedId || !map[this.selectedId]) {
        this.selectedId = ids && ids.length ? ids[ids.length - 1] : null;
      }
    },
    toggleSelectedId(id: string | null | undefined): void {
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
    setEditingId(value: string | null): void { this.editingId = value; },
    setDragSourceId(value: string | null): void { this.dragSourceId = value; },
    setDragSourceIds(value: string[]): void { this.dragSourceIds = value; },
    setDragTargetId(value?: string | null): void { this.dragTargetId = value ?? null; },
    setSearchQuery(value: string): void { this.searchQuery = value; },
    setUserClosedFile(value: boolean): void { this.userClosedFile = value; },
    setRecentSnapshot(value: { id: string; ts: number }[] | null): void { this.recentSnapshot = value; },
    setNewItem(item: Partial<ExplorerItem> | null): void {
      this.newChildNode = item
        ? new Node(item as ExplorerItem, [], item.type === 'folder')
        : nilFileNode;
    },
    setNewItemName(name: string): void {
      this.newChildNode.item.name = name;
    },
    toggleOpenNode(id: string): void {
      this.openNodes = { ...this.openNodes, [id]: !this.openNodes[id] };
    },
    setOpenNodes(openNodes: Record<string, boolean> | null | undefined): void {
      this.openNodes = openNodes || {};
    },
    openNode(id: string | null | undefined): void {
      if (!id) return;
      const node = this.nodeMap[id];
      if (node) {
        if (node.isFolder && !this.openNodes[id]) {
          this.toggleOpenNode(id);
        }
        this.openNode(node.item.parentId);
      }
    },
    openDragTarget: debounceAction(function open(this: { openNode: (id: string | null) => void; dragTargetId: string | null }) {
      this.openNode(this.dragTargetId);
    }, 1000),
    setDragTarget(node: ExplorerNodeShape | null | undefined): void {
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
      for (let parentNode: ExplorerNodeShape | undefined = folderNode;
        parentNode;
        parentNode = nodeMap[parentNode.item.parentId as string]
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
