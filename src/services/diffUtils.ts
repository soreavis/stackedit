// diff-match-patch wrapper + content-merge orchestrator. Diff tuples
// and content/discussion shapes are dynamic — typed loosely with `any`.
import DiffMatchPatch from 'diff-match-patch';
import utils from './utils';

const diffMatchPatch: any = new DiffMatchPatch();
diffMatchPatch.Match_Distance = 10000;

function makePatchableText(content: any, markerKeys: any[], markerIdxMap: any): any {
  if (!content || !content.discussions) {
    return null;
  }
  const markers: any[] = [];
  // Sort keys to have predictable marker positions in case of same offset
  const discussionKeys: string[] = Object.keys(content.discussions).sort();
  discussionKeys.forEach((discussionId: string) => {
    const discussion = content.discussions[discussionId];

    function addMarker(offsetName: string): void {
      const markerKey = discussionId + offsetName;
      if (discussion[offsetName] !== undefined) {
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
          offset: discussion[offsetName],
        });
      }
    }

    addMarker('start');
    addMarker('end');
  });

  let lastOffset = 0;
  let result = '';
  markers
    .sort((marker1: any, marker2: any) => marker1.offset - marker2.offset)
    .forEach((marker: any) => {
      result +=
        content.text.slice(lastOffset, marker.offset) +
        String.fromCharCode(0xe000 + marker.idx); // Use a character from the private use area
      lastOffset = marker.offset;
    });
  return result + content.text.slice(lastOffset);
}

function stripDiscussionOffsets(objectMap: any): any {
  if (objectMap == null) {
    return objectMap;
  }
  const result: any = {};
  Object.keys(objectMap).forEach((id: string) => {
    result[id] = {
      text: objectMap[id].text,
    };
  });
  return result;
}

function restoreDiscussionOffsets(content: any, markerKeys: any[]): void {
  if (markerKeys.length) {
    // Go through markers
    let count = 0;
    content.text = content.text.replace(
      new RegExp(`[\ue000-${String.fromCharCode((0xe000 + markerKeys.length) - 1)}]`, 'g'),
      (match: string, offset: number) => {
        const idx = match.charCodeAt(0) - 0xe000;
        const markerKey = markerKeys[idx];
        const discussion = content.discussions[markerKey.id];
        if (discussion) {
          discussion[markerKey.offsetName] = offset - count;
        }
        count += 1;
        return '';
      },
    );
    // Sanitize offsets
    Object.keys(content.discussions).forEach((discussionId: string) => {
      const discussion = content.discussions[discussionId];
      if (discussion.start === undefined) {
        discussion.start = discussion.end || 0;
      }
      if (discussion.end === undefined || discussion.end < discussion.start) {
        discussion.end = discussion.start;
      }
    });
  }
}

function mergeText(serverText: any, clientText: any, lastMergedText: any): any {
  const serverClientDiffs = diffMatchPatch.diff_main(serverText, clientText);
  diffMatchPatch.diff_cleanupSemantic(serverClientDiffs);
  // Fusion text is a mix of both server and client contents
  const fusionText = serverClientDiffs.map((diff: any) => diff[1]).join('');
  if (!lastMergedText) {
    return fusionText;
  }
  // Let's try to find out what text has to be removed from fusion
  const intersectionText = serverClientDiffs
    // Keep only equalities
    .filter((diff: any) => diff[0] === (DiffMatchPatch as any).DIFF_EQUAL)
    .map((diff: any) => diff[1]).join('');
  const lastMergedTextDiffs = diffMatchPatch.diff_main(lastMergedText, intersectionText)
    // Keep only equalities and deletions
    .filter((diff: any) => diff[0] !== (DiffMatchPatch as any).DIFF_INSERT);
  diffMatchPatch.diff_cleanupSemantic(lastMergedTextDiffs);
  // Make a patch with deletions only
  const patches = diffMatchPatch.patch_make(lastMergedText, lastMergedTextDiffs);
  // Apply patch to fusion text
  return diffMatchPatch.patch_apply(patches, fusionText)[0];
}

function mergeValues(serverValue: any, clientValue: any, lastMergedValue: any): any {
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

function mergeObjects(serverObject: any, clientObject: any, lastMergedObject: any = {}): any {
  const mergedObject: any = {};
  Object.keys({
    ...clientObject,
    ...serverObject,
  }).forEach((key: string) => {
    const mergedValue = mergeValues(serverObject[key], clientObject[key], lastMergedObject[key]);
    if (mergedValue != null) {
      mergedObject[key] = mergedValue;
    }
  });
  return utils.deepCopy(mergedObject);
}

function mergeContent(serverContent: any, clientContent: any, lastMergedContent: any = {}): any {
  const markerKeys: any[] = [];
  const markerIdxMap: any = Object.create(null);
  const lastMergedText = makePatchableText(lastMergedContent, markerKeys, markerIdxMap);
  const serverText = makePatchableText(serverContent, markerKeys, markerIdxMap);
  const clientText = makePatchableText(clientContent, markerKeys, markerIdxMap);
  const isServerTextChanges = lastMergedText !== serverText;
  const isClientTextChanges = lastMergedText !== clientText;
  const isTextSynchronized = serverText === clientText;
  let text = clientText;
  if (!isTextSynchronized && isServerTextChanges) {
    text = serverText;
    if (isClientTextChanges) {
      text = mergeText(serverText, clientText, lastMergedText);
    }
  }

  const result = {
    text,
    properties: mergeValues(
      serverContent.properties,
      clientContent.properties,
      lastMergedContent.properties,
    ),
    discussions: mergeObjects(
      stripDiscussionOffsets(serverContent.discussions),
      stripDiscussionOffsets(clientContent.discussions),
      stripDiscussionOffsets(lastMergedContent.discussions),
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
