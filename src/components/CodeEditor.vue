<template>
  <pre class="code-editor textfield prism" :disabled="disabled"></pre>
</template>

<script>
export default {
  // `lang` is accepted for API compatibility with the previous Prism-
  // based implementation but currently unused — CM6's small editor
  // ships without per-language syntax highlighting for settings /
  // template editing. Adding @codemirror/lang-yaml + lang-handlebars
  // is a follow-up if we miss the colors.
  props: ['value', 'lang', 'disabled'],
  async mounted() {
    const preElt = this.$el;
    // Lazy-load the CM6 small-editor builder so the flag-off main
    // bundle stays small. CodeEditor is only mounted from settings
    // / properties modals, well after app boot.
    const { mountSmallEditor } = await import('../services/editor/cm6/cm6SmallEditor');
    const clEditor = mountSmallEditor(preElt, {
      content: this.value || '',
      language: 'plain',
      readOnly: !!this.disabled,
    });
    clEditor.on('contentChanged', value => this.$emit('changed', value));
  },
};</script>

<style lang="scss">
@use '../styles/variables.scss' as *;

.code-editor {
  margin: 0;
  font-family: $font-family-monospace;
  font-size: $font-size-monospace;
  font-variant-ligatures: no-common-ligatures;
  word-break: break-word;
  word-wrap: normal;
  height: auto;
  caret-color: #000;
  min-height: 160px;
  overflow: auto;
  padding: 0.2em 0.4em;

  * {
    line-height: $line-height-base;
    font-size: inherit !important;
  }
}
</style>
