// Optional editor service — task-change handler. Wires click on a
// rendered `[ ]` / `[x]` GFM task list checkbox in the preview to
// toggle the underlying markdown source. Loose typing on `editorSvc`
// (still mostly untyped Vue mixin) handled with `as any` at the
// import boundary.
import editorSvcRaw from '../editorSvc';
import { useContentStore } from '../../stores/content';

const editorSvc = editorSvcRaw as any;

editorSvc.$on('inited', () => {
  const getPreviewOffset = (elt: Node | null): number => {
    let offset = 0;
    if (!elt || elt === editorSvc.previewElt) {
      return offset;
    }
    let { previousSibling } = elt;
    while (previousSibling) {
      offset += previousSibling.textContent?.length ?? 0;
      ({ previousSibling } = previousSibling);
    }
    return offset + getPreviewOffset(elt.parentNode);
  };

  editorSvc.previewElt.addEventListener('click', (evt: MouseEvent) => {
    const target = evt.target as HTMLInputElement | null;
    if (!target) return;
    if (target.classList.contains('task-list-item-checkbox')) {
      evt.preventDefault();
      if (useContentStore().isCurrentEditable) {
        const editorContent: string = editorSvc.clEditor.getContent();
        // Use setTimeout to ensure target.checked has the old value
        setTimeout(() => {
          // Make sure content has not changed
          if (editorContent === editorSvc.clEditor.getContent()) {
            const previewOffset = getPreviewOffset(target);
            const endOffset = editorSvc.getEditorOffset(previewOffset + 1);
            if (endOffset != null) {
              const startOffset = editorContent.lastIndexOf('\n', endOffset) + 1;
              const line = editorContent.slice(startOffset, endOffset);
              const match = line.match(/^([ \t]*(?:[*+-]|\d+\.)[ \t]+\[)[ xX](\] .*)/);
              if (match) {
                let newContent = editorContent.slice(0, startOffset);
                newContent += match[1];
                newContent += target.checked ? ' ' : 'x';
                newContent += match[2];
                newContent += editorContent.slice(endOffset);
                editorSvc.clEditor.setContent(newContent, true);
              }
            }
          }
        }, 10);
      }
    }
  });
});
