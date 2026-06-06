// Declares the globally app.component()-registered icon components so vue-tsc
// resolves <icon-x> usages inside typed (<script lang="ts">) component
// templates. Mirrors src/icons/index.js — regenerate if the icon set changes.
import 'vue';

declare module 'vue' {
  export interface GlobalComponents {
    IconProvider: typeof import('../icons/Provider.vue')['default'];
    IconFormatBold: typeof import('../icons/FormatBold.vue')['default'];
    IconFormatItalic: typeof import('../icons/FormatItalic.vue')['default'];
    IconFormatQuoteClose: typeof import('../icons/FormatQuoteClose.vue')['default'];
    IconLinkVariant: typeof import('../icons/LinkVariant.vue')['default'];
    IconFileImage: typeof import('../icons/FileImage.vue')['default'];
    IconTable: typeof import('../icons/Table.vue')['default'];
    IconFormatListNumbers: typeof import('../icons/FormatListNumbers.vue')['default'];
    IconFormatListBulleted: typeof import('../icons/FormatListBulleted.vue')['default'];
    IconFormatSize: typeof import('../icons/FormatSize.vue')['default'];
    IconFormatStrikethrough: typeof import('../icons/FormatStrikethrough.vue')['default'];
    IconStatusBar: typeof import('../icons/StatusBar.vue')['default'];
    IconNavigationBar: typeof import('../icons/NavigationBar.vue')['default'];
    IconSidePreview: typeof import('../icons/SidePreview.vue')['default'];
    IconEye: typeof import('../icons/Eye.vue')['default'];
    IconSettings: typeof import('../icons/Settings.vue')['default'];
    IconFilePlus: typeof import('../icons/FilePlus.vue')['default'];
    IconFileMultiple: typeof import('../icons/FileMultiple.vue')['default'];
    IconFolderPlus: typeof import('../icons/FolderPlus.vue')['default'];
    IconDelete: typeof import('../icons/Delete.vue')['default'];
    IconClose: typeof import('../icons/Close.vue')['default'];
    IconPen: typeof import('../icons/Pen.vue')['default'];
    IconTarget: typeof import('../icons/Target.vue')['default'];
    IconArrowLeft: typeof import('../icons/ArrowLeft.vue')['default'];
    IconHelpCircle: typeof import('../icons/HelpCircle.vue')['default'];
    IconToc: typeof import('../icons/Toc.vue')['default'];
    IconLogin: typeof import('../icons/Login.vue')['default'];
    IconLogout: typeof import('../icons/Logout.vue')['default'];
    IconSync: typeof import('../icons/Sync.vue')['default'];
    IconSyncOff: typeof import('../icons/SyncOff.vue')['default'];
    IconUpload: typeof import('../icons/Upload.vue')['default'];
    IconViewList: typeof import('../icons/ViewList.vue')['default'];
    IconDownload: typeof import('../icons/Download.vue')['default'];
    IconCodeTags: typeof import('../icons/CodeTags.vue')['default'];
    IconCodeBraces: typeof import('../icons/CodeBraces.vue')['default'];
    IconOpenInNew: typeof import('../icons/OpenInNew.vue')['default'];
    IconInformation: typeof import('../icons/Information.vue')['default'];
    IconAlert: typeof import('../icons/Alert.vue')['default'];
    IconSignalOff: typeof import('../icons/SignalOff.vue')['default'];
    IconFolder: typeof import('../icons/Folder.vue')['default'];
    IconScrollSync: typeof import('../icons/ScrollSync.vue')['default'];
    IconPrinter: typeof import('../icons/Printer.vue')['default'];
    IconUndo: typeof import('../icons/Undo.vue')['default'];
    IconRedo: typeof import('../icons/Redo.vue')['default'];
    IconContentSave: typeof import('../icons/ContentSave.vue')['default'];
    IconMessage: typeof import('../icons/Message.vue')['default'];
    IconHistory: typeof import('../icons/History.vue')['default'];
    IconDatabase: typeof import('../icons/Database.vue')['default'];
    IconMagnify: typeof import('../icons/Magnify.vue')['default'];
    IconFormatListChecks: typeof import('../icons/FormatListChecks.vue')['default'];
    IconCheckCircle: typeof import('../icons/CheckCircle.vue')['default'];
    IconContentCopy: typeof import('../icons/ContentCopy.vue')['default'];
    IconKey: typeof import('../icons/Key.vue')['default'];
    IconDotsHorizontal: typeof import('../icons/DotsHorizontal.vue')['default'];
    IconSeal: typeof import('../icons/Seal.vue')['default'];
    IconChevronUp: typeof import('../icons/ChevronUp.vue')['default'];
    IconChevronDown: typeof import('../icons/ChevronDown.vue')['default'];
    IconLanguageMarkdown: typeof import('../icons/LanguageMarkdown.vue')['default'];
    IconLanguageHtml5: typeof import('../icons/LanguageHtml5.vue')['default'];
    IconMath: typeof import('../icons/Math.vue')['default'];
    IconSitemap: typeof import('../icons/Sitemap.vue')['default'];
    IconHorizontalRule: typeof import('../icons/HorizontalRule.vue')['default'];
    IconMarker: typeof import('../icons/Marker.vue')['default'];
    IconFootnote: typeof import('../icons/Footnote.vue')['default'];
    IconFormatSubscript: typeof import('../icons/FormatSubscript.vue')['default'];
    IconFormatSuperscript: typeof import('../icons/FormatSuperscript.vue')['default'];
    IconCodeInline: typeof import('../icons/CodeInline.vue')['default'];
    IconMusicNote: typeof import('../icons/MusicNote.vue')['default'];
    IconAutoFix: typeof import('../icons/AutoFix.vue')['default'];
    IconCalendar: typeof import('../icons/Calendar.vue')['default'];
    IconCaseSensitiveAlt: typeof import('../icons/CaseSensitiveAlt.vue')['default'];
    IconSortAlphabetical: typeof import('../icons/SortAlphabetical.vue')['default'];
    IconOmega: typeof import('../icons/Omega.vue')['default'];
    IconLinkBracket: typeof import('../icons/LinkBracket.vue')['default'];
    IconLinkPaste: typeof import('../icons/LinkPaste.vue')['default'];
    IconFrontmatter: typeof import('../icons/Frontmatter.vue')['default'];
  }
}

export {};
