import { defineStore } from 'pinia';
import pagedownButtons from '../data/pagedownButtons';
import { useFileStore } from './file';
import { useContentStore } from './content';
import { useSyncLocationStore } from './syncLocation';
import { usePublishLocationStore } from './publishLocation';
import { useDataStore } from './data';
import { useDiscussionStore } from './discussion';
import { useGlobalStore } from './global';

interface PagedownButton {
  method?: string;
  title?: string;
  icon?: string;
  separator?: boolean;
}

let buttonCount = 2;
let spacerCount = 0;
(pagedownButtons as PagedownButton[]).forEach((button) => {
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

interface LayoutSettings {
  showNavigationBar: boolean;
  showStatusBar: boolean;
  showEditor: boolean;
  showSidePreview: boolean;
  showSideBar: boolean;
  showExplorer: boolean;
  sideBarPanel?: string;
}

interface LayoutState {
  canUndo: boolean;
  canRedo: boolean;
  bodyWidth: number;
  bodyHeight: number;
}

interface ComputedStyles {
  showNavigationBar: boolean;
  showStatusBar: boolean;
  showEditor: boolean;
  showSidePreview: boolean;
  showPreview: boolean;
  showSideBar: boolean;
  showExplorer: boolean;
  layoutOverflow: boolean;
  hideLocations: boolean;
  innerHeight: number;
  innerWidth: number;
  sideBarWidth: number;
  fontSize: number;
  textWidth: number;
  previewWidth: number;
  previewGutterWidth: number;
  previewGutterLeft: number;
  previewPadding: string;
  editorWidth: number;
  editorGutterWidth: number;
  editorGutterLeft: number;
  editorPadding: string;
  titleMaxWidth: number;
}

function computeStyles(state: LayoutState, layoutSettings: LayoutSettings, styles?: Partial<ComputedStyles>): ComputedStyles {
  if (!styles) {
    styles = {
      showNavigationBar: layoutSettings.showNavigationBar
        || !layoutSettings.showEditor
        || !!(useContentStore() as unknown as { revisionContent: unknown }).revisionContent
        || useGlobalStore().light,
      showStatusBar: layoutSettings.showStatusBar,
      showEditor: layoutSettings.showEditor,
      showSidePreview: layoutSettings.showSidePreview && layoutSettings.showEditor,
      showPreview: layoutSettings.showSidePreview || !layoutSettings.showEditor,
      showSideBar: layoutSettings.showSideBar && !useGlobalStore().light,
      showExplorer: layoutSettings.showExplorer && !useGlobalStore().light,
      layoutOverflow: false,
      hideLocations: useGlobalStore().light,
    };
  }
  const s = styles as ComputedStyles;
  s.innerHeight = state.bodyHeight;
  if (s.showNavigationBar) s.innerHeight -= layoutConstants.navigationBarHeight;
  if (s.showStatusBar) s.innerHeight -= layoutConstants.statusBarHeight;

  s.innerWidth = state.bodyWidth;
  if (s.innerWidth < layoutConstants.editorMinWidth
    + layoutConstants.gutterWidth + layoutConstants.buttonBarWidth) {
    s.layoutOverflow = true;
  }
  s.sideBarWidth = layoutSettings.sideBarPanel === 'toc'
    ? layoutConstants.sideBarTocWidth
    : layoutConstants.sideBarWidth;
  if (s.showSideBar) s.innerWidth -= s.sideBarWidth;
  if (s.showExplorer) s.innerWidth -= layoutConstants.explorerWidth;

  let doublePanelWidth = s.innerWidth - layoutConstants.buttonBarWidth;
  const showGutter = !(useFileStore() as unknown as { isCurrentTemp: boolean }).isCurrentTemp
    && !!(useDiscussionStore() as unknown as { currentDiscussion?: unknown }).currentDiscussion;

  if (showGutter) doublePanelWidth -= layoutConstants.gutterWidth;
  if (doublePanelWidth < layoutConstants.editorMinWidth) {
    doublePanelWidth = layoutConstants.editorMinWidth;
  }

  if (s.showSidePreview && doublePanelWidth / 2 < layoutConstants.editorMinWidth) {
    s.showSidePreview = false;
    s.showPreview = false;
    s.layoutOverflow = false;
    return computeStyles(state, layoutSettings, s);
  }

  const computedSettings = (useDataStore() as unknown as { computedSettings: { maxWidthFactor: number; fontSizeFactor: number } }).computedSettings;
  s.fontSize = 18;
  s.textWidth = 990;
  if (doublePanelWidth < 1120) {
    s.fontSize -= 1;
    s.textWidth = 910;
  }
  if (doublePanelWidth < 1040) {
    s.textWidth = 830;
  }
  s.textWidth *= computedSettings.maxWidthFactor;
  if (doublePanelWidth < s.textWidth) {
    s.textWidth = doublePanelWidth;
  }
  if (s.textWidth < 640) s.fontSize -= 1;
  s.fontSize *= computedSettings.fontSizeFactor;

  const bottomPadding = Math.floor(s.innerHeight / 2);
  const panelWidth = Math.floor(doublePanelWidth / 2);
  s.previewWidth = s.showSidePreview ? panelWidth : doublePanelWidth;
  const previewRightPadding = Math
    .max(Math.floor((s.previewWidth - s.textWidth) / 2), minPadding);
  if (!s.showSidePreview) s.previewWidth += layoutConstants.buttonBarWidth;
  s.previewGutterWidth = showGutter && !layoutSettings.showEditor
    ? layoutConstants.gutterWidth : 0;
  const previewLeftPadding = previewRightPadding + s.previewGutterWidth;
  s.previewGutterLeft = previewLeftPadding - minPadding;
  s.previewPadding = `${editorTopPadding}px ${previewRightPadding}px ${bottomPadding}px ${previewLeftPadding}px`;
  s.editorWidth = s.showSidePreview ? panelWidth : doublePanelWidth;
  const editorRightPadding = Math
    .max(Math.floor((s.editorWidth - s.textWidth) / 2), minPadding);
  s.editorGutterWidth = showGutter && layoutSettings.showEditor
    ? layoutConstants.gutterWidth : 0;
  const editorLeftPadding = editorRightPadding + s.editorGutterWidth;
  s.editorGutterLeft = editorLeftPadding - minPadding;
  s.editorPadding = `${editorTopPadding}px ${editorRightPadding}px ${bottomPadding}px ${editorLeftPadding}px`;

  s.titleMaxWidth = s.innerWidth -
    navigationBarLeftButtonWidth -
    navigationBarRightButtonWidth -
    navigationBarSpinnerWidth;
  if (s.showEditor) {
    const syncLocations = (useSyncLocationStore() as unknown as { current: unknown[] }).current;
    const publishLocations = (usePublishLocationStore() as unknown as { current: unknown[] }).current;
    s.titleMaxWidth -= navigationBarEditButtonsWidth +
      (navigationBarLocationWidth * (syncLocations.length + publishLocations.length)) +
      (navigationBarSyncPublishButtonsWidth * 2) +
      navigationBarTitleMargin;
    if (s.titleMaxWidth + navigationBarEditButtonsWidth < minTitleMaxWidth) {
      s.hideLocations = true;
    }
  }
  s.titleMaxWidth = Math
    .max(minTitleMaxWidth, Math.min(maxTitleMaxWidth, s.titleMaxWidth));
  return s;
}

export const useLayoutStore = defineStore('layout', {
  state: (): LayoutState => ({
    canUndo: false,
    canRedo: false,
    bodyWidth: 0,
    bodyHeight: 0,
  }),
  getters: {
    constants: (): typeof layoutConstants => layoutConstants,
    styles(state: LayoutState): ComputedStyles {
      const layoutSettings = (useDataStore() as unknown as { layoutSettings: LayoutSettings }).layoutSettings;
      return computeStyles(state, layoutSettings);
    },
  },
  actions: {
    setCanUndo(value: boolean) {
      this.canUndo = value;
    },
    setCanRedo(value: boolean) {
      this.canRedo = value;
    },
    updateBodySize() {
      this.bodyWidth = document.body.clientWidth;
      this.bodyHeight = document.body.clientHeight;
      const dataStore = useDataStore() as unknown as { layoutSettings: LayoutSettings; toggleExplorer: (v: boolean) => void };
      dataStore.toggleExplorer(dataStore.layoutSettings.showExplorer);
    },
  },
});
