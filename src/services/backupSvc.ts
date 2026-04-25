import workspaceSvc from './workspaceSvc';
import utils from './utils';

interface V5FolderEntry {
  type: 'folder';
  name: string;
  parentId?: string;
}

interface V5FileEntry {
  type: 'file';
  name: string;
  parentId?: string;
}

interface V5ContentEntry {
  type: 'content';
  text?: string;
  properties?: unknown;
  discussions?: unknown;
  comments?: unknown;
}

type BackupEntry = V5FolderEntry | V5FileEntry | V5ContentEntry | string | null | undefined;

export default {
  async importBackup(jsonValue: string): Promise<void> {
    const fileNameMap: Record<string, string> = {};
    const folderNameMap: Record<string, string> = {};
    const parentIdMap: Record<string, string> = {};
    const textMap: Record<string, string | undefined> = {};
    const propertiesMap: Record<string, unknown> = {};
    const discussionsMap: Record<string, unknown> = {};
    const commentsMap: Record<string, unknown> = {};
    const folderIdMap: Record<string, string> = {
      trash: 'trash',
    };

    // Parse JSON value
    const parsedValue: Record<string, BackupEntry> = JSON.parse(jsonValue);
    Object.entries(parsedValue).forEach(([id, value]) => {
      if (!value) return;
      if (typeof value === 'string') {
        // StackEdit v4 format — `file.<v4Id>.<type>` keys with raw string values
        const v4Match = id.match(/^file\.([^.]+)\.([^.]+)$/);
        if (v4Match) {
          const [, v4Id, type] = v4Match;
          if (type === 'title') {
            fileNameMap[v4Id] = value;
          } else if (type === 'content') {
            textMap[v4Id] = value;
          }
        }
        return;
      }
      if (value.type === 'folder') {
        folderIdMap[id] = utils.uid();
        folderNameMap[id] = value.name;
        parentIdMap[id] = `${value.parentId || ''}`;
      } else if (value.type === 'file') {
        fileNameMap[id] = value.name;
        parentIdMap[id] = `${value.parentId || ''}`;
      } else if (value.type === 'content') {
        const [fileId] = id.split('/');
        if (fileId) {
          textMap[fileId] = value.text;
          propertiesMap[fileId] = value.properties;
          discussionsMap[fileId] = value.discussions;
          commentsMap[fileId] = value.comments;
        }
      }
    });

    await utils.awaitSequence(
      Object.keys(folderNameMap),
      async (externalId: string) => workspaceSvc.setOrPatchItem({
        id: folderIdMap[externalId],
        type: 'folder',
        name: folderNameMap[externalId],
        parentId: folderIdMap[parentIdMap[externalId]],
      }),
    );

    await utils.awaitSequence(
      Object.keys(fileNameMap),
      async (externalId: string) => workspaceSvc.createFile({
        name: fileNameMap[externalId],
        parentId: folderIdMap[parentIdMap[externalId]],
        text: textMap[externalId],
        properties: propertiesMap[externalId] as string | undefined,
        discussions: discussionsMap[externalId] as Record<string, unknown> | undefined,
        comments: commentsMap[externalId] as Record<string, unknown> | undefined,
      }, true),
    );
  },
};
