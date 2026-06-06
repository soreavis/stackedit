<template>
  <div class="history side-bar__panel side-bar__panel--menu">
    <div class="side-bar__info">
      <p v-if="syncLocations.length > 1">
        <select class="textfield" v-model="syncLocationId" @keydown.enter="(this as any).resolve?.()">
          <option v-for="location in syncLocations" :key="location.id" :value="location.id">
            {{ location.description }}
          </option>
        </select>
      </p>
      <p v-if="!historyContext">Synchronize <b>{{ currentFileName }}</b> to enable revision history or <a href="javascript:void(0)" @click="signin">sign in with Google</a> to synchronize your main workspace.</p>
      <p v-else-if="loading">Loading history…</p>
      <p v-else-if="!revisionsWithSpacer.length"><b>{{ currentFileName }}</b> has no history.</p>
      <div class="menu-entry menu-entry--info flex flex--row flex--align-center" v-else>
        <div class="menu-entry__icon menu-entry__icon--image">
          <icon-provider :provider-id="syncLocation.providerId"></icon-provider>
        </div>
        <span v-if="syncLocation.url">
          The following revisions are stored in <a :href="syncLocation.url" target="_blank" rel="noopener noreferrer">{{ syncLocationProviderName }}</a>.
        </span>
        <span v-else>
          The following revisions are stored in {{ syncLocationProviderName }}.
        </span>
      </div>
    </div>
    <div>
      <div class="revision" v-for="revision in revisionsWithSpacer" :key="revision.id">
        <div class="history__spacer" v-if="revision.spacer"></div>
        <a class="revision__button button flex flex--row" href="javascript:void(0)" @click="open(revision)">
          <div class="revision__icon">
            <user-image :user-id="revision.sub"></user-image>
          </div>
          <div class="revision__header flex flex--column">
            <user-name :user-id="revision.sub"></user-name>
            <div class="revision__created">{{ formatTime(revision.created) }}</div>
          </div>
        </a>
      </div>
    </div>
    <div class="history__spacer history__spacer--last" v-if="revisions.length"></div>
    <div class="flex flex--row flex--end" v-if="showMoreButton">
      <button class="history__button button" @click="showMore">More</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapState as mapPiniaState, mapActions as mapPiniaActions } from 'pinia';
import { formatTime } from '../common/vueGlobals';
import providerRegistry from '../../services/providers/common/providerRegistry';
import UserImage from '../UserImage.vue';
import UserName from '../UserName.vue';
import EditorClassApplier from '../common/EditorClassApplier';
import PreviewClassApplier from '../common/PreviewClassApplier';
import utils from '../../services/utils';
import googleHelper from '../../services/providers/helpers/googleHelper';
import syncSvc from '../../services/syncSvc';
import { useSyncLocationStore } from '../../stores/syncLocation';
import { useContentStore } from '../../stores/content';
import { useFileStore } from '../../stores/file';
import { useNotificationStore } from '../../stores/notification';
import { useQueueStore } from '../../stores/queue';
import badgeSvc from '../../services/badgeSvc';
import { useDataStore } from '../../stores/data';

// The syncLocation store getter (currentWithWorkspaceSyncLocation) is loosely
// typed as unknown[]; describe the shape this component actually consumes.
interface SyncLocationShape {
  id: string;
  providerId: string;
  url?: string;
  description?: string;
}

let editorClassAppliers: any[] = [];
let previewClassAppliers: any[] = [];

let cachedHistoryContextHash: any;
let revisionsPromise: any;
let revisionContentPromises: any;
const pageSize = 30;
const spacerThreshold = 6 * 60 * 60 * 1000; // 6h

