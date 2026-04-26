import { watch } from 'vue';
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
// @ts-nocheck
// Tangled with cleditCore (still on JS) — full typing requires porting
// cledit core first. .ts extension applied for migration tracking; nocheck
// suppresses errors until the underlying cledit types flow through.
import DiffMatchPatch from 'diff-match-patch';
import cleditRaw from './cledit';
import utils from '../utils';
import diffUtils from '../diffUtils';
import { useContentStore } from '../../stores/content';
import { useContentStateStore } from '../../stores/contentState';
import EditorClassApplier from '../../components/common/EditorClassApplier';
import PreviewClassApplier from '../../components/common/PreviewClassApplier';
import { useDiscussionStore } from '../../stores/discussion';

// editorSvcDiscussions plugs into a discussions/markers/class-applier
// pipeline that has very dynamic shapes — type the module-level state
// loosely until the surrounding modules (cledit core, EditorClassApplier,
// discussion store) are ported and proper types can flow through.
const cledit = cleditRaw as any;

let clEditor: any;
// let discussionIds = {};
let discussionMarkers: Record<string, any> = {};
let markerKeys: any;
let markerIdxMap: Record<string, number>;
let previousPatchableText: any;
let currentPatchableText: any;
let isChangePatch: any;
let contentId: any;
let editorClassAppliers: Record<string, any> = {};
let previewClassAppliers: Record<string, any> = {};

function getDiscussionMarkers(discussion: any, discussionId: string, onMarker: (marker: any) => void) {
  const getMarker = (offsetName: string) => {
    const markerKey = `${discussionId}:${offsetName}`;
    let marker = discussionMarkers[markerKey];
    if (!marker) {
      marker = new cledit.Marker(discussion[offsetName], offsetName === 'end');
      marker.discussionId = discussionId;
      marker.offsetName = offsetName;
      clEditor.addMarker(marker);
      discussionMarkers[markerKey] = marker;
    }
    onMarker(marker);
  };
  getMarker('start');
  getMarker('end');
}

function syncDiscussionMarkers(content: any, writeOffsets: boolean) {
  const discussions = {
    ...content.discussions,
  };
  const newDiscussion = useDiscussionStore().newDiscussionFromCurrent;
  if (newDiscussion) {
    discussions[useDiscussionStore().newDiscussionId as unknown as string] = {
      ...(newDiscussion as object),
    };
  }
  Object.entries(discussionMarkers).forEach(([markerKey, marker]) => {
    // Remove marker if discussion was removed
    const discussion = discussions[marker.discussionId];
    if (!discussion) {
      clEditor.removeMarker(marker);
      delete discussionMarkers[markerKey];
    }
  });

  Object.entries(discussions).forEach(([discussionId, discussion]: [string, any]) => {
    getDiscussionMarkers(discussion, discussionId, writeOffsets
      ? (marker: any) => {
        discussion[marker.offsetName] = marker.offset;
      }
      : (marker: any) => {
        marker.offset = discussion[marker.offsetName];
      });
  });

  if (writeOffsets && newDiscussion) {
    useDiscussionStore().patchNewDiscussion(
      discussions[useDiscussionStore().newDiscussionId as unknown as string],
    );
  }
}

function removeDiscussionMarkers() {
  Object.entries(discussionMarkers).forEach(([, marker]) => {
    clEditor.removeMarker(marker);
  });
  discussionMarkers = {};
  markerKeys = [];
  markerIdxMap = Object.create(null);
}

const diffMatchPatch = new DiffMatchPatch();

function makePatches() {
  const diffs = diffMatchPatch.diff_main(previousPatchableText, currentPatchableText);
  return diffMatchPatch.patch_make(previousPatchableText, diffs);
}

function applyPatches(patches: any) {
  const newPatchableText = diffMatchPatch.patch_apply(patches, currentPatchableText)[0];
  let result = newPatchableText;
  if (markerKeys.length) {
    // Strip text markers
    result = result.replace(new RegExp(`[\ue000-${String.fromCharCode((0xe000 + markerKeys.length) - 1)}]`, 'g'), '');
  }
  // Expect a `contentChanged` event
  if (result !== clEditor.getContent()) {
    previousPatchableText = currentPatchableText;
    currentPatchableText = newPatchableText;
    isChangePatch = true;
  }
  return result;
}

function reversePatches(patches: any) {
  const result = diffMatchPatch.patch_deepCopy(patches).reverse();
  result.forEach((patch: any) => {
    patch.diffs.forEach((diff: [number, string]) => {
      diff[0] = -diff[0];
    });
  });
  return result;
}

