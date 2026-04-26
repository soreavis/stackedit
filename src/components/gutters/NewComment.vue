<template>
  <div class="comment comment--new" @keydown.esc.stop="cancelNewComment">
    <div class="comment__header flex flex--row flex--space-between flex--align-center">
      <div class="comment__user flex flex--row flex--align-center">
        <div class="comment__user-image">
          <user-image :user-id="userId"></user-image>
        </div>
        <span class="user-name">{{ loginToken.name }}</span>
      </div>
    </div>
    <div class="comment__text">
      <div class="comment__text-inner">
        <pre class="markdown-highlighting"></pre>
      </div>
    </div>
    <div class="comment__buttons flex flex--row flex--end">
      <button class="comment__button button" @click="cancelNewComment">Cancel</button>
      <button class="comment__button button" @click="addComment">Ok</button>
    </div>
  </div>
</template>

<script>
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import Prism from 'prismjs';
import UserImage from '../UserImage';
import cledit from '../../services/editor/cledit';
import editorSvc from '../../services/editorSvc';
import markdownConversionSvc from '../../services/markdownConversionSvc';
import utils from '../../services/utils';
import userSvc from '../../services/userSvc';
import { useWorkspaceStore } from '../../stores/workspace';
import { useContentStore } from '../../stores/content';
import { useNotificationStore } from '../../stores/notification';
import badgeSvc from '../../services/badgeSvc';
import { useDiscussionStore } from '../../stores/discussion';

export default {
  components: {
    UserImage,
  },
  computed: {
    ...mapPiniaState(useWorkspaceStore, [
      'loginToken',
    ]),
    userId() {
      return userSvc.getCurrentUserId();
    },
  },
  methods: {
    ...mapPiniaActions(useDiscussionStore, [
      'setNewCommentFocus',
    ]),
    ...mapPiniaActions(useDiscussionStore, [
      'cancelNewComment',
    ]),
    addComment() {
      const text = useDiscussionStore().newCommentText.trim();
      if (text.length) {
        if (text.length > 2000) {
          useNotificationStore().error('Comment is too long.');
        } else {
          // Create comment
          const discussionId = useDiscussionStore().currentDiscussionId;
          const comment = {
            discussionId,
            sub: this.userId,
            text,
            created: Date.now(),
          };
          const patch = {
            comments: {
              ...useContentStore().current.comments,
              [utils.uid()]: comment,
            },
          };
          if (discussionId === useDiscussionStore().newDiscussionId) {
            // Create discussion
            patch.discussions = {
              ...useContentStore().current.discussions,
              [discussionId]: useDiscussionStore().newDiscussionFromCurrent,
            };
            badgeSvc.addBadge('createDiscussion');
          } else {
            badgeSvc.addBadge('addComment');
          }
          useContentStore().patchCurrent(patch);
          useDiscussionStore().setNewCommentText();
          useDiscussionStore().setIsCommenting();
        }
      }
    },
  },
  mounted() {
    const preElt = this.$el.querySelector('pre.markdown-highlighting');
    const scrollerElt = this.$el.querySelector('.comment__text-inner');
    const clEditor = cledit(preElt, scrollerElt, true);
    clEditor.init({
      sectionHighlighter: section => Prism.highlight(
        section.text,
        editorSvc.prismGrammars[section.data],
      ),
      sectionParser: text => markdownConversionSvc
        .parseSections(editorSvc.converter, text).sections,
      content: useDiscussionStore().newCommentText,
      selectionStart: useDiscussionStore().newCommentSelection.start,
      selectionEnd: useDiscussionStore().newCommentSelection.end,
      getCursorFocusRatio: () => 0.2,
    });
    clEditor.on('focus', () => this.setNewCommentFocus(true));

    // Save typed content and selection
    clEditor.on('contentChanged', value =>
      useDiscussionStore().setNewCommentText(value));
    clEditor.selectionMgr.on('selectionChanged', (start, end) =>
      useDiscussionStore().setNewCommentSelection({
        start, end,
      }));

    const isSticky = this.$el.parentNode.classList.contains('sticky-comment');
    const isVisible = () => isSticky || useDiscussionStore().stickyComment === null;

    this.$watch(
      () => useDiscussionStore().currentDiscussionId,
      () => {
        this.$nextTick(() => {
          if (isVisible() && useDiscussionStore().newCommentFocus) {
            clEditor.focus();
          }
        });
      },
      { immediate: true },
    );

    if (isSticky) {
      let scrollerMirrorElt;
      const getScrollerMirrorElt = () => {
        if (!scrollerMirrorElt) {
          scrollerMirrorElt = document.querySelector('.comment-list .comment--new .comment__text-inner');
        }
        return scrollerMirrorElt || { scrollTop: 0 };
      };

      scrollerElt.scrollTop = getScrollerMirrorElt().scrollTop;
      scrollerElt.addEventListener('scroll', () => {
        getScrollerMirrorElt().scrollTop = scrollerElt.scrollTop;
      });
    } else {
      // Maintain the state with the sticky comment
      this.$watch(
        () => isVisible(),
        (visible) => {
          clEditor.toggleEditable(visible);
          if (visible) {
            const text = useDiscussionStore().newCommentText;
            clEditor.setContent(text);
            const selection = useDiscussionStore().newCommentSelection;
            clEditor.selectionMgr.setSelectionStartEnd(selection.start, selection.end);
            if (useDiscussionStore().newCommentFocus) {
              clEditor.focus();
            }
          }
        },
        { immediate: true },
      );
      this.$watch(
        () => useDiscussionStore().newCommentText,
        newCommentText => clEditor.setContent(newCommentText),
      );
    }
  },
};
</script>
