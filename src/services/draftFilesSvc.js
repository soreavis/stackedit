import store from '../store';
import workspaceSvc from './workspaceSvc';

// Tracks just-created files whose content still matches the initial
// template. When the user switches away from such a file without editing
// it, we delete it instead of leaving an empty placeholder behind.
const initialTextById = new Map();

function currentText(fileId) {
  const content = store.state.content.itemsById[`${fileId}/content`];
  return (content && content.text) || '';
}

export default {
  markAsDraft(fileId) {
    if (!fileId) return;
    initialTextById.set(fileId, currentText(fileId));
  },
  forget(fileId) {
    if (!fileId) return;
    initialTextById.delete(fileId);
  },
  isUneditedDraft(fileId) {
    if (!fileId || !initialTextById.has(fileId)) return false;
    return currentText(fileId) === initialTextById.get(fileId);
  },
  // Called on file switch / close with the id we just left.
  discardIfUnedited(fileId) {
    if (!this.isUneditedDraft(fileId)) return false;
    initialTextById.delete(fileId);
    workspaceSvc.deleteFile(fileId);
    return true;
  },
};
