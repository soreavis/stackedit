// diff-match-patch wrapper + content-merge orchestrator. Discussion
// offsets are encoded into a marker character stream (private-use
// codepoints from U+E000) so a text diff can preserve their positions
// across server/client merges.
import DiffMatchPatch from 'diff-match-patch';
import utils from './utils';

// diff-match-patch shapes — the npm types are awkward; cast at the
// boundary.
type DiffOp = -1 | 0 | 1;
type DiffTuple = [DiffOp, string];
interface DiffMatchPatchInstance {
  Match_Distance: number;
  diff_main(a: string, b: string): DiffTuple[];
  diff_cleanupSemantic(diffs: DiffTuple[]): void;
  patch_make(text: string, diffs: DiffTuple[]): unknown[];
  patch_apply(patches: unknown[], text: string): [string, boolean[]];
}

const diffMatchPatch = new DiffMatchPatch() as unknown as DiffMatchPatchInstance;
diffMatchPatch.Match_Distance = 10000;

const DIFF_EQUAL = (DiffMatchPatch as { DIFF_EQUAL: DiffOp }).DIFF_EQUAL;
const DIFF_INSERT = (DiffMatchPatch as { DIFF_INSERT: DiffOp }).DIFF_INSERT;

// Discussion shape used by the merge logic. Offsets are nullable in
// practice — `restoreDiscussionOffsets` sanitizes them after each
// reconstruction.
export interface DiscussionLike {
  start?: number;
  end?: number;
  text?: string;
  [key: string]: unknown;
}

export interface ContentLike {
  text: string;
  properties?: string;
  discussions?: Record<string, unknown>;
  comments?: Record<string, unknown>;
  history?: unknown[];
  [key: string]: unknown;
}

interface MarkerKey {
  id: string;
  offsetName: 'start' | 'end';
}

interface Marker {
  idx: number;
  offset: number;
}

type MarkerIdxMap = Record<string, number>;

export function makePatchableText(
  content: ContentLike | null | undefined,
  markerKeys: MarkerKey[],
  markerIdxMap: MarkerIdxMap,
): string | null {
  if (!content || !content.discussions) {
    return null;
  }
  const markers: Marker[] = [];
  // Sort keys to have predictable marker positions in case of same offset
  const discussionKeys = Object.keys(content.discussions).sort();
  const discussions = content.discussions as Record<string, DiscussionLike>;
  discussionKeys.forEach((discussionId) => {
    const discussion = discussions[discussionId];

    function addMarker(offsetName: 'start' | 'end'): void {
      const markerKey = discussionId + offsetName;
      const offset = discussion[offsetName];
      if (offset !== undefined) {
        let idx = markerIdxMap[markerKey];
        if (idx === undefined) {
          idx = markerKeys.length;
          markerIdxMap[markerKey] = idx;
          markerKeys.push({
            id: discussionId,
            offsetName,
          });
        }
        markers.push({
          idx,
          offset: offset as number,
        });
      }
    }

    addMarker('start');
    addMarker('end');
  });

  let lastOffset = 0;
  let result = '';
  markers
    .sort((marker1, marker2) => marker1.offset - marker2.offset)
    .forEach((marker) => {
      result +=
        content.text.slice(lastOffset, marker.offset) +
        String.fromCharCode(0xe000 + marker.idx); // Use a character from the private use area
      lastOffset = marker.offset;
    });
  return result + content.text.slice(lastOffset);
}

function stripDiscussionOffsets<T extends Record<string, { text?: string; [k: string]: unknown }>>(
  objectMap: T | null | undefined,
): Record<string, { text?: string }> | null | undefined {
  if (objectMap == null) {
    return objectMap;
  }
  const result: Record<string, { text?: string }> = {};
  Object.keys(objectMap).forEach((id) => {
    result[id] = {
      text: objectMap[id].text,
    };
  });
  return result;
}

export function restoreDiscussionOffsets(
  content: ContentLike,
  markerKeys: MarkerKey[],
): void {
  if (markerKeys.length) {
    // Go through markers
    let count = 0;
    content.text = content.text.replace(
      new RegExp(`[-${String.fromCharCode((0xe000 + markerKeys.length) - 1)}]`, 'g'),
      (match: string, offset: number) => {
        const idx = match.charCodeAt(0) - 0xe000;
        const markerKey = markerKeys[idx];
        const discussion = content.discussions && (content.discussions as Record<string, DiscussionLike>)[markerKey.id];
        if (discussion) {
          discussion[markerKey.offsetName] = offset - count;
        }
        count += 1;
        return '';
      },
    );
    // Sanitize offsets
    if (content.discussions) {
      const discussions = content.discussions as Record<string, DiscussionLike>;
      Object.keys(discussions).forEach((discussionId) => {
        const discussion = discussions[discussionId];
        if (discussion.start === undefined) {
          discussion.start = discussion.end || 0;
        }
        if (discussion.end === undefined || (discussion.start !== undefined && discussion.end < discussion.start)) {
          discussion.end = discussion.start;
        }
      });
    }
  }
}

