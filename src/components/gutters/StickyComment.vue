<template>
  <div class="sticky-comment" :style="{width: constants.gutterWidth + 'px', top: top + 'px'}">
    <comment v-if="currentDiscussionLastComment" :comment="currentDiscussionLastComment"></comment>
    <new-comment v-if="isCommenting"></new-comment>
  </div>
</template>

<script>
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import Comment from './Comment';
import NewComment from './NewComment';
import { useLayoutStore } from '../../stores/layout';
import { useDiscussionStore } from '../../stores/discussion';

export default {
  components: {
    Comment,
    NewComment,
  },
  data: () => ({
    top: 0,
  }),
  computed: {
    ...mapPiniaState(useLayoutStore, [
      'constants',
    ]),
    ...mapPiniaState(useDiscussionStore, [
      'isCommenting',
    ]),
    ...mapPiniaState(useDiscussionStore, [
      'currentDiscussionLastComment',
    ]),
  },
};
</script>

<style lang="scss">
@use '../../styles/variables.scss' as *;

.sticky-comment {
  position: absolute;
  right: 0;
  font-size: 15px;
  padding-top: 10px;

  .current-discussion & {
    width: auto !important;
  }
}
</style>
