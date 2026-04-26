import { defineStore } from 'pinia';
import DiffMatchPatch from 'diff-match-patch';
import emptyContentRaw from '../data/empties/emptyContent';
import utils from '../services/utils';
import { Cm6Marker } from '../services/editor/cm6/cm6MarkerClass';
import badgeSvc from '../services/badgeSvc';
import { useFileStore } from './file';
import { useModalStore } from './modal';
import { useLayoutStore } from './layout';
import { BaseItem } from './itemStoreFactory';

export interface Content extends BaseItem {
  type?: string;
  text: string;
  properties: string;
  discussions: Record<string, unknown>;
  comments: Record<string, unknown>;
  hash: number;
}

export interface RevisionContent extends Content {
  diffs?: Array<[number, string]>;
  originalText?: string;
}

interface ContentState {
  itemsById: Record<string, Content>;
  revisionContent: RevisionContent | null;
}

const emptyContent = emptyContentRaw as unknown as (id?: string) => Content;

const diffMatchPatch = new DiffMatchPatch();

const hashFunc = (item: Content): number => utils.getItemHash(item);

// Inlined rather than extending itemStoreFactory because content adds:
// state.revisionContent + setRevisionContent mutation/action pair (which
// share a name but do different things — the action is async + diffs,
// the mutation just stores), plus 4 custom getters that cross-cut into
// file (Pinia) and layout (still Vuex).
export const useContentStore = defineStore('content', {
  state: (): ContentState => ({
    itemsById: {},
    revisionContent: null,
  }),
  getters: {
    items(state): Content[] {
      return Object.values(state.itemsById);
    },
    current(state): Content {
      if (state.revisionContent) {
        return state.revisionContent;
      }
      return state.itemsById[`${useFileStore().current.id}/content`] || emptyContent();
    },
    currentChangeTrigger(): string {
      const { current } = this;
      return utils.serializeObject([
        current.id,
        current.text,
        current.hash,
      ]) as string;
    },
    currentProperties(): Record<string, unknown> {
      return utils.computeProperties(this.current.properties);
    },
    isCurrentEditable(): boolean {
      const layoutStyles = (useLayoutStore() as any).styles;
      return !this.revisionContent && !!this.current.id && !!layoutStyles.showEditor;
    },
  },
  actions: {
    setItem(value: Partial<Content> & { id: string }): void {
      const item = Object.assign(emptyContent(value.id), value) as Content;
      if (!item.hash) {
        item.hash = hashFunc(item);
      }
      this.itemsById = { ...this.itemsById, [item.id]: item };
    },
    patchItem(patch: Partial<Content> & { id: string }): boolean {
      const item = this.itemsById[patch.id];
      if (item) {
        const updated = { ...item, ...patch };
        updated.hash = hashFunc(updated);
        this.itemsById = { ...this.itemsById, [item.id]: updated };
        return true;
      }
      return false;
    },
    deleteItem(id: string): void {
      const next = { ...this.itemsById };
      delete next[id];
      this.itemsById = next;
    },
    // The original Vuex module had a setRevisionContent mutation AND an
    // action with the same name (the action diffs, the mutation stores).
    // In Pinia we need different names. Keep `setRevisionContent` as the
    // action; the inner write is now setRevisionContentRaw.
    setRevisionContentRaw(value: Partial<RevisionContent> | null): void {
      if (value) {
        this.revisionContent = {
          ...emptyContent(),
          ...value,
          id: utils.uid(),
          hash: Date.now(),
        };
      } else {
        this.revisionContent = null;
      }
    },
    patchCurrent(value: Partial<Content>): void {
      const { id } = this.current;
      if (id && !this.revisionContent) {
        this.patchItem({
          ...value,
          id,
        });
      }
    },
    setRevisionContent(value: { text: string }): void {
      const currentFile = useFileStore().current;
      const currentContent = this.itemsById[`${currentFile.id}/content`];
      if (currentContent) {
        const diffs = diffMatchPatch.diff_main(currentContent.text, value.text) as Array<[number, string]>;
        diffMatchPatch.diff_cleanupSemantic(diffs);
        this.setRevisionContentRaw({
          text: diffs.map(([, text]) => text).join(''),
          diffs,
          originalText: value.text,
        });
      }
    },
    async restoreRevision(): Promise<void> {
      const { revisionContent } = this;
      if (revisionContent) {
        await useModalStore().open('fileRestoration');
        // Close revision
        this.setRevisionContentRaw(null);
        const currentContent = utils.deepCopy(this.current) as Content | null;
        if (currentContent) {
          const diffs = diffMatchPatch
            .diff_main(currentContent.text, revisionContent.originalText as string) as Array<[number, string]>;
          diffMatchPatch.diff_cleanupSemantic(diffs);
          Object.entries(currentContent.discussions).forEach(([, discussion]) => {
            const adjustOffset = (offsetName: 'start' | 'end') => {
              const d = discussion as Record<string, number>;
              const marker = new Cm6Marker(d[offsetName], offsetName === 'end');
              marker.adjustOffset(diffs);
              d[offsetName] = marker.offset;
            };
            adjustOffset('start');
            adjustOffset('end');
          });
          this.patchCurrent({
            ...currentContent,
            text: revisionContent.originalText as string,
          });
          (badgeSvc as any).addBadge('restoreVersion');
        }
      }
    },
  },
});