function mergeText(serverText: string, clientText: string, lastMergedText: string | null): string {
  const serverClientDiffs = diffMatchPatch.diff_main(serverText, clientText);
  diffMatchPatch.diff_cleanupSemantic(serverClientDiffs);
  // Fusion text is a mix of both server and client contents
  const fusionText = serverClientDiffs.map(diff => diff[1]).join('');
  if (!lastMergedText) {
    return fusionText;
  }
  // Let's try to find out what text has to be removed from fusion
  const intersectionText = serverClientDiffs
    // Keep only equalities
    .filter(diff => diff[0] === DIFF_EQUAL)
    .map(diff => diff[1]).join('');
  const lastMergedTextDiffs = diffMatchPatch.diff_main(lastMergedText, intersectionText)
    // Keep only equalities and deletions
    .filter(diff => diff[0] !== DIFF_INSERT);
  diffMatchPatch.diff_cleanupSemantic(lastMergedTextDiffs);
  // Make a patch with deletions only
  const patches = diffMatchPatch.patch_make(lastMergedText, lastMergedTextDiffs);
  // Apply patch to fusion text
  return diffMatchPatch.patch_apply(patches, fusionText)[0];
}

function mergeValues<T>(serverValue: T, clientValue: T, lastMergedValue: T): T {
  if (!lastMergedValue) {
    return serverValue || clientValue; // Take the server value in priority
  }
  const newSerializedValue = utils.serializeObject(clientValue);
  const serverSerializedValue = utils.serializeObject(serverValue);
  if (newSerializedValue === serverSerializedValue) {
    return serverValue; // no conflict
  }
  const oldSerializedValue = utils.serializeObject(lastMergedValue);
  if (oldSerializedValue !== newSerializedValue && !serverValue) {
    return clientValue; // Removed on server but changed on client
  }
  if (oldSerializedValue !== serverSerializedValue && !clientValue) {
    return serverValue; // Removed on client but changed on server
  }
  if (oldSerializedValue !== newSerializedValue && oldSerializedValue === serverSerializedValue) {
    return clientValue; // Take the client value
  }
  return serverValue; // Take the server value
}

export function mergeObjects(
  serverObject: Record<string, unknown> | null | undefined,
  clientObject: Record<string, unknown> | null | undefined,
  lastMergedObject: Record<string, unknown> = {},
): Record<string, unknown> {
  const mergedObject: Record<string, unknown> = {};
  Object.keys({
    ...clientObject,
    ...serverObject,
  }).forEach((key) => {
    const mergedValue = mergeValues(
      serverObject?.[key],
      clientObject?.[key],
      lastMergedObject[key],
    );
    if (mergedValue != null) {
      mergedObject[key] = mergedValue;
    }
  });
  return utils.deepCopy(mergedObject) as Record<string, unknown>;
}

export function mergeContent(
  serverContent: ContentLike,
  clientContent: ContentLike,
  lastMergedContent: ContentLike = { text: '' },
): ContentLike {
  const markerKeys: MarkerKey[] = [];
  const markerIdxMap: MarkerIdxMap = Object.create(null);
  const lastMergedText = makePatchableText(lastMergedContent, markerKeys, markerIdxMap);
  const serverText = makePatchableText(serverContent, markerKeys, markerIdxMap);
  const clientText = makePatchableText(clientContent, markerKeys, markerIdxMap);
  const isServerTextChanges = lastMergedText !== serverText;
  const isClientTextChanges = lastMergedText !== clientText;
  const isTextSynchronized = serverText === clientText;
  let text = clientText || '';
  if (!isTextSynchronized && isServerTextChanges) {
    text = serverText || '';
    if (isClientTextChanges) {
      text = mergeText(serverText || '', clientText || '', lastMergedText);
    }
  }

  const result: ContentLike = {
    text,
    properties: mergeValues(
      serverContent.properties,
      clientContent.properties,
      lastMergedContent.properties,
    ),
    discussions: mergeObjects(
      stripDiscussionOffsets(serverContent.discussions as Record<string, DiscussionLike>) as Record<string, unknown>,
      stripDiscussionOffsets(clientContent.discussions as Record<string, DiscussionLike>) as Record<string, unknown>,
      stripDiscussionOffsets(lastMergedContent.discussions as Record<string, DiscussionLike>) as Record<string, unknown>,
    ),
    comments: mergeObjects(
      serverContent.comments,
      clientContent.comments,
      lastMergedContent.comments,
    ),
  };
  restoreDiscussionOffsets(result, markerKeys);
  return result;
}

export default {
  makePatchableText,
  restoreDiscussionOffsets,
  mergeObjects,
  mergeContent,
};
