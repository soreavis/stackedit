import DiffMatchPatch from 'diff-match-patch';
import Prism from 'prismjs';
import MarkdownIt from 'markdown-it';
import markdownItFrontMatter from 'markdown-it-front-matter';
import markdownGrammarSvc from './markdownGrammarSvc';
import extensionSvc from './extensionSvc';
import utils from './utils';

const htmlSectionMarker = '\uF111\uF222\uF333\uF444';
const diffMatchPatch = new DiffMatchPatch();

// Create aliases for syntax highlighting
const languageAliases: Record<string, string> = {
  js: 'javascript',
  json: 'javascript',
  html: 'markup',
  svg: 'markup',
  xml: 'markup',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  ps1: 'powershell',
  psm1: 'powershell',
};
Object.entries(languageAliases).forEach(([alias, language]) => {
  (Prism.languages as any)[alias] = (Prism.languages as any)[language];
});

// Add programming language parsing capability to markdown fences
const insideFences: Record<string, unknown> = {};
Object.entries(Prism.languages as Record<string, unknown>).forEach(([name, language]) => {
  if ((Prism as any).util.type(language) === 'Object') {
    insideFences[`language-${name}`] = {
      pattern: new RegExp(`(\`\`\`|~~~)${name}\\W[\\s\\S]*`),
      inside: {
        'cl cl-pre': /(```|~~~).*/,
        rest: language,
      },
    };
  }
});

// Disable spell checking in specific tokens
const noSpellcheckTokens: Record<string, boolean> = Object.create(null);
[
  'code',
  'pre',
  'pre gfm',
  'math block',
  'math inline',
  'math expr block',
  'math expr inline',
  'latex block',
]
  .forEach((key) => {
    noSpellcheckTokens[key] = true;
  });
(Prism.hooks as any).add('wrap', (env: any) => {
  if (noSpellcheckTokens[env.type]) {
    env.attributes.spellcheck = 'false';
  }
});

function createFlagMap(arr: string[]): Record<string, true> {
  return arr.reduce<Record<string, true>>((map, type) => {
    map[type] = true;
    return map;
  }, {});
}
const startSectionBlockTypeMap = createFlagMap([
  'paragraph_open',
  'blockquote_open',
  'heading_open',
  'code',
  'fence',
  'table_open',
  'html_block',
  'bullet_list_open',
  'ordered_list_open',
  'hr',
  'dl_open',
]);
const listBlockTypeMap = createFlagMap([
  'bullet_list_open',
  'ordered_list_open',
]);
const blockquoteBlockTypeMap = createFlagMap([
  'blockquote_open',
]);
const tableBlockTypeMap = createFlagMap([
  'table_open',
]);
const deflistBlockTypeMap = createFlagMap([
  'dl_open',
]);

function hashArray(
  arr: string[],
  valueHash: Record<string, number>,
  valueArray: string[],
): string {
  const hash: number[] = [];
  arr.forEach((str) => {
    let strHash = valueHash[str];
    if (strHash === undefined) {
      strHash = valueArray.length;
      valueArray.push(str);
      valueHash[str] = strHash;
    }
    hash.push(strHash);
  });
  return String.fromCharCode.apply(null, hash);
}

interface ParsingCtx {
  text: string;
  sections: Array<{ text: string; data: string }>;
  converter: any;
  markdownState: any;
  markdownCoreRules: any[];
  sectionList?: unknown[];
}

interface ConversionCtx {
  text: string;
  sectionList?: unknown[];
  htmlSectionList: string[];
  htmlSectionDiff: unknown;
}

export default {
  defaultOptions: null as any,
  defaultConverter: null as any,
  defaultPrismGrammars: null as any,

  init(): void {
    const defaultProperties = { extensions: (utils as any).computedPresets.default };

    // Default options for the markdown converter and the grammar
    this.defaultOptions = {
      ...extensionSvc.getOptions(defaultProperties),
      insideFences,
    };

    this.defaultConverter = this.createConverter(this.defaultOptions);
    this.defaultPrismGrammars = (markdownGrammarSvc as any).makeGrammars(this.defaultOptions);
  },

  /**
   * Creates a converter and init it with extensions.
   */
  createConverter(options: any): any {
    // Let the listeners add the rules
    const converter = new MarkdownIt('zero');
    converter.core.ruler.enable([], true);
    converter.block.ruler.enable([], true);
    converter.inline.ruler.enable([], true);
    // YAML front-matter (--- … ---) at the very top of a document gets
    // consumed by this plugin and never reaches the renderer, so it
    // doesn't render as a giant collapsed setext-h2 + hr. The callback
    // is intentionally a no-op — we don't surface front-matter into
    // the rendered HTML or the export view object today; the plugin
    // exists purely to prevent rendering. (If anyone ever needs the
    // parsed YAML they can swap in a callback that stashes it on
    // `parsingCtx` or similar.)
    converter.use(markdownItFrontMatter, () => {});
    extensionSvc.initConverter(converter, options);
    Object.keys(startSectionBlockTypeMap).forEach((type) => {
      const rule = converter.renderer.rules[type] || converter.renderer.renderToken;
      converter.renderer.rules[type] = (tokens: any, idx: number, opts: any, env: any, self: any) => {
        if (tokens[idx].sectionDelimiter) {
          // Add section delimiter
          return htmlSectionMarker + rule.call(converter.renderer, tokens, idx, opts, env, self);
        }
        return rule.call(converter.renderer, tokens, idx, opts, env, self);
      };
    });
    return converter;
  },

  /**
   * Parse markdown sections by passing the 2 first block rules of the markdown-it converter.
   */
  parseSections(converter: any, text: string): ParsingCtx {
    const markdownState = new converter.core.State(text, converter, {});
    const markdownCoreRules = converter.core.ruler.getRules('');
    markdownCoreRules[0](markdownState); // Pass the normalize rule
    markdownCoreRules[1](markdownState); // Pass the block rule
    const lines = text.split('\n');
    if (!lines[lines.length - 1]) {
      // In cledit, last char is always '\n'.
      // Remove it as one will be added by addSection
      lines.pop();
    }
    const parsingCtx: ParsingCtx = {
      text,
      sections: [],
      converter,
      markdownState,
      markdownCoreRules,
    };
    let data = 'main';
    let i = 0;

    function addSection(maxLine: number) {
      const section = {
        text: '',
        data,
      };
      for (; i < maxLine; i += 1) {
        section.text += `${lines[i]}\n`;
      }
      if (section) {
        parsingCtx.sections.push(section);
      }
    }
    markdownState.tokens.forEach((token: any, index: number) => {
      // index === 0 means there are empty lines at the begining of the file
      if (token.level === 0 && startSectionBlockTypeMap[token.type] === true) {
        if (index > 0) {
          token.sectionDelimiter = true;
          addSection(token.map[0]);
        }
        if (listBlockTypeMap[token.type] === true) {
          data = 'list';
        } else if (blockquoteBlockTypeMap[token.type] === true) {
          data = 'blockquote';
        } else if (tableBlockTypeMap[token.type] === true) {
          data = 'table';
        } else if (deflistBlockTypeMap[token.type] === true) {
          data = 'deflist';
        } else {
          data = 'main';
        }
      }
    });
    addSection(lines.length);
    // markdown-it-front-matter consumes the `---\n…\n---` block at the
    // top of the doc but doesn't emit a token. parseSections then
    // accumulates those front-matter lines into a phantom first
    // section with no HTML to map to — the renderer's first marker is
    // BEFORE the first real content token (heading_open at index 1),
    // so `htmlSectionList[0]` is empty, gets shifted, and every
    // section ends up paired with the NEXT section's HTML.
    // sectionDescList's `previewElt.offsetTop` then points at the
    // wrong DOM node, sync misaligns by exactly one section, and the
    // user sees the preview perpetually showing content one section
    // ahead of the editor — same symptom as a cascading off-by-one.
    //
    // If the first section's text is *only* front matter (delimited
    // by `---` lines), drop it so the parser-section index matches
    // the renderer-section index.
    const fmRe = /^---\r?\n[\s\S]*?\r?\n---\r?\n*$/;
    if (parsingCtx.sections.length > 1 && fmRe.test(parsingCtx.sections[0].text)) {
      parsingCtx.sections.shift();
    }
    return parsingCtx;
  },

  /**
   * Convert markdown sections previously parsed with `parseSections`.
   */
  convert(parsingCtx: ParsingCtx, previousConversionCtx?: ConversionCtx): ConversionCtx {
    // This function can be called twice without editor modification
    // so prevent from converting it again.
    if (!parsingCtx.markdownState.isConverted) {
      // Skip 2 first rules previously passed in parseSections
      parsingCtx.markdownCoreRules
        .slice(2)
        .forEach((rule: (state: unknown) => void) => rule(parsingCtx.markdownState));
      parsingCtx.markdownState.isConverted = true;
    }
    const { tokens } = parsingCtx.markdownState;
    const html: string = parsingCtx.converter.renderer.render(
      tokens,
      parsingCtx.converter.options,
      parsingCtx.markdownState.env,
    );
    const htmlSectionList = html.split(htmlSectionMarker);
    if (htmlSectionList[0] === '') {
      htmlSectionList.shift();
    }
    const valueHash: Record<string, number> = Object.create(null);
    const valueArray: string[] = [];
    const newSectionHash = hashArray(htmlSectionList, valueHash, valueArray);
    let htmlSectionDiff: unknown;
    if (previousConversionCtx) {
      const oldSectionHash = hashArray(
        previousConversionCtx.htmlSectionList,
        valueHash,
        valueArray,
      );
      htmlSectionDiff = diffMatchPatch.diff_main(oldSectionHash, newSectionHash, false);
    } else {
      htmlSectionDiff = [
        [1, newSectionHash],
      ];
    }
    return {
      text: parsingCtx.text,
      sectionList: parsingCtx.sectionList,
      htmlSectionList,
      htmlSectionDiff,
    };
  },

  /**
   * Helper to highlight arbitrary markdown
   */
  highlight(
    markdown: string,
    converter?: any,
    grammars?: Record<string, unknown>,
  ): string {
    const useConverter = converter || this.defaultConverter;
    const useGrammars = grammars || this.defaultPrismGrammars;
    const parsingCtx = this.parseSections(useConverter, markdown);
    return parsingCtx.sections
      .map(section => (Prism.highlight as any)(section.text, useGrammars[section.data]))
      .join('');
  },
};
