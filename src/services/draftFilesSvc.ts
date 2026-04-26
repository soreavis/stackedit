import store from '../store';
import { useContentStore } from '../stores/content';
import workspaceSvc from './workspaceSvc';

// Tracks just-created files whose content still matches the initial
// template. When the user switches away from such a file without editing
// it, we delete it instead of leaving an empty placeholder behind.
const initialTextById = new Map<string, string>();

function currentText(fileId: string): string {
  const itemsById = useContentStore().itemsById as Record<string, { text?: string }>;
  const content = itemsById[`${fileId}/content`];
  return (content && content.text) || '';
}

export default {
  markAsDraft(fileId: string | null | undefined): void {
    if (!fileId) return;
    initialTextById.set(fileId, currentText(fileId));
  },
  forget(fileId: string | null | undefined): void {
    if (!fileId) return;
    initialTextById.delete(fileId);
  },
  isUneditedDraft(fileId: string | null | undefined): boolean {
    if (!fileId || !initialTextById.has(fileId)) return false;
    return currentText(fileId) === initialTextById.get(fileId);
  },
  // Called on file switch / close with the id we just left.
  discardIfUnedited(fileId: string | null | undefined): boolean {
    if (!this.isUneditedDraft(fileId)) return false;
    initialTextById.delete(fileId as string);
    workspaceSvc.deleteFile(fileId);
    return true;
  },
};
