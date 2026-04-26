import { defineStore } from 'pinia';
import DiffMatchPatch from 'diff-match-patch';
import empty from '../data/empties/emptyContent';
import utils from '../services/utils';
import { Cm6Marker } from '../services/editor/cm6/cm6MarkerClass';
import badgeSvc from '../services/badgeSvc';
import { useFileStore } from './file';
import { useModalStore } from './modal';
import { useLayoutStore } from './layout';

const diffMatchPatch = new DiffMatchPatch();

const hashFunc = item => utils.getItemHash(item);

// Inlined rather than extending itemStoreFactory because content adds:
// state.revisionContent + setRevisionContent mutation/action pair (which
// share a name but do different things — the action is async + diffs,
// the mutation just stores), plus 4 custom getters that cross-cut into
// file (Pinia) and layout (still Vuex).
export const useContentStore = defineStore('content', {
  state: () => ({
    itemsById: {},
    revisionContent: null,
  }),
  getters: {
    items: ({ itemsById }) => Object.values(itemsById),
    current({ itemsById, revisionContent }) {
      if (revisionContent) {
        return revisionContent;
      }
      return itemsById[`${useFileStore().current.id}/content`] || empty();
    },
    currentChangeTrigger() {
      const { current } = this;
      return utils.serializeObject([
        current.id,
        current.text,
        current.hash,
      ]);
    },
    currentProperties() {
      return utils.computeProperties(this.current.properties);
    },
    isCurrentEditable() {
      const layoutStyles = useLayoutStore().styles;
      return !this.revisionContent && this.current.id && layoutStyles.showEditor;
    },
  },
  actions: {
    setItem(value) {
      const item = Object.assign(empty(value.id), value);
      if (!item.hash) {
        item.hash = hashFunc(item);
      }
      this.itemsById = { ...this.itemsById, [item.id]: item };
    },
    patchItem(patch) {
      const item = this.itemsById[patch.id];
      if (item) {
        const updated = { ...item, ...patch };
        updated.hash = hashFunc(updated);
        this.itemsById = { ...this.itemsById, [item.id]: updated };
        return true;
      }
      return false;
    },
    deleteItem(id) {
      const next = { ...this.itemsById };
      delete next[id];
      this.itemsById = next;
    },
    // The original Vuex module had a setRevisionContent mutation AND an
    // action with the same name (the action diffs, the mutation stores).
    // In Pinia we need different names. Keep `setRevisionContent` as the
    // action; the inner write is now setRevisionContentRaw.
    setRevisionContentRaw(value) {
      if (value) {
        this.revisionContent = {
          ...empty(),
          ...value,
          id: utils.uid(),
          hash: Date.now(),
        };
      } else {
        this.revisionContent = null;
      }
    },
    patchCurrent(value) {
      const { id } = this.current;
      if (id && !this.revisionContent) {
        this.patchItem({
          ...value,
          id,
        });
      }
    },
    setRevisionContent(value) {
      const currentFile = useFileStore().current;
      const currentContent = this.itemsById[`${currentFile.id}/content`];
      if (currentContent) {
        const diffs = diffMatchPatch.diff_main(currentContent.text, value.text);
        diffMatchPatch.diff_cleanupSemantic(diffs);
        this.setRevisionContentRaw({
          text: diffs.map(([, text]) => text).join(''),
          diffs,
          originalText: value.text,
        });
      }
    },
    async restoreRevision() {
      const { revisionContent } = this;
      if (revisionContent) {
        await useModalStore().open('fileRestoration');
        // Close revision
        this.setRevisionContentRaw(null);
        const currentContent = utils.deepCopy(this.current);
        if (currentContent) {
          const diffs = diffMatchPatch
            .diff_main(currentContent.text, revisionContent.originalText);
          diffMatchPatch.diff_cleanupSemantic(diffs);
          Object.entries(currentContent.discussions).forEach(([, discussion]) => {
            const adjustOffset = (offsetName) => {
              const marker = new Cm6Marker(discussion[offsetName], offsetName === 'end');
              marker.adjustOffset(diffs);
              discussion[offsetName] = marker.offset;
            };
            adjustOffset('start');
            adjustOffset('end');
          });
          this.patchCurrent({
            ...currentContent,
            text: revisionContent.originalText,
          });
          badgeSvc.addBadge('restoreVersion');
        }
      }
    },
  },
});
