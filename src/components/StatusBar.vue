<template>
  <div class="stat-panel panel no-overflow">
    <div class="stat-panel__block stat-panel__block--left" v-if="styles.showEditor">
      <span class="stat-panel__block-name" v-title="'Markdown source'">
        <icon-language-markdown></icon-language-markdown>
        <span v-if="textSelection">selection</span>
      </span>
      <span v-for="stat in textStats" :key="stat.id">
        <span class="stat-panel__value">{{ stat.value }}</span> {{ stat.name }}
      </span>
      <span class="stat-panel__value">Ln {{ line }}, Col {{ column }}</span>
    </div>
    <div class="stat-panel__block stat-panel__block--right">
      <span class="stat-panel__block-name" v-title="'Rendered HTML'">
        <icon-language-html5></icon-language-html5>
        <span v-if="htmlSelection">selection</span>
      </span>
      <span v-for="stat in htmlStats" :key="stat.id">
        <span class="stat-panel__value">{{ stat.value }}</span> {{ stat.name }}
      </span>
    </div>
  </div>
</template>

<script>

import { mapState as mapPiniaState } from 'pinia';
import editorSvc from '../services/editorSvc';
import utils from '../services/utils';
import { useLayoutStore } from '../stores/layout';

// A footer stat: either a regex counter OR a custom computeFn(text) → value.
class Stat {
  constructor(name, regex, computeFn) {
    this.id = utils.uid();
    this.name = name;
    this.regex = regex ? new RegExp(regex, 'gm') : null;
    this.computeFn = computeFn || null;
    this.value = null;
  }

  run(text) {
    if (this.computeFn) {
      this.value = this.computeFn(text);
      return;
    }
    this.value = (text.match(this.regex) || []).length;
  }
}

// Reading time = words / 220 wpm, rounded up, min 1 if any content.
function formatReading(text) {
  const words = (text.match(/\S+/g) || []).length;
  if (!words) return '0m';
  return `${Math.max(1, Math.round(words / 220))}m`;
}

// Crude sentence split — ends with ., !, or ? followed by space/EOL.
const SENTENCE_RE = '[^.!?\\n]+[.!?]+(?=\\s|$)';

export default {
  data: () => ({
    textSelection: false,
    htmlSelection: false,
    line: 0,
    column: 0,
    textStats: [
      new Stat('bytes', '[\\s\\S]'),
      new Stat('chars', '\\S'),
      new Stat('words', '\\S+'),
      new Stat('lines', '\n'),
      new Stat('sentences', SENTENCE_RE),
      new Stat('headings', '^#{1,6}\\s+\\S'),
      new Stat('code', '^```'),
      new Stat('links', '\\[[^\\]]+\\]\\([^)]+\\)'),
      new Stat('read', null, formatReading),
    ],
    htmlStats: [
      new Stat('characters', '\\S'),
      new Stat('words', '\\S+'),
      new Stat('paragraphs', '\\S.*'),
      new Stat('sentences', SENTENCE_RE),
      new Stat('read', null, formatReading),
    ],
  }),
  computed: mapPiniaState(useLayoutStore, [
    'styles',
  ]),
  created() {
    editorSvc.$on('sectionList', () => this.computeText());
    editorSvc.$on('selectionRange', () => this.computeText());
    editorSvc.$on('previewCtx', () => this.computeHtml());
    editorSvc.$on('previewSelectionRange', () => this.computeHtml());
  },

  methods: {
    computeText() {
      setTimeout(() => {
        this.textSelection = false;
        let text = editorSvc.clEditor.getContent();
        const beforeText = text.slice(0, editorSvc.clEditor.selectionMgr.selectionEnd);
        const beforeLines = beforeText.split('\n');
        this.line = beforeLines.length;
        this.column = beforeLines.pop().length;

        const selectedText = editorSvc.clEditor.selectionMgr.getSelectedText();
        if (selectedText) {
          this.textSelection = true;
          text = selectedText;
        }
        this.textStats.forEach(stat => stat.run(text));
      }, 10);
    },
    computeHtml() {
      setTimeout(() => {
        let text;
        if (editorSvc.previewSelectionRange) {
          text = `${editorSvc.previewSelectionRange}`;
        }
        this.htmlSelection = true;
        if (!text) {
          this.htmlSelection = false;
          ({ text } = editorSvc.previewCtx);
        }
        if (text != null) {
          this.htmlStats.forEach(stat => stat.run(text));
        }
      }, 10);
    },
  },
};
</script>

<style lang="scss">
.stat-panel {
  position: absolute;
  width: 100%;
  height: 100%;
  color: #fff;
  font-size: 12px;
}

.stat-panel__block {
  margin: 0 10px;
}

.stat-panel__block--left {
  float: left;
}

.stat-panel__block--right {
  float: right;
}

.stat-panel__value {
  font-weight: 600;
  margin-left: 5px;
}

/* The Markdown / HTML side-labels are now icon-only. Status-bar height is
   20 px; a 14 px square fits with a hair of breathing room and aligns
   to the numeric stats' baseline via vertical-align: -2px. */
.stat-panel__block-name .icon {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: -2px;
  opacity: 0.85;
}
</style>
