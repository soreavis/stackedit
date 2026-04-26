import localDbSvc from './localDbSvc';
import { usePublishLocationStore } from '../stores/publishLocation';
import { useFileStore } from '../stores/file';
import { setItemByType, patchItemByType, deleteItemByType } from '../stores/itemBridge';
import { useNotificationStore } from '../stores/notification';
import utils from './utils';
import networkSvc from './networkSvc';
import exportSvc from './exportSvc';
import providerRegistry from './providers/common/providerRegistry';
import workspaceSvc from './workspaceSvc';
import badgeSvc from './badgeSvc';
import { useQueueStore } from '../stores/queue';
import { useDataStore } from '../stores/data';
import { useGlobalStore } from '../stores/global';

interface PublishLocation {
  fileId?: string;
  templateId: string;
  providerId: string;
  [key: string]: unknown;
}

const hasCurrentFilePublishLocations = (): boolean =>
  !!((usePublishLocationStore() as any).current as unknown[]).length;

const loader = (type: string) => (fileId: string) => (localDbSvc as any).loadItem(`${fileId}/${type}`)
  // Item does not exist, create it
  .catch(() => setItemByType(type, {
    id: `${fileId}/${type}`,
  }));
const loadContent = loader('content');

const ensureArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    return `${value}`.trim().split(/\s*,\s*/);
  }
  return value as string[];
};

const ensureString = (value: unknown, defaultValue?: string): string | undefined => {
  if (!value) {
    return defaultValue;
  }
  return `${value}`;
};

const ensureDate = (value: unknown, defaultValue: Date): Date => {
  if (!value) {
    return defaultValue;
  }
  return new Date(`${value}`);
};

const publish = async (publishLocation: PublishLocation): Promise<PublishLocation> => {
  const { fileId } = publishLocation;
  const template = (useDataStore().allTemplatesById as Record<string, any>)[publishLocation.templateId];
  const html = await exportSvc.applyTemplate(fileId as string, template);
  const content = await (localDbSvc as any).loadItem(`${fileId}/content`);
  const file = (useFileStore().itemsById as Record<string, any>)[fileId as string];
  // utils.computeProperties is JS, inferred narrowly. Cast to `any` so the
  // free-form metadata fields (title, author, tags, etc.) read through.
  const properties: any = utils.computeProperties(content.properties);
  const provider = (providerRegistry as any).providersById[publishLocation.providerId];
  const token = provider.getToken(publishLocation);
  const metadata = {
    title: ensureString(properties.title, file.name),
    author: ensureString(properties.author),
    tags: ensureArray(properties.tags),
    categories: ensureArray(properties.categories),
    excerpt: ensureString(properties.excerpt),
    featuredImage: ensureString(properties.featuredImage),
    status: ensureString(properties.status),
    date: ensureDate(properties.date, new Date()),
  };
  return provider.publish(token, html, metadata, publishLocation);
};

const publishFile = async (fileId: string): Promise<void> => {
  let counter = 0;
  await loadContent(fileId);
  const publishLocations: PublishLocation[] = [
    ...((usePublishLocationStore() as any).filteredGroupedByFileId[fileId] as PublishLocation[]) || [],
  ];
  try {
    await utils.awaitSequence(publishLocations, async (publishLocation: PublishLocation) => {
      await useQueueStore().doWithLocation({
        location: publishLocation,
        action: async () => {
          const publishLocationToStore = await publish(publishLocation);
          try {
            // Replace publish location if modified
            if (utils.serializeObject(publishLocation) !==
              utils.serializeObject(publishLocationToStore)
            ) {
              usePublishLocationStore().patchItem(publishLocationToStore as PublishLocation & { id: string });
              (workspaceSvc as any).ensureUniqueLocations();
            }
            counter += 1;
          } catch (err) {
            if (useGlobalStore().offline) {
              throw err;
            }
            console.error(err);
            useNotificationStore().error(err);
          }
        },
      });
    });
    const file = (useFileStore().itemsById as Record<string, any>)[fileId];
    useNotificationStore().info(`"${file.name}" was published to ${counter} location(s).`);
  } finally {
    await (localDbSvc as any).unloadContents();
  }
};

const requestPublish = (): void => {
  // No publish in light mode
  if (useGlobalStore().light) {
    return;
  }

  useQueueStore().enqueuePublishRequest(async () => {
    let intervalId: ReturnType<typeof setInterval>;
    const attempt = async () => {
      // Only start publishing when these conditions are met
      if ((networkSvc as any).isUserActive()) {
        clearInterval(intervalId);
        if (!hasCurrentFilePublishLocations()) {
          // Cancel publish
          throw new Error('Publish not possible.');
        }
        await publishFile(useFileStore().current.id);
        badgeSvc.addBadge('triggerPublish');
      }
    };
    intervalId = utils.setInterval(() => attempt(), 1000);
    return attempt();
  });
};

const createPublishLocation = (publishLocation: PublishLocation, featureId?: string): void => {
  const currentFile = useFileStore().current;
  publishLocation.fileId = currentFile.id;
  useQueueStore().enqueue(
    async () => {
      const publishLocationToStore = await publish(publishLocation);
      (workspaceSvc as any).addPublishLocation(publishLocationToStore);
      useNotificationStore().info(`A new publication location was added to "${currentFile.name}".`);
      if (featureId) {
        badgeSvc.addBadge(featureId);
      }
    },
  );
};

export default {
  requestPublish,
  createPublishLocation,
};
