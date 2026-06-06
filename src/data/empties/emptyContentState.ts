// The persisted scroll position is a section-relative coordinate, not a
// raw pixel offset — `restoreScrollPosition` maps it back through the
// measured section list. Lives here (the leaf data shape) so both the
// store and the editor service can share it without a service→store
// import cycle.
export interface ScrollPosition {
  sectionIdx: number;
  posInSection: number;
}

export interface ContentState {
  id: string | null;
  type: 'contentState';
  selectionStart: number;
  selectionEnd: number;
  scrollPosition: ScrollPosition | null;
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
