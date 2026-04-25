import cledit from './cleditCore';

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

let idCounter = 0;

// A Marker tracks a content offset across edits. The cledit content-change
// pipeline feeds in diff-match-patch diffs and the marker shifts so it
// keeps pointing at the same logical position.
class Marker {
  id: number;
  offset: number;
  trailing: boolean;

  constructor(offset: number, trailing = false) {
    this.id = idCounter;
    idCounter += 1;
    this.offset = offset;
    this.trailing = trailing;
  }

  adjustOffset(diffs: Array<[number, string]>): void {
    let startOffset = 0;
    diffs.forEach((diff: [number, string]) => {
      const diffType = diff[0];
      const diffText = diff[1];
      const diffOffset = diffText.length;
      switch (diffType) {
        case DIFF_EQUAL:
          startOffset += diffOffset;
          break;
        case DIFF_INSERT:
          if (
            this.trailing
              ? this.offset > startOffset
              : this.offset >= startOffset
          ) {
            this.offset += diffOffset;
          }
          startOffset += diffOffset;
          break;
        case DIFF_DELETE:
          if (this.offset > startOffset) {
            this.offset -= Math.min(diffOffset, this.offset - startOffset);
          }
          break;
        default:
      }
    });
  }
}

(cledit as any).Marker = Marker;
