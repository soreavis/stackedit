export interface LayoutSettings {
  showNavigationBar: boolean;
  showEditor: boolean;
  showSidePreview: boolean;
  showStatusBar: boolean;
  showSideBar: boolean;
  showExplorer: boolean;
  scrollSync: boolean;
  focusMode: boolean;
  showLineNumbers: boolean;
  findCaseSensitive: boolean;
  findUseRegexp: boolean;
  sideBarPanel: string;
  welcomeTourFinished: boolean;
}

export default (): LayoutSettings => ({
  showNavigationBar: true,
  showEditor: true,
  showSidePreview: true,
  showStatusBar: true,
  showSideBar: false,
  showExplorer: false,
  scrollSync: true,
  focusMode: false,
  showLineNumbers: false,
  findCaseSensitive: false,
  findUseRegexp: false,
  sideBarPanel: 'menu',
  welcomeTourFinished: false,
});
