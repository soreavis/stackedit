export interface ContentState {
  id: string | null;
  type: 'contentState';
  selectionStart: number;
  selectionEnd: number;
  scrollPosition: number | null;
  hash: number;
}

export default (id: string | null = null): ContentState => ({
  id,
  type: 'contentState',
  selectionStart: 0,
  selectionEnd: 0,
  scrollPosition: null,
  hash: 0,
});
