<template>
  <div class="comment">
    <div class="comment__header flex flex--row flex--space-between flex--align-center">
      <div class="comment__user flex flex--row flex--align-center">
        <div class="comment__user-image">
          <user-image :user-id="comment.sub"></user-image>
        </div>
        <button class="comment__remove-button button" v-title="'Remove comment'" @click="removeComment">
          <icon-delete></icon-delete>
        </button>
        <user-name :user-id="comment.sub"></user-name>
      </div>
      <div class="comment__created">{{ formatTime(comment.created) }}</div>
    </div>
    <div class="comment__text">
      <div class="comment__text-inner" v-html="text"></div>
    </div>
    <div class="comment__buttons flex flex--row flex--end" v-if="showReply">
      <button class="comment__button button" @click="setIsCommenting(true)">Reply</button>
    </div>
  </div>
</template>

<script lang="ts">

import { defineComponent } from 'vue';
import { mapActions as mapPiniaActions } from 'pinia';
import { formatTime } from '../common/vueGlobals';
import UserImage from '../UserImage.vue';
import UserName from '../UserName.vue';
import editorSvc from '../../services/editorSvc';
import htmlSanitizer from '../../libs/htmlSanitizer';
import { useModalStore } from '../../stores/modal';
import badgeSvc from '../../services/badgeSvc';
import { useDiscussionStore } from '../../stores/discussion';

export default defineComponent({
  components: {
    UserImage,
    UserName,
  },
  props: ['comment'],
  computed: {
    showReply() {
      return this.comment === useDiscussionStore().currentDiscussionLastComment &&
        !useDiscussionStore().isCommenting;
    },
    text() {
      return htmlSanitizer.sanitizeHtml(editorSvc.converter.render(this.comment.text));
    },
  },
  methods: {
    formatTime,
    ...mapPiniaActions(useDiscussionStore, [
      'setIsCommenting',
    ]),
    async removeComment() {
      try {
        await useModalStore().open('commentDeletion');
        useDiscussionStore().cleanCurrentFile({ filterComment: this.comment });
        badgeSvc.addBadge('removeComment');
      } catch (e) {
        // Cancel
      }
    },
  },
  mounted() {
    const parentElt = this.$el.parentNode as HTMLElement | null;
    const isSticky = parentElt && parentElt.classList.contains('sticky-comment');
    if (isSticky) {
      const commentId = useDiscussionStore().currentDiscussionLastCommentId;
      const scrollerElt = this.$el.querySelector('.comment__text-inner') as HTMLElement;

      let scrollerMirrorElt: HTMLElement | null = null;
      const getScrollerMirrorElt = () => {
        if (!scrollerMirrorElt) {
          scrollerMirrorElt = document.querySelector<HTMLElement>(`.comment-list .comment--${commentId} .comment__text-inner`);
        }
        return scrollerMirrorElt || { scrollTop: 0 };
      };

      scrollerElt.scrollTop = getScrollerMirrorElt().scrollTop;
      scrollerElt.addEventListener('scroll', () => {
        getScrollerMirrorElt().scrollTop = scrollerElt.scrollTop;
      });
    }
  },
});
</script>
