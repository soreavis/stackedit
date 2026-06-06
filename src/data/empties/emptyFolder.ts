export interface Folder {
  id: string | null;
  type: 'folder';
  name: string;
  parentId: string | null;
  hash: number;
}

export default (id: string | null = null): Folder => ({
  id,
  type: 'folder',
  name: '',
  parentId: null,
  hash: 0,
});
