// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the dependencies before importing the service so the module sees fakes.
const createFile = vi.fn();
const storeItem = vi.fn();
const addBadge = vi.fn();

vi.mock('../../../src/services/workspaceSvc.js', () => ({
  default: {
    createFile: (...args) => createFile(...args),
    storeItem: (...args) => storeItem(...args),
  },
}));
vi.mock('../../../src/services/badgeSvc.js', () => ({
  default: { addBadge: (...args) => addBadge(...args) },
}));
// HTML drag-drop conversion pulls in the store + sanitizer. Stub those out
// so the import path doesn't load the full Vuex store (which touches
// localStorage during boot and can't initialize in happy-dom).
vi.mock('../../../src/store', () => ({
  default: {
    getters: { 'data/computedSettings': { turndown: {} } },
  },
}));
vi.mock('../../../src/libs/htmlSanitizer', () => ({
  default: { sanitizeHtml: html => html },
}));

const { default: fileImportSvc } = await import('../../../src/services/fileImportSvc.js');

const mkFile = (name, type = '') => new File(['# hello'], name, { type });

const mkDataTransferFiles = files => ({
  files,
  items: files.map(() => ({ kind: 'file', webkitGetAsEntry: undefined })),
});

const mkFileEntry = file => ({
  isFile: true,
  isDirectory: false,
  name: file.name,
  file: cb => cb(file),
});

const mkDirEntry = (name, children) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let served = false;
    return {
      readEntries: (cb) => {
        if (served) return cb([]);
        served = true;
        return cb(children);
      },
    };
  },
});

const mkDataTransferEntries = entries => ({
  files: entries.filter(e => e.isFile).map(e => new File([''], e.name)),
  items: entries.map(entry => ({
    kind: 'file',
    webkitGetAsEntry: () => entry,
  })),
});

beforeEach(() => {
  createFile.mockReset();
  storeItem.mockReset();
  addBadge.mockReset();
  createFile.mockResolvedValue({ id: 'new-file-id' });
  storeItem.mockImplementation(item => Promise.resolve({ id: `folder-${item.name}` }));
});

describe('fileImportSvc.isMarkdown', () => {
  it('accepts common markdown extensions', () => {
    expect(fileImportSvc.isMarkdown(mkFile('a.md'))).toBe(true);
    expect(fileImportSvc.isMarkdown(mkFile('B.MARKDOWN'))).toBe(true);
    expect(fileImportSvc.isMarkdown(mkFile('c.mdown'))).toBe(true);
  });
  it('accepts text/markdown MIME', () => {
    expect(fileImportSvc.isMarkdown(mkFile('weird', 'text/markdown'))).toBe(true);
  });
  it('rejects non-markdown', () => {
    expect(fileImportSvc.isMarkdown(mkFile('a.txt'))).toBe(false);
    expect(fileImportSvc.isMarkdown(mkFile('a.png', 'image/png'))).toBe(false);
  });
});

describe('fileImportSvc.hasMarkdownPayload', () => {
  it('detects file payload via items', () => {
    expect(fileImportSvc.hasMarkdownPayload({ items: [{ kind: 'file' }] })).toBe(true);
  });
  it('detects file payload via files fallback', () => {
    expect(fileImportSvc.hasMarkdownPayload({ files: [mkFile('a.md')] })).toBe(true);
  });
  it('rejects empty', () => {
    expect(fileImportSvc.hasMarkdownPayload({})).toBe(false);
    expect(fileImportSvc.hasMarkdownPayload({ items: [], files: [] })).toBe(false);
  });
});

describe('fileImportSvc.importDataTransfer (flat fallback)', () => {
  it('imports markdown files and skips others', async () => {
    const dt = mkDataTransferFiles([mkFile('keep.md'), mkFile('drop.txt')]);
    const n = await fileImportSvc.importDataTransfer(dt, 'parent-1');
    expect(n).toBe(1);
    expect(createFile).toHaveBeenCalledTimes(1);
    expect(createFile.mock.calls[0][0]).toMatchObject({
      name: 'keep',
      parentId: 'parent-1',
    });
    expect(addBadge).toHaveBeenCalledWith('createFile');
  });

  it('does not addBadge when nothing is imported', async () => {
    const dt = mkDataTransferFiles([mkFile('a.txt'), mkFile('b.png')]);
    const n = await fileImportSvc.importDataTransfer(dt, null);
    expect(n).toBe(0);
    expect(createFile).not.toHaveBeenCalled();
    expect(addBadge).not.toHaveBeenCalled();
  });

  it('strips .md from file name', async () => {
    const dt = mkDataTransferFiles([mkFile('notes.MD')]);
    await fileImportSvc.importDataTransfer(dt, null);
    expect(createFile.mock.calls[0][0].name).toBe('notes');
  });
});

describe('fileImportSvc.importDataTransfer (folder traversal)', () => {
  it('mirrors folder structure and imports nested .md files', async () => {
    const tree = mkDirEntry('docs', [
      mkFileEntry(mkFile('readme.md')),
      mkFileEntry(mkFile('logo.png')),
      mkDirEntry('sub', [
        mkFileEntry(mkFile('inner.markdown')),
      ]),
    ]);
    const dt = mkDataTransferEntries([tree]);
    const n = await fileImportSvc.importDataTransfer(dt, 'root-id');
    expect(n).toBe(2);

    expect(storeItem).toHaveBeenCalledWith({ type: 'folder', name: 'docs', parentId: 'root-id' });
    expect(storeItem).toHaveBeenCalledWith({ type: 'folder', name: 'sub', parentId: 'folder-docs' });
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'readme', parentId: 'folder-docs' }),
      true,
    );
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'inner', parentId: 'folder-sub' }),
      true,
    );
  });

  it('skips a subtree when storeItem rejects (forbidden folder name)', async () => {
    storeItem.mockImplementation((item) => {
      if (item.name === '.stackedit-data') return Promise.reject(new Error('forbidden'));
      return Promise.resolve({ id: `folder-${item.name}` });
    });
    const tree = mkDirEntry('.stackedit-data', [mkFileEntry(mkFile('x.md'))]);
    const dt = mkDataTransferEntries([tree]);
    const n = await fileImportSvc.importDataTransfer(dt, null);
    expect(n).toBe(0);
    expect(createFile).not.toHaveBeenCalled();
  });
});
