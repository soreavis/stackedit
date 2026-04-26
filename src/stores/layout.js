import { defineStore } from 'pinia';
import pagedownButtons from '../data/pagedownButtons';
import { useFileStore } from './file';
import { useContentStore } from './content';
import { useSyncLocationStore } from './syncLocation';
import { usePublishLocationStore } from './publishLocation';
import { useDataStore } from './data';
import vuexStore from '../store';

let buttonCount = 2;
let spacerCount = 0;
pagedownButtons.forEach((button) => {
  if (button.method) {
    buttonCount += 1;
  } else {
    spacerCount += 1;
  }
});

const minPadding = 25;
const editorTopPadding = 10;
const navigationBarEditButtonsWidth = (34 * buttonCount) + (8 * spacerCount);
const navigationBarLeftButtonWidth = 38 + 4 + 12;
const navigationBarRightButtonWidth = 38 + 8;
const navigationBarSpinnerWidth = 24 + 8 + 5;
const navigationBarLocationWidth = 20;
const navigationBarSyncPublishButtonsWidth = 34 + 10;
const navigationBarTitleMargin = 8;
const maxTitleMaxWidth = 800;
const minTitleMaxWidth = 200;

const layoutConstants = {
  editorMinWidth: 320,
  explorerWidth: 320,
  gutterWidth: 250,
  sideBarWidth: 280,
  sideBarTocWidth: 392,
  navigationBarHeight: 44,
  buttonBarWidth: 26,
  statusBarHeight: 20,
};

function computeStyles(state, layoutSettings, styles) {
  if (!styles) {
    styles = {
      showNavigationBar: layoutSettings.showNavigationBar
        || !layoutSettings.showEditor
        || useContentStore().revisionContent
        || vuexStore.state.light,
      showStatusBar: layoutSettings.showStatusBar,
      showEditor: layoutSettings.showEditor,
      showSidePreview: layoutSettings.showSidePreview && layoutSettings.showEditor,
      showPreview: layoutSettings.showSidePreview || !layoutSettings.showEditor,
      showSideBar: layoutSettings.showSideBar && !vuexStore.state.light,
      showExplorer: layoutSettings.showExplorer && !vuexStore.state.light,
      layoutOverflow: false,
      hideLocations: vuexStore.state.light,
    };
  }
  styles.innerHeight = state.bodyHeight;
  if (styles.showNavigationBar) styles.innerHeight -= layoutConstants.navigationBarHeight;
  if (styles.showStatusBar) styles.innerHeight -= layoutConstants.statusBarHeight;

  styles.innerWidth = state.bodyWidth;
  if (styles.innerWidth < layoutConstants.editorMinWidth
    + layoutConstants.gutterWidth + layoutConstants.buttonBarWidth) {
    styles.layoutOverflow = true;
  }
  styles.sideBarWidth = layoutSettings.sideBarPanel === 'toc'
    ? layoutConstants.sideBarTocWidth
    : layoutConstants.sideBarWidth;
  if (styles.showSideBar) styles.innerWidth -= styles.sideBarWidth;
  if (styles.showExplorer) styles.innerWidth -= layoutConstants.explorerWidth;

  let doublePanelWidth = styles.innerWidth - layoutConstants.buttonBarWidth;
  // discussion module still in Vuex during the transition.
  const showGutter = !useFileStore().isCurrentTemp
    && !!vuexStore.getters['discussion/currentDiscussion'];

  if (showGutter) doublePanelWidth -= layoutConstants.gutterWidth;
  if (doublePanelWidth < layoutConstants.editorMinWidth) {
    doublePanelWidth = layoutConstants.editorMinWidth;
  }

  if (styles.showSidePreview && doublePanelWidth / 2 < layoutConstants.editorMinWidth) {
    styles.showSidePreview = false;
    styles.showPreview = false;
    styles.layoutOverflow = false;
    return computeStyles(state, layoutSettings, styles);
  }

  const computedSettings = useDataStore().computedSettings;
  styles.fontSize = 18;
  styles.textWidth = 990;
  if (doublePanelWidth < 1120) {
    styles.fontSize -= 1;
    styles.textWidth = 910;
  }
  if (doublePanelWidth < 1040) {
    styles.textWidth = 830;
  }
  styles.textWidth *= computedSettings.maxWidthFactor;
  if (doublePanelWidth < styles.textWidth) {
    styles.textWidth = doublePanelWidth;
  }
  if (styles.textWidth < 640) styles.fontSize -= 1;
  styles.fontSize *= computedSettings.fontSizeFactor;

  const bottomPadding = Math.floor(styles.innerHeight / 2);
  const panelWidth = Math.floor(doublePanelWidth / 2);
  styles.previewWidth = styles.showSidePreview ? panelWidth : doublePanelWidth;
  const previewRightPadding = Math
    .max(Math.floor((styles.previewWidth - styles.textWidth) / 2), minPadding);
  if (!styles.showSidePreview) styles.previewWidth += layoutConstants.buttonBarWidth;
  styles.previewGutterWidth = showGutter && !layoutSettings.showEditor
    ? layoutConstants.gutterWidth : 0;
  const previewLeftPadding = previewRightPadding + styles.previewGutterWidth;
  styles.previewGutterLeft = previewLeftPadding - minPadding;
  styles.previewPadding = `${editorTopPadding}px ${previewRightPadding}px ${bottomPadding}px ${previewLeftPadding}px`;
  styles.editorWidth = styles.showSidePreview ? panelWidth : doublePanelWidth;
  const editorRightPadding = Math
    .max(Math.floor((styles.editorWidth - styles.textWidth) / 2), minPadding);
  styles.editorGutterWidth = showGutter && layoutSettings.showEditor
    ? layoutConstants.gutterWidth : 0;
  const editorLeftPadding = editorRightPadding + styles.editorGutterWidth;
  styles.editorGutterLeft = editorLeftPadding - minPadding;
  styles.editorPadding = `${editorTopPadding}px ${editorRightPadding}px ${bottomPadding}px ${editorLeftPadding}px`;

  styles.titleMaxWidth = styles.innerWidth -
    navigationBarLeftButtonWidth -
    navigationBarRightButtonWidth -
    navigationBarSpinnerWidth;
  if (styles.showEditor) {
    const syncLocations = useSyncLocationStore().current;
    const publishLocations = usePublishLocationStore().current;
    styles.titleMaxWidth -= navigationBarEditButtonsWidth +
      (navigationBarLocationWidth * (syncLocations.length + publishLocations.length)) +
      (navigationBarSyncPublishButtonsWidth * 2) +
      navigationBarTitleMargin;
    if (styles.titleMaxWidth + navigationBarEditButtonsWidth < minTitleMaxWidth) {
      styles.hideLocations = true;
    }
  }
  styles.titleMaxWidth = Math
    .max(minTitleMaxWidth, Math.min(maxTitleMaxWidth, styles.titleMaxWidth));
  return styles;
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    canUndo: false,
    canRedo: false,
    bodyWidth: 0,
    bodyHeight: 0,
  }),
  getters: {
    constants: () => layoutConstants,
    styles(state) {
      const layoutSettings = useDataStore().layoutSettings;
      return computeStyles(state, layoutSettings);
    },
  },
  actions: {
    setCanUndo(value) {
      this.canUndo = value;
    },
    setCanRedo(value) {
      this.canRedo = value;
    },
    updateBodySize() {
      this.bodyWidth = document.body.clientWidth;
      this.bodyHeight = document.body.clientHeight;
      const dataStore = useDataStore();
      dataStore.toggleExplorer(dataStore.layoutSettings.showExplorer);
    },
  },
});
