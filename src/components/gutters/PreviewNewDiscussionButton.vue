<template>
  <a class="new-discussion-button" href="javascript:void(0)" v-if="coordinates" :style="{top: coordinates.top + 'px'}" v-title="'Start a discussion'" @mousedown.stop.prevent @click="createNewDiscussion(selection)">
    <icon-message></icon-message>
  </a>
</template>

<script>
import { mapActions as mapPiniaActions } from 'pinia';
import editorSvc from '../../services/editorSvc';
import { useContentStore } from '../../stores/content';
import { useLayoutStore } from '../../stores/layout';
import { useDiscussionStore } from '../../stores/discussion';

export default {
  data: () => ({
    selection: null,
    coordinates: null,
  }),
  methods: {
    ...mapPiniaActions(useDiscussionStore, [
      'createNewDiscussion',
    ]),
    checkSelection() {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        let offset;
        // Show the button if content is not a revision and preview selection is not empty
        if (
          !useContentStore().revisionContent &&
          editorSvc.previewSelectionRange
        ) {
          this.selection = editorSvc.getTrimmedSelection();
          if (this.selection) {
            const { text } = editorSvc.previewCtxWithDiffs;
            offset = editorSvc.getPreviewOffset(this.selection.end);
            while (offset && text[offset - 1] === '\n') {
              offset -= 1;
            }
          }
        }
        this.coordinates = offset
          ? editorSvc.getPreviewOffsetCoordinates(offset)
          : null;
      }, 25);
    },
  },
  mounted() {
    this.$nextTick(() => {
      editorSvc.$on('previewSelectionRange', () => this.checkSelection());
      this.$watch(
        () => useLayoutStore().styles.previewWidth,
        () => this.checkSelection(),
      );
      this.checkSelection();
    });
  },
};
</script>