export default {
  clEditor: undefined as any,
  createClEditor(editorElt: HTMLElement) {
    this.clEditor = cledit(editorElt, editorElt.parentNode, true);
    ({ clEditor } = this);
    clEditor.on('contentChanged', (text: string) => {
      const oldContent = useContentStore().current;
      const newContent = {
        ...utils.deepCopy(oldContent),
        text: utils.sanitizeText(text),
      };
      syncDiscussionMarkers(newContent, true);
      if (!isChangePatch) {
        previousPatchableText = currentPatchableText;
        currentPatchableText = diffUtils.makePatchableText(newContent, markerKeys, markerIdxMap);
      } else {
        // Take a chance to restore discussion offsets on undo/redo
        newContent.text = currentPatchableText;
        diffUtils.restoreDiscussionOffsets(newContent, markerKeys);
        syncDiscussionMarkers(newContent, false);
      }
      useContentStore().patchCurrent(newContent);
      isChangePatch = false;
    });
    clEditor.on('focus', () => useDiscussionStore().setNewCommentFocus(false));
  },
  initClEditorInternal(opts: any) {
    const content = useContentStore().current;
    if (content) {
      removeDiscussionMarkers(); // Markers will be recreated on contentChanged
      const contentState = (useContentStateStore() as any).current;
      const options = Object.assign({
        selectionStart: contentState.selectionStart,
        selectionEnd: contentState.selectionEnd,
        patchHandler: {
          makePatches,
          applyPatches,
          reversePatches,
        },
      }, opts);

      if (contentId !== content.id) {
        contentId = content.id;
        currentPatchableText = diffUtils.makePatchableText(content, markerKeys, markerIdxMap);
        previousPatchableText = currentPatchableText;
        syncDiscussionMarkers(content, false);
        options.content = content.text;
      }

      clEditor.init(options);
    }
  },
  applyContent() {
    if (clEditor) {
      const content = useContentStore().current;
      if (clEditor.setContent(content.text, true).range) {
        // Marker will be recreated on contentChange
        removeDiscussionMarkers();
      } else {
        syncDiscussionMarkers(content, false);
      }
    }
  },
  getTrimmedSelection() {
    const { selectionMgr } = clEditor;
    let start = Math.min(selectionMgr.selectionStart, selectionMgr.selectionEnd);
    let end = Math.max(selectionMgr.selectionStart, selectionMgr.selectionEnd);
    const text = clEditor.getContent();
    while ((text[start] || '').match(/\s/)) {
      start += 1;
    }
    while ((text[end - 1] || '').match(/\s/)) {
      end -= 1;
    }
    return start < end && { start, end };
  },
  initHighlighters() {
    watch(
      () => useDiscussionStore().newDiscussionFromCurrent,
      () => syncDiscussionMarkers(useContentStore().current, false),
    );

    watch(
      () => useDiscussionStore().currentFileDiscussions,
      (discussions: Record<string, any>) => {
        const classGetter = (type: string, discussionId: string) => () => {
          const classes = [`discussion-${type}-highlighting--${discussionId}`, `discussion-${type}-highlighting`];
          if (useDiscussionStore().currentDiscussionId === discussionId) {
            classes.push(`discussion-${type}-highlighting--selected`);
          }
          return classes;
        };
        const offsetGetter = (discussionId: string) => () => {
          const startMarker = discussionMarkers[`${discussionId}:start`];
          const endMarker = discussionMarkers[`${discussionId}:end`];
          return startMarker && endMarker && {
            start: startMarker.offset,
            end: endMarker.offset,
          };
        };

        // Editor class appliers
        const oldEditorClassAppliers = editorClassAppliers;
        editorClassAppliers = {};
        Object.keys(discussions).forEach((discussionId) => {
          const classApplier = oldEditorClassAppliers[discussionId] || new EditorClassApplier(
            classGetter('editor', discussionId),
            offsetGetter(discussionId),
            { discussionId },
          );
          editorClassAppliers[discussionId] = classApplier;
        });
        // Clean unused class appliers
        Object.entries(oldEditorClassAppliers).forEach(([discussionId, classApplier]) => {
          if (!editorClassAppliers[discussionId]) {
            classApplier.stop();
          }
        });

        // Preview class appliers
        const oldPreviewClassAppliers = previewClassAppliers;
        previewClassAppliers = {};
        Object.keys(discussions).forEach((discussionId) => {
          const classApplier = oldPreviewClassAppliers[discussionId] || new PreviewClassApplier(
            classGetter('preview', discussionId),
            offsetGetter(discussionId),
            { discussionId },
          );
          previewClassAppliers[discussionId] = classApplier;
        });
        // Clean unused class appliers
        Object.entries(oldPreviewClassAppliers).forEach(([discussionId, classApplier]) => {
          if (!previewClassAppliers[discussionId]) {
            classApplier.stop();
          }
        });
      },
    );
  },
};

