import katex from 'katex';
import markdownItMath from './libs/markdownItMath';
import extensionSvc from '../services/extensionSvc';

extensionSvc.onGetOptions((options, properties: any) => {
  options.math = properties.extensions.katex.enabled;
});

extensionSvc.onInitConverter(2, (markdown: any, options) => {
  if (options.math) {
    (markdown as any).use(markdownItMath);
    markdown.renderer.rules.inline_math = (tokens: any, idx: number) =>
      `<span class="katex--inline">${markdown.utils.escapeHtml(tokens[idx].content)}</span>`;
    markdown.renderer.rules.display_math = (tokens: any, idx: number) =>
      `<span class="katex--display">${markdown.utils.escapeHtml(tokens[idx].content)}</span>`;
  }
});

extensionSvc.onSectionPreview((elt) => {
  const highlighter = (displayMode: boolean) => (katexElt: any) => {
    if (!katexElt.highlighted) {
      try {
        katex.render(katexElt.textContent, katexElt, { displayMode });
      } catch (e: any) {
        katexElt.textContent = `${e.message}`;
      }
    }
    katexElt.highlighted = true;
  };
  elt.querySelectorAll('.katex--inline').forEach(highlighter(false));
  elt.querySelectorAll('.katex--display').forEach(highlighter(true));
});
