import moduleTemplate from './moduleTemplate';
import empty from '../data/empties/emptyFile';

const module = moduleTemplate(empty);

module.state = {
  ...module.state,
  currentId: null,
};

module.getters = {
  ...module.getters,
  current: ({ itemsById, currentId }) => itemsById[currentId] || empty(),
  isCurrentTemp: (state, { current }) => current.parentId === 'temp',
  lastOpened: ({ itemsById }, { items }, rootState, rootGetters) => {
    // Pick the most recent file that's (a) not in Trash and (b) reachable
    // without auto-expanding a currently-collapsed folder. This is the
    // fallback localDbSvc uses when currentId goes null; picking a file
    // behind a closed folder would cause the explorer watcher to pop it
    // open, which is disorienting right after a delete.
    const openNodes = rootState.explorer ? rootState.explorer.openNodes : {};
    const foldersById = rootState.folder ? rootState.folder.itemsById : {};
    const isHidden = (file) => {
      let pid = file.parentId;
      while (pid && pid !== 'trash' && pid !== 'temp') {
        if (!openNodes[pid]) return true;
        const folder = foldersById[pid];
        if (!folder) return false;
        pid = folder.parentId;
      }
      return false;
    };
    const isUnderTrash = (file) => {
      let pid = file.parentId;
      while (pid) {
        if (pid === 'trash') return true;
        const folder = foldersById[pid];
        if (!folder) return false;
        pid = folder.parentId;
      }
      return false;
    };
    const acceptable = f => f && !isUnderTrash(f) && !isHidden(f);
    const ids = rootGetters['data/lastOpenedIds'];
    for (let i = 0; i < ids.length; i += 1) {
      const f = itemsById[ids[i]];
      if (acceptable(f)) return f;
    }
    return items.find(acceptable) || empty();
  },
};

module.mutations = {
  ...module.mutations,
  setCurrentId(state, value) {
    state.currentId = value;
  },
};

module.actions = {
  ...module.actions,
  patchCurrent({ getters, commit }, value) {
    commit('patchItem', {
      ...value,
      id: getters.current.id,
    });
  },
};

export default module;
