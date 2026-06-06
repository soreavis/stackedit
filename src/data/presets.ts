interface MarkdownPreset {
  abbr: boolean;
  breaks: boolean;
  deflist: boolean;
  del: boolean;
  fence: boolean;
  footnote: boolean;
  imgsize: boolean;
  linkify: boolean;
  mark: boolean;
  sub: boolean;
  sup: boolean;
  table: boolean;
  tasklist: boolean;
  typographer: boolean;
}

interface EmojiPreset {
  enabled: boolean;
  // Enable shortcuts like :) :-(
  shortcuts: boolean;
}

interface TogglePreset {
  enabled: boolean;
}

interface Preset {
  markdown: MarkdownPreset;
  emoji: EmojiPreset;
  abc: TogglePreset;
  katex: TogglePreset;
  mermaid: TogglePreset;
}

// Overrides layered on top of the `zero` baseline only set a subset of fields.
interface PresetOverride {
  markdown?: Partial<MarkdownPreset>;
  emoji?: Partial<EmojiPreset>;
  abc?: Partial<TogglePreset>;
  katex?: Partial<TogglePreset>;
  mermaid?: Partial<TogglePreset>;
}

const zero: Preset = {
  // Markdown extensions
  markdown: {
    abbr: false,
    breaks: false,
    deflist: false,
    del: false,
    fence: false,
    footnote: false,
    imgsize: false,
    linkify: false,
    mark: false,
    sub: false,
    sup: false,
    table: false,
    tasklist: false,
    typographer: false,
  },
  // Emoji extension
  emoji: {
    enabled: false,
    // Enable shortcuts like :) :-(
    shortcuts: false,
  },
  /*
  ABC Notation extension
  Render abc-notation code blocks to music sheets
  See https://abcjs.net/
  */
  abc: {
    enabled: false,
  },
  /*
  Katex extension
  Render LaTeX mathematical expressions using:
    $...$ for inline formulas
    $$...$$ for displayed formulas.
  See https://math.meta.stackexchange.com/questions/5020
  */
  katex: {
    enabled: false,
  },
  /*
  Mermaid extension
  Convert code blocks starting with ```mermaid
  into diagrams and flowcharts.
  See https://mermaidjs.github.io/
  */
  mermaid: {
    enabled: false,
  },
};

const presets: Record<string, Array<Preset | PresetOverride>> = {
  zero: [zero],
  commonmark: [zero, {
    markdown: {
      fence: true,
    },
  }],
  gfm: [zero, {
    markdown: {
      breaks: true,
      del: true,
      fence: true,
      linkify: true,
      table: true,
      tasklist: true,
    },
    emoji: {
      enabled: true,
    },
  }],
  default: [zero, {
    markdown: {
      abbr: true,
      breaks: true,
      deflist: true,
      del: true,
      fence: true,
      footnote: true,
      imgsize: true,
      linkify: true,
      mark: true,
      sub: true,
      sup: true,
      table: true,
      tasklist: true,
      typographer: true,
    },
    emoji: {
      enabled: true,
    },
    katex: {
      enabled: true,
    },
    mermaid: {
      enabled: true,
    },
    abc: {
      enabled: true,
    },
  }],
};

export default presets;
