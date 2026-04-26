// HTTP / OAuth plumbing for Dropbox sync. Token + response shapes are
// dynamic across the Dropbox v2 API; method params and return values
// are typed loosely (`any`) since per-call response shape design is
// out of scope.
import { useNotificationStore } from '../../stores/notification';
import dropboxHelper from './helpers/dropboxHelper';
import Provider from './common/Provider';
import utils from '../utils';
import workspaceSvc from '../workspaceSvc';
import { useDataStore } from '../../stores/data';
import { useFileStore } from '../../stores/file';

const makePathAbsolute = (token: any, path: string): string => {
  if (!token.fullAccess) {
    return `/Applications/StackEdit (restricted)${path}`;
  }
  return path;
};
const makePathRelative = (token: any, path: string): string => {
  if (!token.fullAccess) {
    return path.replace(/^\/Applications\/StackEdit \(restricted\)/, '');
  }
  return path;
};

export default new Provider({
  id: 'dropbox',
  name: 'Dropbox',
  getToken({ sub }: any): any {
    return useDataStore().dropboxTokensBySub[sub];
  },
  getLocationUrl({ path }: any): string {
    const pathComponents = path.split('/').map(encodeURIComponent);
    const filename = pathComponents.pop();
    return `https://www.dropbox.com/home${pathComponents.join('/')}?preview=${filename}`;
  },
  getLocationDescription({ path, dropboxFileId }: any): string {
    return dropboxFileId || path;
  },
  checkPath(path: string): RegExpMatchArray | null {
    return (path && path.match(/^\/[^\\<>:"|?*]+$/)) || null;
  },
  async downloadContent(token: any, syncLocation: any): Promise<any> {
    const { content } = await (dropboxHelper as any).downloadFile({
      token,
      path: makePathRelative(token, syncLocation.path),
      fileId: syncLocation.dropboxFileId,
    });
    return Provider.parseContent(content, `${syncLocation.fileId}/content`);
  },
  async uploadContent(token: any, content: any, syncLocation: any): Promise<any> {
    const dropboxFile = await (dropboxHelper as any).uploadFile({
      token,
      path: makePathRelative(token, syncLocation.path),
      content: Provider.serializeContent(content),
      fileId: syncLocation.dropboxFileId,
    });
    return {
      ...syncLocation,
      path: makePathAbsolute(token, dropboxFile.path_display),
      dropboxFileId: dropboxFile.id,
    };
  },
  async publish(token: any, html: string, metadata: any, publishLocation: any): Promise<any> {
    const dropboxFile = await (dropboxHelper as any).uploadFile({
      token,
      path: publishLocation.path,
      content: html,
      fileId: publishLocation.dropboxFileId,
    });
    return {
      ...publishLocation,
      path: makePathAbsolute(token, dropboxFile.path_display),
      dropboxFileId: dropboxFile.id,
    };
  },
  async openFiles(token: any, paths: string[]): Promise<void> {
    const self = this as any;
    await (utils as any).awaitSequence(paths, async (path: string) => {
      // Check if the file exists and open it
      if (!Provider.openFileWithLocation({
        providerId: self.id,
        path,
      })) {
        // Download content from Dropbox
        const syncLocation = {
          path,
          providerId: self.id,
          sub: token.sub,
        };
        let content;
        try {
          content = await self.downloadContent(token, syncLocation);
        } catch (e) {
          useNotificationStore().error(`Could not open file ${path}.`);
          return;
        }

        // Create the file
        let name = path;
        const slashPos = name.lastIndexOf('/');
        if (slashPos > -1 && slashPos < name.length - 1) {
          name = name.slice(slashPos + 1);
        }
        const dotPos = name.lastIndexOf('.');
        if (dotPos > 0 && slashPos < name.length) {
          name = name.slice(0, dotPos);
        }
        const item = await (workspaceSvc as any).createFile({
          name,
          parentId: useFileStore().current.parentId,
          text: content.text,
          properties: content.properties,
          discussions: content.discussions,
          comments: content.comments,
        }, true);
        useFileStore().setCurrentId(item.id);
        (workspaceSvc as any).addSyncLocation({
          ...syncLocation,
          fileId: item.id,
        });
        useNotificationStore().info(`${useFileStore().current.name} was imported from Dropbox.`);
      }
    });
  },
  makeLocation(token: any, path: string): any {
    return {
      providerId: (this as any).id,
      sub: token.sub,
      path,
    };
  },
  async listFileRevisions({ token, syncLocation }: any): Promise<any[]> {
    const entries = await (dropboxHelper as any).listRevisions({
      token,
      path: makePathRelative(token, syncLocation.path),
      fileId: syncLocation.dropboxFileId,
    });
    return entries.map((entry: any) => ({
      id: entry.rev,
      sub: `${(dropboxHelper as any).subPrefix}:${(entry.sharing_info || {}).modified_by || token.sub}`,
      created: new Date(entry.server_modified).getTime(),
    }));
  },
  async loadFileRevision(): Promise<boolean> {
    // Revision are already loaded
    return false;
  },
  async getFileRevisionContent({
    token,
    contentId,
    revisionId,
  }: any): Promise<any> {
    const { content } = await (dropboxHelper as any).downloadFile({
      token,
      path: `rev:${revisionId}`,
    });
    return Provider.parseContent(content, contentId);
  },
});
