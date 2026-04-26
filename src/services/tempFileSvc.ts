// cledit and editorSvc are large legacy JS modules whose inferred types
// from `allowJs` only capture a partial surface. Re-cast to `any` at the
// import boundary so call sites don't get bogus errors. Tightening these
// is a follow-up that needs the cledit + editorSvc files ported too.
import cleditRaw from './editor/cledit';
import editorSvcRaw from './editorSvc';
import store from '../store';
import { useFileStore } from '../stores/file';
import utils from './utils';
import workspaceSvc from './workspaceSvc';

const cledit = cleditRaw as any;
const editorSvc = editorSvcRaw as any;

const {
  origin,
  fileName,
  contentText,
  contentProperties,
} = utils.queryParams as {
  origin?: string;
  fileName?: string;
  contentText?: string;
  contentProperties?: unknown;
};
const isLight = !!(origin && window.parent);

interface TempFileSvc {
  closed: boolean;
  setReady(): void;
  close(): void;
  init(): Promise<void>;
}

const svc: TempFileSvc = {
  closed: false,
  setReady() {
    if (isLight) {
      // Wait for the editor to init
      setTimeout(() => window.parent.postMessage({ type: 'ready' }, origin as string), 1);
    }
  },
  close() {
    if (isLight) {
      if (!this.closed) {
        window.parent.postMessage({ type: 'close' }, origin as string);
      }
      this.closed = true;
    }
  },
  async init() {
    if (!isLight) {
      return;
    }
    store.commit('setLight', true);

    const file = await workspaceSvc.createFile({
      name: fileName || utils.getHostname(origin),
      text: contentText || '\n',
      properties: contentProperties as string | undefined,
      parentId: 'temp',
    }, true);

    // Sanitize file creations
    const lastCreated: Record<string, { created: number }> = {};
    const fileItemsById: Record<string, any> = useFileStore().itemsById;
    const lastCreatedSource: Record<string, { created: number }> = store.getters['data/lastCreated'] || {};
    Object.entries(lastCreatedSource).forEach(([id, value]) => {
      if (fileItemsById[id] && fileItemsById[id].parentId === 'temp') {
        lastCreated[id] = value;
      }
    });

    // Track file creation from other site
    lastCreated[file.id] = {
      created: Date.now(),
    };

    // Keep only the last 10 temp files created by other sites
    Object.entries(lastCreated)
      .sort(([, value1], [, value2]) => value2.created - value1.created)
      .splice(10)
      .forEach(([id]) => {
        delete lastCreated[id];
        workspaceSvc.deleteFile(id);
      });

    // Store file creations and open the file
    store.dispatch('data/setLastCreated', lastCreated);
    useFileStore().setCurrentId(file.id);

    const onChange = cledit.Utils.debounce(() => {
      const currentFile = useFileStore().current;
      if (currentFile.id !== file.id) {
        // Close editor if file has changed for some reason
        svc.close();
      } else if (!svc.closed && editorSvc.previewCtx.html != null) {
        const content = store.getters['content/current'];
        const properties = utils.computeProperties(content.properties);
        window.parent.postMessage({
          type: 'fileChange',
          payload: {
            id: file.id,
            name: currentFile.name,
            content: {
              text: content.text.slice(0, -1), // Remove trailing LF
              properties,
              yamlProperties: content.properties,
              html: editorSvc.previewCtx.html,
            },
          },
        }, origin as string);
      }
    }, 25);

    // Watch preview refresh and file name changes
    editorSvc.$on('previewCtx', onChange);
    store.watch(() => useFileStore().current.name, onChange);
  },
};

export default svc;
