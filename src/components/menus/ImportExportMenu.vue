<template>
  <div class="side-bar__panel side-bar__panel--menu">
    <input class="hidden-file" id="import-markdown-file-input" type="file" @change="onImportMarkdown">
    <label class="menu-entry button flex flex--row flex--align-center" for="import-markdown-file-input">
      <div class="menu-entry__icon flex flex--column flex--center">
        <icon-upload></icon-upload>
      </div>
      <div class="flex flex--column">
        <div>Import Markdown</div>
        <span>Import a plain text file.</span>
      </div>
    </label>
    <input class="hidden-file" id="import-html-file-input" type="file" @change="onImportHtml">
    <label class="menu-entry button flex flex--row flex--align-center" for="import-html-file-input">
      <div class="menu-entry__icon flex flex--column flex--center">
        <icon-upload></icon-upload>
      </div>
      <div class="flex flex--column">
        <div>Import HTML</div>
        <span>Convert an HTML file to Markdown.</span>
      </div>
    </label>
    <menu-entry @click.native="onImportClipboard">
      <icon-content-copy slot="icon"></icon-content-copy>
      <div>Import from clipboard</div>
      <span>Paste Markdown or HTML as a new file.</span>
    </menu-entry>
    <hr>
    <menu-entry @click.native="exportMarkdown" :disabled="!hasCurrentFile">
      <icon-download slot="icon"></icon-download>
      <div>Export as Markdown</div>
      <span>Save plain text file.</span>
    </menu-entry>
    <menu-entry @click.native="exportHtml" :disabled="!hasCurrentFile">
      <icon-download slot="icon"></icon-download>
      <div>Export as HTML</div>
      <span>Generate an HTML page from a template.</span>
    </menu-entry>
    <menu-entry @click.native="exportPdf" :disabled="!hasCurrentFile">
      <icon-download slot="icon"></icon-download>
      <div><div class="menu-entry__label" :class="{'menu-entry__label--warning': !isSponsor}">sponsor</div> Export as PDF</div>
      <span>Produce a PDF from an HTML template. Mermaid diagrams are included and scaled to fit a single page.</span>
    </menu-entry>
    <menu-entry @click.native="exportPandoc" :disabled="!hasCurrentFile">
      <icon-download slot="icon"></icon-download>
      <div><div class="menu-entry__label" :class="{'menu-entry__label--warning': !isSponsor}">sponsor</div> Export with Pandoc</div>
      <span>Convert to PDF, Word, EPUB...</span>
    </menu-entry>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import TurndownService from 'turndown/lib/turndown.browser.umd';
import htmlSanitizer from '../../libs/htmlSanitizer';
import MenuEntry from './common/MenuEntry';
import Provider from '../../services/providers/common/Provider';
import { useFileStore } from '../../stores/file';
import { useModalStore } from '../../stores/modal';
import { useNotificationStore } from '../../stores/notification';
import workspaceSvc from '../../services/workspaceSvc';
import exportSvc from '../../services/exportSvc';
import badgeSvc from '../../services/badgeSvc';
import { useDataStore } from '../../stores/data';

const turndownService = new TurndownService(useDataStore().computedSettings.turndown);

// Heuristic: does this string already look like hand-written Markdown? Used to
// decide whether to skip the HTML→Markdown conversion when the clipboard has
// both flavors (e.g. pasting from ChatGPT, Notion, or a raw .md file).
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m,
  /^\s*[-*+]\s+\S/m,
  /^\s*\d+\.\s+\S/m,
  /^\s*```/m,
  /\*\*[^*\n]+\*\*/,
  /\[[^\]]+\]\([^)]+\)/,
  /^\s*>\s+\S/m,
  /^\s*---\s*$/m,
  /`[^`\n]+`/,
];
const looksLikeMarkdown = (text) => {
  if (!text || text.length < 3) return false;
  return MARKDOWN_PATTERNS.filter(re => re.test(text)).length >= 2;
};

