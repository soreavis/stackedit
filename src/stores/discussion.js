import { defineStore } from 'pinia';
import utils from '../services/utils';
import googleHelper from '../services/providers/helpers/googleHelper';
import { useModalStore } from './modal';
import { useContentStore } from './content';
import { useWorkspaceStore } from './workspace';

const idShifter = offset => function shifter() {
  const ids = Object.keys(this.currentFileDiscussions)
    .filter(id => id !== this.newDiscussionId);
  const idx = ids.indexOf(this.currentDiscussionId) + offset + ids.length;
  return ids[idx % ids.length];
};

export const useDiscussionStore = defineStore('discussion', {
  state: () => ({
    currentDiscussionId: null,
    newDiscussion: null,
    newDiscussionId: null,
    isCommenting: false,
    newCommentText: '',
    newCommentSelection: { start: 0, end: 0 },
    newCommentFocus: false,
    stickyComment: null,
  }),
  getters: {
    newDiscussionFromCurrent({ currentDiscussionId, newDiscussionId, newDiscussion }) {
      return currentDiscussionId === newDiscussionId && newDiscussion;
    },
    currentFileDiscussionLastComments() {
      const { discussions, comments } = useContentStore().current;
      const discussionLastComments = {};
      Object.entries(comments).forEach(([, comment]) => {
        if (discussions[comment.discussionId]) {
          const lastComment = discussionLastComments[comment.discussionId];
          if (!lastComment || lastComment.created < comment.created) {
            discussionLastComments[comment.discussionId] = comment;
          }
        }
      });
      return discussionLastComments;
    },
    currentFileDiscussions() {
      const currentFileDiscussions = {};
      const newDiscussion = this.newDiscussionFromCurrent;
      if (newDiscussion) {
        currentFileDiscussions[this.newDiscussionId] = newDiscussion;
      }
      const { discussions } = useContentStore().current;
      Object.entries(this.currentFileDiscussionLastComments)
        .sort(([, lastComment1], [, lastComment2]) =>
          lastComment1.created - lastComment2.created)
        .forEach(([discussionId]) => {
          currentFileDiscussions[discussionId] = discussions[discussionId];
        });
      return currentFileDiscussions;
    },
    currentDiscussion() {
      return this.currentFileDiscussions[this.currentDiscussionId];
    },
    previousDiscussionId: idShifter(-1),
    nextDiscussionId: idShifter(1),
    currentDiscussionComments() {
      const comments = {};
      if (this.currentDiscussion) {
        const contentComments = useContentStore().current.comments;
        Object.entries(contentComments)
          .filter(([, comment]) =>
            comment.discussionId === this.currentDiscussionId)
          .sort(([, comment1], [, comment2]) =>
            comment1.created - comment2.created)
          .forEach(([commentId, comment]) => {
            comments[commentId] = comment;
          });
      }
      return comments;
    },
    currentDiscussionLastCommentId() {
      return Object.keys(this.currentDiscussionComments).pop();
    },
    currentDiscussionLastComment() {
      return this.currentDiscussionComments[this.currentDiscussionLastCommentId];
    },
  },
  actions: {
    setCurrentDiscussionId(value) {
      if (this.currentDiscussionId !== value) {
        this.currentDiscussionId = value;
        this.isCommenting = false;
      }
    },
    setNewDiscussion(value) {
      this.newDiscussion = value;
      this.newDiscussionId = utils.uid();
      this.currentDiscussionId = this.newDiscussionId;
      this.isCommenting = true;
      this.newCommentFocus = true;
    },
    patchNewDiscussion(value) {
      Object.assign(this.newDiscussion, value);
    },
    setIsCommenting(value) {
      this.isCommenting = value;
      if (!value) {
        this.newDiscussionId = null;
      } else {
        this.newCommentFocus = true;
      }
    },
    setNewCommentText(value) {
      this.newCommentText = value || '';
    },
    setNewCommentSelection(value) {
      this.newCommentSelection = value;
    },
    setNewCommentFocus(value) {
      this.newCommentFocus = value;
    },
    setStickyComment(value) {
      this.stickyComment = value;
    },
    cancelNewComment() {
      this.setIsCommenting(false);
      if (!this.currentDiscussion) {
        this.setCurrentDiscussionId(this.nextDiscussionId);
      }
    },
    async createNewDiscussion(selection) {
      const loginToken = useWorkspaceStore().loginToken;
      if (!loginToken) {
        try {
          await useModalStore().open('signInForComment');
          await googleHelper.signin();
          // dynamic import — pulling syncSvc at module load drags in
          // localDbSvc which touches localStorage at module init,
          // breaking happy-dom unit tests of unrelated services.
          const syncSvc = (await import('../services/syncSvc')).default;
          syncSvc.requestSync();
          await this.createNewDiscussion(selection);
        } catch (e) { /* cancel */ }
      } else if (selection) {
        let text = useContentStore().current.text.slice(selection.start, selection.end).trim();
        const maxLength = 80;
        if (text.length > maxLength) {
          text = `${text.slice(0, maxLength - 1).trim()}…`;
        }
        this.setNewDiscussion({ ...selection, text });
      }
    },
    cleanCurrentFile({ filterComment, filterDiscussion } = {}) {
      const { discussions } = useContentStore().current;
      const { comments } = useContentStore().current;
      const patch = {
        discussions: {},
        comments: {},
      };
      Object.entries(comments).forEach(([commentId, comment]) => {
        const discussion = discussions[comment.discussionId];
        if (discussion && comment !== filterComment && discussion !== filterDiscussion) {
          patch.discussions[comment.discussionId] = discussion;
          patch.comments[commentId] = comment;
        }
      });

      const { nextDiscussionId } = this;
      useContentStore().patchCurrent(patch);
      if (!this.currentDiscussion) {
        this.setCurrentDiscussionId(nextDiscussionId);
      }
    },
  },
});
