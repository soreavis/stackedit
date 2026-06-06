export interface LocalSettings {
  welcomeFileHashes: Record<string, number>;
  filePropertiesTab: string;
  htmlExportTemplate: string;
  pdfExportTemplate: string;
  pandocExportFormat: string;
  explorerSort: string; // 'name' | 'modified' | 'created'
  pinnedFolderIds: Record<string, boolean>; // { [folderId]: true }
  googleDriveRestrictedAccess: boolean;
  googleDriveFolderId: string;
  googleDriveWorkspaceFolderId: string;
  googleDrivePublishFormat: string;
  googleDrivePublishTemplate: string;
  bloggerBlogUrl: string;
  bloggerPublishTemplate: string;
  dropboxRestrictedAccess: boolean;
  dropboxPublishTemplate: string;
  githubRepoFullAccess: boolean;
  githubRepoUrl: string;
  githubWorkspaceRepoUrl: string;
  githubPublishTemplate: string;
  gistIsPublic: boolean;
  gistPublishTemplate: string;
  gitlabServerUrl: string;
  gitlabApplicationId: string;
  gitlabProjectUrl: string;
  gitlabWorkspaceProjectUrl: string;
  gitlabPublishTemplate: string;
  wordpressDomain: string;
  wordpressPublishTemplate: string;
  zendeskSiteUrl: string;
  zendeskClientId: string;
  zendescPublishSectionId: string;
  zendescPublishLocale: string;
  zendeskPublishTemplate: string;
}

export default (): LocalSettings => ({
  welcomeFileHashes: {},
  filePropertiesTab: 'yaml',
  htmlExportTemplate: 'styledHtml',
  pdfExportTemplate: 'styledHtml',
  pandocExportFormat: 'pdf',
  explorerSort: 'name', // 'name' | 'modified' | 'created'
  pinnedFolderIds: {}, // { [folderId]: true }
  googleDriveRestrictedAccess: false,
  googleDriveFolderId: '',
  googleDriveWorkspaceFolderId: '',
  googleDrivePublishFormat: 'markdown',
  googleDrivePublishTemplate: 'styledHtml',
  bloggerBlogUrl: '',
  bloggerPublishTemplate: 'plainHtml',
  dropboxRestrictedAccess: false,
  dropboxPublishTemplate: 'styledHtml',
  githubRepoFullAccess: false,
  githubRepoUrl: '',
  githubWorkspaceRepoUrl: '',
  githubPublishTemplate: 'jekyllSite',
  gistIsPublic: false,
  gistPublishTemplate: 'plainText',
  gitlabServerUrl: '',
  gitlabApplicationId: '',
  gitlabProjectUrl: '',
  gitlabWorkspaceProjectUrl: '',
  gitlabPublishTemplate: 'plainText',
  wordpressDomain: '',
  wordpressPublishTemplate: 'plainHtml',
  zendeskSiteUrl: '',
  zendeskClientId: '',
  zendescPublishSectionId: '',
  zendescPublishLocale: '',
  zendeskPublishTemplate: 'plainHtml',
});
