import providerRegistry from './providerRegistry';
import emptyContent from '../../../data/empties/emptyContent';
import utils from '../../utils';
import { useSyncLocationStore } from '../../../stores/syncLocation';
import { useContentStore } from '../../../stores/content';
import { useFileStore } from '../../../stores/file';
import workspaceSvc from '../../workspaceSvc';

interface SerializedContent {
  text: string;
  properties?: string;
  discussions?: Record<string, unknown>;
  comments?: Record<string, unknown>;
  history?: unknown[];
}

interface ParsedContent {
  id?: string;
  text: string;
  properties: string;
  discussions: Record<string, unknown>;
  comments: Record<string, unknown>;
  history: unknown[];
  hash: number;
  [key: string]: unknown;
}

const dataExtractor = /<!--stackedit_data:([A-Za-z0-9+/=\s]+)-->\s*$/;

export default class Provider {
  prepareChanges = (changes: unknown[]): unknown[] => changes;

  onChangesApplied = (): void => {};

  id?: string;

  constructor(props: Record<string, unknown>) {
    Object.assign(this, props);
    providerRegistry.register(this as unknown as { id: string });
  }

  /**
   * Serialize content in a self contain Markdown compatible format
   */
  static serializeContent(content: SerializedContent & { history?: unknown[] }): string {
    let result = content.text;
    const data: Record<string, unknown> = {};
    if (content.properties && content.properties.length > 1) {
      data.properties = content.properties;
    }
    if (content.discussions && Object.keys(content.discussions).length) {
      data.discussions = content.discussions;
    }
    if (content.comments && Object.keys(content.comments).length) {
      data.comments = content.comments;
    }
    if (content.history && content.history.length) {
      data.history = content.history;
    }
    if (Object.keys(data).length) {
      const serializedData = (utils as any).encodeBase64(JSON.stringify(data)).replace(/(.{50})/g, '$1\n');
      result += `<!--stackedit_data:\n${serializedData}\n-->`;
    }
    return result;
  }

  /**
   * Parse content serialized with serializeContent()
   */
  static parseContent(serializedContent: string, id: string): ParsedContent {
    let text = serializedContent;
    const extractedData = dataExtractor.exec(serializedContent);
    let result: ParsedContent;
    if (!extractedData) {
      // In case stackedit's data has been manually removed, try to restore them
      result = ((utils as any).deepCopy(useContentStore().itemsById[id]) || (emptyContent as unknown as (id: string) => ParsedContent)(id)) as ParsedContent;
    } else {
      result = (emptyContent as unknown as (id: string) => ParsedContent)(id) as unknown as ParsedContent;
      try {
        const serializedData = extractedData[1].replace(/\s/g, '');
        const parsedData = JSON.parse((utils as any).decodeBase64(serializedData));
        text = text.slice(0, extractedData.index);
        if (parsedData.properties) {
          result.properties = (utils as any).sanitizeText(parsedData.properties);
        }
        if (parsedData.discussions) {
          result.discussions = parsedData.discussions;
        }
        if (parsedData.comments) {
          result.comments = parsedData.comments;
        }
        result.history = parsedData.history;
      } catch (e) {
        // Ignore
      }
    }
    result.text = (utils as any).sanitizeText(text);
    if (!result.history) {
      result.history = [];
    }
    return (utils as any).addItemHash(result) as ParsedContent;
  }

  /**
   * Find and open a file with location that meets the criteria
   */
  static openFileWithLocation(criteria: Record<string, unknown>): boolean {
    const location = (utils as any).search(useSyncLocationStore().items, criteria) as { fileId?: string } | undefined;
    if (location && location.fileId) {
      // Found one, open it if it exists
      const item = useFileStore().itemsById[location.fileId];
      if (item) {
        useFileStore().setCurrentId(item.id);
        // If file is in the trash, restore it
        if (item.parentId === 'trash') {
          (workspaceSvc as { setOrPatchItem: (item: { id: string; parentId: string | null; [k: string]: unknown }) => unknown })
            .setOrPatchItem({
              ...item,
              parentId: null,
            });
        }
        return true;
      }
    }
    return false;
  }
}