export default defineComponent({
  components: {
    UserImage,
    UserName,
  },
  data: () => ({
    allRevisions: [] as any[],
    loading: false,
    showCount: pageSize,
    syncLocationId: null as string | null,
    onKeyup: null as ((evt: KeyboardEvent) => void) | null,
    destroyed: false,
  }),
  computed: {
    ...mapPiniaState(useDataStore, [
      'syncDataByItemId',
    ]),
    ...mapPiniaState(useContentStore, [
      'revisionContent',
    ]),
    // currentWithWorkspaceSyncLocation is typed unknown[] by the loose
    // location store; narrow it to the shape this component reads.
    syncLocations(): SyncLocationShape[] {
      return (useSyncLocationStore() as any)
        .currentWithWorkspaceSyncLocation as SyncLocationShape[];
    },
    // someResult may return undefined, but this menu only renders revision
    // UI once a sync location is selected; the consumers guard truthiness at
    // runtime, so expose the resolved shape (loose boundary cast).
    syncLocation(): SyncLocationShape {
      return utils.someResult(this.syncLocations, (syncLocation) => {
        if (syncLocation.id === this.syncLocationId) {
          return syncLocation;
        }
        return null;
      }) as SyncLocationShape;
    },
    syncLocationProviderName(): string | null {
      if (!this.syncLocation) {
        return null;
      }
      return providerRegistry.providersById[this.syncLocation.providerId].name as string;
    },
    currentFileName() {
      return useFileStore().current.name;
    },
    historyContext() {
      const { syncLocation } = this;
      if (syncLocation) {
        const provider = providerRegistry.providersById[syncLocation.providerId] as any;
        const token = provider.getToken(syncLocation);
        const fileId = useFileStore().current.id;
        const contentId = `${fileId}/content`;
        const historyContext = {
          token,
          fileId,
          contentId,
          syncLocation: this.syncLocation,
        };
        if (syncLocation.id !== 'main') {
          return historyContext;
        }

        // Add syncData for workspace sync location
        const { syncDataByItemId } = this;
        const fileSyncData = syncDataByItemId[fileId];
        const contentSyncData = syncDataByItemId[contentId];
        if (fileSyncData && contentSyncData) {
          return {
            ...historyContext,
            fileSyncDataId: fileSyncData.id,
            contentSyncDataId: contentSyncData.id,
          };
        }
      }
      return null;
    },
    historyContextHash() {
      return utils.serializeObject(this.historyContext);
    },
    revisions() {
      return this.allRevisions.slice()
        .sort((revision1, revision2) => revision2.created - revision1.created)
        .slice(0, this.showCount);
    },
    revisionsWithSpacer() {
      let previousCreated = 0;
      return this.revisions.map((revision) => {
        const revisionWithSpacer = {
          ...revision,
          spacer: revision.created + spacerThreshold < previousCreated,
        };
        previousCreated = revision.created;
        return revisionWithSpacer;
      });
    },
    showMoreButton() {
      return this.showCount < this.allRevisions.length;
    },
  },
  methods: {
    formatTime,
    ...mapPiniaActions(useContentStore, {
      setRevisionContent: 'setRevisionContentRaw',
    }),
    async signin() {
      try {
        await googleHelper.signin();
        syncSvc.requestSync();
      } catch (e) {
        // Cancel
      }
    },
    close() {
      useDataStore().setSideBarPanel('menu');
    },
    showMore() {
      this.showCount += pageSize;
    },
    open(revision: any) {
      let revisionContentPromise = revisionContentPromises[revision.id];
      if (!revisionContentPromise) {
        const historyContext = utils.deepCopy(this.historyContext);
        if (historyContext) {
          const provider = providerRegistry
            .providersById[this.syncLocation.providerId] as any;
          revisionContentPromise = new Promise((resolve, reject) => useQueueStore().enqueue(
            () => provider.getFileRevisionContent({
              ...historyContext,
              revisionId: revision.id,
            })
              .then(resolve, reject),
          ));
          revisionContentPromises[revision.id] = revisionContentPromise;
          revisionContentPromise.catch((err: any) => {
            useNotificationStore().error(err);
            revisionContentPromises[revision.id] = null;
          });
        }
      }
      if (revisionContentPromise) {
        revisionContentPromise.then((revisionContent: any) =>
          useContentStore().setRevisionContent(revisionContent));
      }
    },
    refreshHighlighters() {
      const revisionContent = this.revisionContent as any;
      editorClassAppliers.forEach(editorClassApplier => editorClassApplier.stop());
      editorClassAppliers = [];
      previewClassAppliers.forEach(previewClassApplier => previewClassApplier.stop());
      previewClassAppliers = [];
      if (revisionContent) {
        let offset = 0;
        revisionContent.diffs.forEach(([type, text]: [number, string]) => {
          if (type) {
            const classes = ['revision-diff', `revision-diff--${type > 0 ? 'insert' : 'delete'}`];
            const offsets = {
              start: offset,
              end: offset + text.length,
            };
            editorClassAppliers.push(new EditorClassApplier(
              [`revision-diff--${utils.uid()}`, ...classes],
              offsets,
            ));
            previewClassAppliers.push(new PreviewClassApplier(
              [`revision-diff--${utils.uid()}`, ...classes],
              offsets,
            ));
          }
          offset += text.length;
        });
      }
    },
  },
  watch: {
    // Fix syncLocationId
    syncLocation: {
      immediate: true,
      handler(value: any) {
        const firstSyncLocation = this.syncLocations[0];
        if (firstSyncLocation) {
          if (!value) {
            this.syncLocationId = firstSyncLocation.id;
          } else if (value.id !== firstSyncLocation.id) {
            badgeSvc.addBadge('chooseHistory');
          }
        }
      },
    },
    // Load revision list on context changes
    historyContextHash: {
      immediate: true,
      handler() {
        this.allRevisions = [];
        const historyContext = utils.deepCopy(this.historyContext);
        if (historyContext) {
          if (this.historyContextHash !== cachedHistoryContextHash) {
            this.setRevisionContent(null);
            cachedHistoryContextHash = this.historyContextHash;
            revisionContentPromises = {};
            const provider = providerRegistry
              .providersById[this.syncLocation.providerId] as any;
            revisionsPromise = new Promise((resolve, reject) => useQueueStore().enqueue(
              () => provider
                .listFileRevisions(historyContext)
                .then(resolve, reject),
            ))
              .catch((err: any) => {
                useNotificationStore().error(err);
                cachedHistoryContextHash = null;
                return [];
              });
          }
          if (revisionsPromise) {
            this.loading = true;
            revisionsPromise.then((revisions: any[]) => {
              this.loading = false;
              this.allRevisions = revisions;
            });
          }
        }
      },
    },
    // Load each revision on revision list changes
    revisions(revisions: any[]) {
      const { historyContext } = this;
      if (historyContext) {
        useQueueStore().enqueue(
          () => utils.awaitSequence(revisions, async (revision: any) => {
            // Make sure revisions and historyContext haven't changed
            if (!this.destroyed
              && this.revisions === revisions
              && this.historyContext === historyContext
            ) {
              const provider = providerRegistry
                .providersById[this.syncLocation.providerId] as any;
              await provider.loadFileRevision({
                ...historyContext,
                revision,
              });
            }
          }),
        );
      }
    },
    // Refresh highlighters on open/close revision
    revisionContent: {
      immediate: true,
      handler() {
        this.refreshHighlighters();
      },
    },
  },
  created() {
    // Close revision on escape
    const onKeyup = (evt: KeyboardEvent) => {
      if (evt.which === 27) {
        // Esc key
        this.setRevisionContent(null);
      }
    };
    this.onKeyup = onKeyup;
    window.addEventListener('keyup', onKeyup);
  },
  unmounted() {
    // Close revision
    this.setRevisionContent(null);
    // Remove highlighters
    this.refreshHighlighters();
    // Remove event listener
    if (this.onKeyup) {
      window.removeEventListener('keyup', this.onKeyup);
    }
    // Cancel loading revisions
    this.destroyed = true;
  },
});
</script>