const readFile = file => new Promise((resolve) => {
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      if (content.match(/\uFFFD/)) {
        useNotificationStore().error('File is not readable.');
      } else {
        resolve(content);
      }
    };
    reader.readAsText(file);
  }
});

export default {
  components: {
    MenuEntry,
  },
  computed: {
    ...mapGetters(['isSponsor']),
    hasCurrentFile() {
      return !!useFileStore().current.id;
    },
  },
  methods: {
    async onImportMarkdown(evt) {
      const file = evt.target.files[0];
      const content = await readFile(file);
      const item = await workspaceSvc.createFile({
        ...Provider.parseContent(content),
        name: file.name,
      });
      useFileStore().setCurrentId(item.id);
      badgeSvc.addBadge('importMarkdown');
    },
    async onImportHtml(evt) {
      const file = evt.target.files[0];
      const content = await readFile(file);
      const sanitizedContent = htmlSanitizer.sanitizeHtml(content)
        .replace(/&#160;/g, ' '); // Replace non-breaking spaces with classic spaces
      const item = await workspaceSvc.createFile({
        ...Provider.parseContent(turndownService.turndown(sanitizedContent)),
        name: file.name,
      });
      useFileStore().setCurrentId(item.id);
      badgeSvc.addBadge('importHtml');
    },
    async onImportClipboard() {
      try {
        let markdown = null;
        // Prefer clipboard.read() so we can detect rich HTML and convert it;
        // readText() loses formatting. Fall back to readText() when read() is
        // unavailable (Firefox <127, some embedded webviews).
        if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
          const items = await navigator.clipboard.read();
          let plainText = null;
          let html = null;
          for (const clipItem of items) {
            if (!plainText && clipItem.types.includes('text/plain')) {
              plainText = await (await clipItem.getType('text/plain')).text();
            }
            if (!html && clipItem.types.includes('text/html')) {
              html = await (await clipItem.getType('text/html')).text();
            }
          }
          // If the plain-text flavor is already Markdown (common when copying
          // from ChatGPT / Notion / a markdown file), use it verbatim. Running
          // Turndown on the HTML wrapper would double-escape every #, *, -, `,
          // producing unreadable output.
          if (plainText && looksLikeMarkdown(plainText)) {
            markdown = plainText;
          } else if (html) {
            const sanitized = htmlSanitizer.sanitizeHtml(html).replace(/&#160;/g, ' ');
            markdown = turndownService.turndown(sanitized);
          } else if (plainText) {
            markdown = plainText;
          }
        } else if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          markdown = await navigator.clipboard.readText();
        } else {
          useNotificationStore().error('Clipboard access is not supported in this browser.');
          return;
        }

        if (!markdown || !markdown.trim()) {
          useNotificationStore().info('Clipboard is empty.');
          return;
        }

        const headingMatch = markdown.match(/^#{1,6}\s+(.+?)\s*$/m);
        const name = headingMatch ? headingMatch[1] : 'Clipboard';
        const item = await workspaceSvc.createFile({
          ...Provider.parseContent(markdown),
          name,
        });
        useFileStore().setCurrentId(item.id);
        badgeSvc.addBadge('importClipboard');
      } catch (err) {
        if (err && err.name === 'NotAllowedError') {
          useNotificationStore().error('Clipboard permission denied. Allow clipboard access and try again.');
        } else {
          useNotificationStore().error('Could not read clipboard.');
        }
      }
    },
    async exportMarkdown() {
      const currentFile = useFileStore().current;
      try {
        await exportSvc.exportToDisk(currentFile.id, 'md');
        badgeSvc.addBadge('exportMarkdown');
      } catch (e) { /* Cancel */ }
    },
    async exportHtml() {
      try {
        await useModalStore().open('htmlExport');
      } catch (e) { /* Cancel */ }
    },
    async exportPdf() {
      try {
        await useModalStore().open('pdfExport');
      } catch (e) { /* Cancel */ }
    },
    async exportPandoc() {
      try {
        await useModalStore().open('pandocExport');
      } catch (e) { /* Cancel */ }
    },
  },
};
</script>
