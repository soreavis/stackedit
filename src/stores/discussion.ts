import { defineStore } from 'pinia';
import utils from '../services/utils';
import googleHelper from '../services/providers/helpers/googleHelper';
import { useModalStore } from './modal';
import { useContentStore } from './content';
import { useWorkspaceStore } from './workspace';

export interface Discussion {
  start?: number;
  end?: number;
  text?: string;
  [key: string]: unknown;
}

export interface Comment {
  discussionId: string;
  created: number;
  [key: string]: unknown;
}

interface CommentSelection {
  start: number;
  end: number;
}

interface DiscussionState {
  currentDiscussionId: string | null;
  newDiscussion: Discussion | null;
  newDiscussionId: string | null;
  isCommenting: boolean;
  newCommentText: string;
  newCommentSelection: CommentSelection;
  newCommentFocus: boolean;
  stickyComment: Comment | null;
}

const idShifter = (offset: number) => function shifter(this: { currentFileDiscussions: Record<string, unknown>; newDiscussionId: string | null; currentDiscussionId: string | null }): string | undefined {
  const ids = Object.keys(this.currentFileDiscussions)
    .filter(id => id !== this.newDiscussionId);
  const idx = ids.indexOf(this.currentDiscussionId as string) + offset + ids.length;
  return ids[idx % ids.length];
};

export const useDiscussionStore = defineStore('discussion', {
  state: (): DiscussionState => ({
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
    newDiscussionFromCurrent({ currentDiscussionId, newDiscussionId, newDiscussion }): Discussion | null {
      return currentDiscussionId === newDiscussionId ? newDiscussion : null;
    },
    currentFileDiscussionLastComments(): Record<string, Comment> {
      const { discussions, comments } = useContentStore().current as { discussions: Record<string, Discussion>; comments: Record<string, Comment> };
      const discussionLastComments: Record<string, Comment> = {};
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
    currentFileDiscussions(): Record<string, Discussion> {
      const currentFileDiscussions: Record<string, Discussion> = {};
      const newDiscussion = this.newDiscussionFromCurrent;
      if (newDiscussion) {
        currentFileDiscussions[this.newDiscussionId as string] = newDiscussion;
      }
      const { discussions } = useContentStore().current as { discussions: Record<string, Discussion> };
      Object.entries(this.currentFileDiscussionLastComments)
        .sort(([, lastComment1], [, lastComment2]) =>
          (lastComment1 as Comment).created - (lastComment2 as Comment).created)
        .forEach(([discussionId]) => {
          currentFileDiscussions[discussionId] = discussions[discussionId];
        });
      return currentFileDiscussions;
    },
    currentDiscussion(): Discussion | undefined {
      return this.currentFileDiscussions[this.currentDiscussionId as string];
    },
    previousDiscussionId: idShifter(-1),
    nextDiscussionId: idShifter(1),
    currentDiscussionComments(): Record<string, Comment> {
      const comments: Record<string, Comment> = {};
      if (this.currentDiscussion) {
        const contentComments = (useContentStore().current as { comments: Record<string, Comment> }).comments;
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
    currentDiscussionLastCommentId(): string | undefined {
      return Object.keys(this.currentDiscussionComments).pop();
    },
    currentDiscussionLastComment(): Comment | undefined {
      return this.currentDiscussionComments[this.currentDiscussionLastCommentId as string];
    },
  },
  actions: {
    setCurrentDiscussionId(value: string | null | undefined): void {
      if (this.currentDiscussionId !== value) {
        this.currentDiscussionId = value ?? null;
        this.isCommenting = false;
      }
    },
    setNewDiscussion(value: Discussion): void {
      this.newDiscussion = value;
      this.newDiscussionId = utils.uid();
      this.currentDiscussionId = this.newDiscussionId;
      this.isCommenting = true;
      this.newCommentFocus = true;
    },
    patchNewDiscussion(value: Partial<Discussion>): void {
      Object.assign(this.newDiscussion as Discussion, value);
    },
    setIsCommenting(value: boolean): void {
      this.isCommenting = value;
      if (!value) {
        this.newDiscussionId = null;
      } else {
        this.newCommentFocus = true;
      }
    },
    setNewCommentText(value: string | null | undefined): void {
      this.newCommentText = value || '';
    },
    setNewCommentSelection(value: CommentSelection): void {
      this.newCommentSelection = value;
    },
    setNewCommentFocus(value: boolean): void {
      this.newCommentFocus = value;
    },
    setStickyComment(value: Comment | null): void {
      this.stickyComment = value;
    },
    cancelNewComment(): void {
      this.setIsCommenting(false);
      if (!this.currentDiscussion) {
        this.setCurrentDiscussionId(this.nextDiscussionId as string);
      }
    },
    async createNewDiscussion(selection?: { start: number; end: number }): Promise<void> {
      const loginToken = (useWorkspaceStore() as any).loginToken;
      if (!loginToken) {
        try {
          await useModalStore().open('signInForComment');
          await (googleHelper as any).signin();
          // dynamic import — pulling syncSvc at module load drags in
          // localDbSvc which touches localStorage at module init,
          // breaking happy-dom unit tests of unrelated services.
          const syncSvc = (await import('../services/syncSvc')).default;
          (syncSvc as any).requestSync();
          await this.createNewDiscussion(selection);
        } catch (e) { /* cancel */ }
      } else if (selection) {
        let text = (useContentStore().current as any).text.slice(selection.start, selection.end).trim();
        const maxLength = 80;
        if (text.length > maxLength) {
          text = `${text.slice(0, maxLength - 1).trim()}…`;
        }
        this.setNewDiscussion({ ...selection, text });
      }
    },
    cleanCurrentFile({ filterComment, filterDiscussion }: { filterComment?: Comment; filterDiscussion?: Discussion } = {}): void {
      const { discussions } = useContentStore().current as { discussions: Record<string, Discussion> };
      const { comments } = useContentStore().current as { comments: Record<string, Comment> };
      const patch = {
        discussions: {} as Record<string, Discussion>,
        comments: {} as Record<string, Comment>,
      };
      Object.entries(comments).forEach(([commentId, comment]) => {
        const discussion = discussions[comment.discussionId];
        if (discussion && comment !== filterComment && discussion !== filterDiscussion) {
          patch.discussions[comment.discussionId] = discussion;
          patch.comments[commentId] = comment;
        }
      });

      const { nextDiscussionId } = this;
      (useContentStore() as any).patchCurrent(patch);
      if (!this.currentDiscussion) {
        this.setCurrentDiscussionId(nextDiscussionId as string);
      }
    },
  },
});
