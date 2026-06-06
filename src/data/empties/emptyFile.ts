export interface File {
  id: string | null;
  type: 'file';
  name: string;
  parentId: string | null;
  hash: number;
}

export default (id: string | null = null): File => ({
  id,
  type: 'file',
  name: '',
  parentId: null,
  hash: 0,
});
