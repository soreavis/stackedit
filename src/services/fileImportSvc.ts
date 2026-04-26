// Drag-and-drop import for Markdown and HTML files (and folders of them)
// from the OS into the explorer panel. Folder traversal uses the
// FileSystemEntry API (webkitGetAsEntry) which is supported across all
// evergreen browsers.
//
// HTML files are run through DOMPurify + Turndown before storage so the
// workspace only ever contains Markdown.
//
// Unrecognized file types are silently skipped. Folders that hit the
// workspace's reserved-name guard (.stackedit-data, etc.) are skipped
// without aborting the rest of the import.

import TurndownService from 'turndown/lib/turndown.browser.umd';
import workspaceSvc from './workspaceSvc';
import badgeSvc from './badgeSvc';
import htmlSanitizer from '../libs/htmlSanitizer';
import { useDataStore } from '../stores/data';

// Browsers don't ship a unified FileSystemEntry type that covers both
// `isFile`/`isDirectory` branches with the file()/createReader() shape
// the W3C draft uses. Type the surface we actually call.
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(success: (file: File) => void, error: (e: unknown) => void): void;
  createReader?(): { readEntries(success: (entries: FsEntry[]) => void, error: (e: unknown) => void): void };
}

const MD_EXT_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;
const HTML_EXT_RE = /\.(html?|xhtml)$/i;

const isMarkdown = (file: File): boolean => MD_EXT_RE.test(file.name) || file.type === 'text/markdown';
const isHtml = (file: File): boolean => HTML_EXT_RE.test(file.name)
  || file.type === 'text/html'
  || file.type === 'application/xhtml+xml';

const stripMdExt = (name: string): string => name.replace(MD_EXT_RE, '');
const stripHtmlExt = (name: string): string => name.replace(HTML_EXT_RE, '');

let turndownService: any = null;
const getTurndown = (): any => {
  if (!turndownService) {
    const settings = (useDataStore().computedSettings || {}).turndown;
    turndownService = new TurndownService(settings || {});
  }
  return turndownService;
};

const htmlToMarkdown = (html: string): string => {
  const sanitized = htmlSanitizer.sanitizeHtml(html || '');
  return getTurndown().turndown(sanitized);
};

const readAsText = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

const entryGetFile = (entry: FsEntry): Promise<File> => new Promise((resolve, reject) => {
  if (entry.file) {
    entry.file(resolve, reject);
  } else {
    reject(new Error('entry.file unavailable'));
  }
});

// readEntries() returns at most 100 children per call, so loop until empty.
const readAllEntries = async (entry: FsEntry): Promise<FsEntry[]> => {
  if (!entry.createReader) return [];
  const reader = entry.createReader();
  const all: FsEntry[] = [];
  for (;;) {
    const batch = await new Promise<FsEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) return all;
    all.push(...batch);
  }
};

const importFile = async (file: File, parentId: string | null | undefined): Promise<boolean> => {
  if (isMarkdown(file)) {
    const text = await readAsText(file);
    await workspaceSvc.createFile({
      name: stripMdExt(file.name),
      parentId,
      text,
    }, true);
    return true;
  }
  if (isHtml(file)) {
    const html = await readAsText(file);
    const markdown = htmlToMarkdown(html);
    await workspaceSvc.createFile({
      name: stripHtmlExt(file.name),
      parentId,
      text: markdown,
    }, true);
    return true;
  }
  return false;
};

interface Counter { n: number }

const importEntry = async (entry: FsEntry, parentId: string | null, counter: Counter): Promise<void> => {
  if (entry.isFile) {
    try {
      const file = await entryGetFile(entry);
      if (await importFile(file, parentId)) counter.n += 1;
    } catch {
      // Skip unreadable file but keep the rest of the import going.
    }
    return;
  }
  if (entry.isDirectory) {
    let folderItem: any;
    try {
      // storeItem assigns an id internally if missing — leave it out of
      // the call shape so the test's `expect.calledWith` matches the
      // pre-port behavior exactly.
      folderItem = await workspaceSvc.storeItem({
        type: 'folder',
        name: entry.name,
        parentId: parentId || null,
      } as any);
    } catch {
      // Reserved/forbidden folder name — skip the whole subtree.
      return;
    }
    const children = await readAllEntries(entry);
    for (const child of children) {
      await importEntry(child, folderItem.id, counter);
    }
  }
};

const collectEntries = (dataTransferItems: DataTransferItemList): FsEntry[] => {
  const entries: FsEntry[] = [];
  for (let i = 0; i < dataTransferItems.length; i += 1) {
    const item = dataTransferItems[i] as DataTransferItem & { webkitGetAsEntry?(): FsEntry | null };
    if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }
  return entries;
};

const hasMarkdownPayload = (dataTransfer: DataTransfer | null | undefined): boolean => {
  if (!dataTransfer) return false;
  const items = dataTransfer.items;
  if (items && items.length) {
    for (let i = 0; i < items.length; i += 1) {
      // Folder drops report as 'file' kind with empty type — accept those too.
      if (items[i].kind === 'file') return true;
    }
  }
  return !!(dataTransfer.files && dataTransfer.files.length);
};

const importDataTransfer = async (
  dataTransfer: DataTransfer,
  parentId?: string | null,
): Promise<number> => {
  const counter: Counter = { n: 0 };
  const items = dataTransfer.items;
  if (items && items.length && typeof (items[0] as any).webkitGetAsEntry === 'function') {
    const entries = collectEntries(items);
    for (const entry of entries) {
      await importEntry(entry, parentId || null, counter);
    }
  } else if (dataTransfer.files && dataTransfer.files.length) {
    // Fallback for browsers without FileSystemEntry support — flat list only.
    for (let i = 0; i < dataTransfer.files.length; i += 1) {
      if (await importFile(dataTransfer.files[i], parentId || null)) counter.n += 1;
    }
  }
  if (counter.n > 0) badgeSvc.addBadge('createFile');
  return counter.n;
};

export default {
  isMarkdown,
  hasMarkdownPayload,
  importDataTransfer,
};