<style lang="scss">
@use 'sass:color';
@use '../../styles/variables.scss' as *;

.history__button {
  font-size: 14px;
  margin-top: 0.5em;
}

.history__spacer {
  position: relative;
  height: 40px;

  &::before {
    content: '';
    position: absolute;
    height: 100%;
    top: 0;
    left: 19px;
    border-left: 2px dotted $hr-color;
  }
}

.history__spacer--last {
  height: 20px;
}

.revision__button {
  text-align: left;
  padding: 10px;
  height: auto;
  text-transform: none;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    height: 100%;
    top: 0;
    left: 19px;
    border-left: 2px solid $hr-color;
  }

  &:active,
  &:focus,
  &:hover {
    &::before {
      display: none;
    }
  }

  .revision:first-child &::before {
    height: 67%;
    top: 33%;
  }
}

.revision__icon {
  height: 20px;
  width: 20px;
  margin-right: 12px;
  flex: none;
  border-radius: $border-radius-base;
  overflow: hidden;
  position: relative;
}

.revision__header {
  font-size: 15px;
  width: 100%;
  line-height: 1.33;
}

.revision__created {
  font-size: 0.75em;
  opacity: 0.6;
}

.layout--revision {
  .cledit-section *,
  .cl-preview-section * {
    color: color.adjust($editor-color-light, $alpha: -0.5) !important;

    .app--dark & {
      color: color.adjust($editor-color-dark, $alpha: -0.5) !important;
    }
  }

  .cledit-section .revision-diff {
    color: $editor-color-light !important;

    .app--dark & {
      color: $editor-color-dark !important;
    }
  }

  .cl-preview-section .revision-diff {
    color: $body-color-light !important;

    .app--dark & {
      color: $body-color-dark !important;
    }
  }

  .revision-diff {
    padding: 0.25em 0;

    &.revision-diff--insert {
      background-color: color.mix(#fff, $selection-highlighting-color, 60%);
    }

    &.revision-diff--delete {
      background-color: color.mix(#fff, $error-color, 60%);
      text-decoration: line-through;
    }
  }
}
</style>
