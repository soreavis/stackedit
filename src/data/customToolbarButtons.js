// Toolbar buttons for features StackEdit already supports via markdown-it
// plugins but had no UI affordance for. Each button has an `action(editorSvc)`
// that operates on cledit directly (we bypass pagedown's UIManager since it
// doesn't know these commands).
//
// Convention: actions read selection via `editorSvc.clEditor.selectionMgr`
// and call `editorSvc.clEditor.replace(start, end, text)` to mutate. They
// optionally restore a sensible cursor position afterwards via
// `selectionMgr.setSelectionStartEnd`.

import { useModalStore } from '../stores/modal';

function getSelection(editorSvc) {
  const sel = editorSvc.clEditor.selectionMgr;
  const start = Math.min(sel.selectionStart, sel.selectionEnd);
  const end = Math.max(sel.selectionStart, sel.selectionEnd);
  const content = editorSvc.clEditor.getContent();
  return { start, end, selected: content.slice(start, end), content };
}

function wrap(editorSvc, prefix, suffix = prefix, placeholder = '') {
  const { start, end, selected } = getSelection(editorSvc);
  const inner = selected || placeholder;
  const replacement = `${prefix}${inner}${suffix}`;
  editorSvc.clEditor.replace(start, end, replacement);
  // Place cursor inside the wrap when no selection, otherwise leave the
  // wrapped range selected.
  const sel = editorSvc.clEditor.selectionMgr;
  if (selected) {
    sel.setSelectionStartEnd(start + prefix.length, start + prefix.length + inner.length);
  } else {
    const caret = start + prefix.length + placeholder.length;
    sel.setSelectionStartEnd(caret, caret);
  }
}

// Compute leading/trailing newlines needed to surround a block insert with
// exactly one blank line above and below. Counts what's already there and
// pads only the difference, so inserting before a blank-line-separated
// paragraph doesn't compound to triple newlines.
function padForBlock(content, start, end) {
  let preNL = 0;
  while (preNL < 2 && start - preNL - 1 >= 0 && content[start - preNL - 1] === '\n') {
    preNL += 1;
  }
  let postNL = 0;
  while (postNL < 2 && content[end + postNL] === '\n') {
    postNL += 1;
  }
  const atDocStart = start === 0;
  const atDocEnd = end === content.length;
  const leadingPad = atDocStart ? '' : '\n'.repeat(Math.max(2 - preNL, 0));
  const targetPostNL = atDocEnd ? 1 : 2;
  const trailingPad = '\n'.repeat(Math.max(targetPostNL - postNL, 0));
  return { leadingPad, trailingPad };
}

// Insert a multi-line block, replacing any current selection. If a range
// is selected the entire selection is consumed (replaced by the block);
// without a selection it's a plain at-cursor insert. Cursor lands at the
// end of the inserted block content (before the trailing pad) so typing
// extends the block.
function insertBlock(editorSvc, block) {
  const { start, end, content } = getSelection(editorSvc);
  const { leadingPad, trailingPad } = padForBlock(content, start, end);
  const replacement = `${leadingPad}${block}${trailingPad}`;
  editorSvc.clEditor.replace(start, end, replacement);
  const sel = editorSvc.clEditor.selectionMgr;
  const caret = start + leadingPad.length + block.length;
  sel.setSelectionStartEnd(caret, caret);
}

export const inlineCode = {
  method: 'inlineCode',
  title: 'Inline code',
  icon: 'code-inline',
  action: editorSvc => wrap(editorSvc, '`', '`', 'code'),
};

export const horizontalRule = {
  method: 'horizontalRule',
  title: 'Horizontal rule',
  icon: 'horizontal-rule',
  action: editorSvc => insertBlock(editorSvc, '---'),
};

export const highlight = {
  method: 'highlight',
  title: 'Highlight',
  icon: 'marker',
  action: editorSvc => wrap(editorSvc, '==', '==', 'highlighted'),
};

export const math = {
  method: 'math',
  title: 'Math (KaTeX)',
  icon: 'math',
  action: (editorSvc) => {
    // If text is selected, wrap inline with single $; otherwise drop a
    // $$ block stub since users typically reach for the toolbar to start
    // a new equation, not inline-decorate a word.
    const { selected } = getSelection(editorSvc);
    if (selected) {
      wrap(editorSvc, '$', '$', 'x^2');
    } else {
      insertBlock(editorSvc, '$$\nE = mc^2\n$$');
    }
  },
};

export const mermaid = {
  method: 'mermaid',
  title: 'Mermaid diagram',
  icon: 'sitemap',
  // If the user has text selected, it becomes the label of a single
  // flowchart node so they can extend from there. Quotes are escaped
  // since mermaid uses `["…"]` syntax for quoted labels.
  action: (editorSvc) => {
    const { selected } = getSelection(editorSvc);
    const label = (selected || '').replace(/\s+/g, ' ').replace(/"/g, '\\"').trim();
    const body = label
      ? `flowchart LR\n  A["${label}"]`
      : 'flowchart LR\n  A --> B';
    insertBlock(editorSvc, `\`\`\`mermaid\n${body}\n\`\`\``);
  },
};

export const footnote = {
  method: 'footnote',
  title: 'Footnote',
  icon: 'footnote',
  action: (editorSvc) => {
    // Two-step: insert reference at cursor, append definition stub at end
    // of document. Numbering is local — uses an incrementing counter per
    // session (1, 2, 3…) since scanning for existing footnotes inside a
    // toolbar action would block on large docs.
    const { start, content } = getSelection(editorSvc);
    const existing = content.match(/\[\^(\d+)\]/g) || [];
    const next = existing.length + 1;
    const ref = `[^${next}]`;
    editorSvc.clEditor.replace(start, start, ref);
    const newContent = editorSvc.clEditor.getContent();
    const trailing = newContent.endsWith('\n\n') ? '' : (newContent.endsWith('\n') ? '\n' : '\n\n');
    const definition = `${trailing}[^${next}]: footnote text\n`;
    const endPos = newContent.length;
    editorSvc.clEditor.replace(endPos, endPos, definition);
    const sel = editorSvc.clEditor.selectionMgr;
    const caret = start + ref.length;
    sel.setSelectionStartEnd(caret, caret);
  },
};

export const subscript = {
  method: 'subscript',
  title: 'Subscript',
  icon: 'format-subscript',
  action: editorSvc => wrap(editorSvc, '~', '~', '2'),
};

export const superscript = {
  method: 'superscript',
  title: 'Superscript',
  icon: 'format-superscript',
  action: editorSvc => wrap(editorSvc, '^', '^', '2'),
};

export const music = {
  method: 'music',
  title: 'Music notation (ABC)',
  icon: 'music-note',
  // ABC notation block — rendered by the bundled abcjs lib. If the user
  // has text selected, that text becomes the piece's title (T: line);
  // matches the wrap-style buttons' expectation that selected text is
  // consumed by the action. Falls back to "Untitled" otherwise. The body
  // is a simple C-major-scale stub so the user sees something rendered
  // immediately and can edit from there.
  action: (editorSvc) => {
    const { selected } = getSelection(editorSvc);
    // Strip newlines so the selection works as a single-line title.
    const title = (selected || '').replace(/\s+/g, ' ').trim() || 'Untitled';
    insertBlock(
      editorSvc,
      `\`\`\`abc\nX:1\nT:${title}\nM:4/4\nL:1/4\nK:C\n| C D E F | G A B c |\n\`\`\``,
    );
  },
};

// Conservative whole-document tidier. Skips content inside fenced code
// blocks (so indentation / whitespace there stays exactly as the user
// typed). Outside fences:
//   - trims trailing whitespace per line
//   - collapses 3+ blank lines to 1 blank line
//   - ensures a space after heading hashes (`#foo` → `# foo`)
//   - ensures a space after list-bullet markers (`-foo` → `- foo`)
//   - normalizes trailing newlines at EOF to exactly 1
// Deliberately doesn't reflow paragraphs, rewrap tables, or change
// emphasis-marker style — those are opinionated transforms that can
// damage intentional formatting.
function tidyMarkdown(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  let blankRun = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      blankRun = 0;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    let t = line.replace(/[ \t]+$/, '');
    if (t === '') {
      blankRun += 1;
      if (blankRun > 1) continue;
      out.push(t);
    } else {
      blankRun = 0;
      t = t.replace(/^(#{1,6})([^\s#])/, '$1 $2');
      t = t.replace(/^([ \t]*)([-*+])([^\s])/, '$1$2 $3');
      out.push(t);
    }
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

export const tidy = {
  method: 'tidy',
  title: 'Tidy markdown formatting',
  icon: 'auto-fix',
  // `separated: true` adds a small vertical line to the LEFT of the
  // button via a `::before` pseudo-element (no extra DOM, no extra
  // float-context width — the inline-element approach broke wrap
  // behavior on tight viewports).
  separated: true,
  // Operates on the whole document. cledit's setContent() uses diff-
  // match-patch to localize the actual replacement, so cursor position
  // is preserved naturally for the un-changed portions.
  action: (editorSvc) => {
    const before = editorSvc.clEditor.getContent();
    const after = tidyMarkdown(before);
    if (after !== before) {
      editorSvc.clEditor.setContent(after);
    }
  },
};

// Pad helper for at-cursor inline insertions. No newlines added — caller
// supplies any structure they want.
function insertInline(editorSvc, text) {
  const { start, end } = getSelection(editorSvc);
  editorSvc.clEditor.replace(start, end, text);
  const sel = editorSvc.clEditor.selectionMgr;
  const caret = start + text.length;
  sel.setSelectionStartEnd(caret, caret);
}

// Replace the lines covered by [start..end] with `mapper(line)`. Used by
// the callout, sort-lines, and convert-case actions which all operate
// on whole lines rather than character ranges.
function transformLines(editorSvc, mapper) {
  const { start, end, content } = getSelection(editorSvc);
  const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = content.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = content.length;
  const block = content.slice(lineStart, lineEnd);
  const transformed = mapper(block);
  editorSvc.clEditor.replace(lineStart, lineEnd, transformed);
}

// Replace the current selection with `fn(selection)`. No-op without a
// selection (these are user-driven transforms, not at-cursor inserts).
function transformSelection(editorSvc, fn) {
  const { start, end, selected } = getSelection(editorSvc);
  if (!selected) return;
  const replacement = fn(selected);
  editorSvc.clEditor.replace(start, end, replacement);
  const sel = editorSvc.clEditor.selectionMgr;
  sel.setSelectionStartEnd(start, start + replacement.length);
}

// Build a `> [!TYPE]\n> body…` callout block. Selection becomes the body
// (with each line prefixed by `> `); empty selection drops a placeholder
// line so the user has something to overwrite.
function insertCallout(editorSvc, type) {
  const { selected } = getSelection(editorSvc);
  const body = selected
    ? selected.split('\n').map(l => `> ${l}`).join('\n')
    : `> ${type.toLowerCase()} body`;
  insertBlock(editorSvc, `> [!${type}]\n${body}`);
}

// Date formatting helpers — keep ISO format (YYYY-MM-DD, HH:mm) since
// it's locale-neutral, sortable, and what every static-site generator
// expects.
const pad2 = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoTime = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const callout = {
  method: 'callout',
  title: 'Callout / admonition',
  icon: 'alert',
  // GitHub-flavored alert syntax (rendered styled on GitHub / Obsidian /
  // many readers; in-app StackEdit renders as a plain blockquote with
  // the `[!TYPE]` text visible — markdown-it default without a dedicated
  // plugin).
  dropdown: true,
  items: ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].map(type => ({
    name: type[0] + type.slice(1).toLowerCase(),
    perform: editorSvc => insertCallout(editorSvc, type),
  })),
};

export const dateTime = {
  method: 'dateTime',
  title: 'Insert date',
  icon: 'calendar',
  // ISO format (YYYY-MM-DD, HH:mm) — locale-neutral, sortable, what
  // static-site generators expect.
  dropdown: true,
  items: [
    {
      name: 'Date (YYYY-MM-DD)',
      perform: editorSvc => insertInline(editorSvc, isoDate(new Date())),
    },
    {
      name: 'Date + time (YYYY-MM-DD HH:mm)',
      perform: (editorSvc) => {
        const d = new Date();
        insertInline(editorSvc, `${isoDate(d)} ${isoTime(d)}`);
      },
    },
    {
      name: 'Time only (HH:mm)',
      perform: editorSvc => insertInline(editorSvc, isoTime(new Date())),
    },
  ],
};

export const frontmatter = {
  method: 'frontmatter',
  title: 'YAML front-matter',
  icon: 'frontmatter',
  // Inserts a YAML front-matter stub at document start. No-op when the
  // doc already begins with `---` so re-clicking doesn't double-stamp.
  action: (editorSvc) => {
    const content = editorSvc.clEditor.getContent();
    if (content.split('\n')[0].trim() === '---') return;
    const stub = `---\ntitle: \nauthor: \ndate: ${isoDate(new Date())}\ntags: []\n---\n\n`;
    editorSvc.clEditor.replace(0, 0, stub);
    const sel = editorSvc.clEditor.selectionMgr;
    // Cursor lands at the end of `title: ` so user can start typing.
    const caret = stub.indexOf('title: ') + 'title: '.length;
    sel.setSelectionStartEnd(caret, caret);
  },
};

export const convertCase = {
  method: 'convertCase',
  title: 'Convert case',
  icon: 'case-sensitive-alt',
  dropdown: true,
  items: [
    { name: 'UPPERCASE', perform: editorSvc => transformSelection(editorSvc, s => s.toUpperCase()) },
    { name: 'lowercase', perform: editorSvc => transformSelection(editorSvc, s => s.toLowerCase()) },
    {
      name: 'Title Case',
      perform: editorSvc => transformSelection(editorSvc, s =>
        s.replace(/\b([a-z])/g, c => c.toUpperCase())),
    },
    {
      name: 'Sentence case',
      perform: editorSvc => transformSelection(editorSvc, (s) => {
        const lower = s.toLowerCase();
        return lower.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, c) => prefix + c.toUpperCase());
      }),
    },
    {
      name: 'snake_case',
      perform: editorSvc => transformSelection(editorSvc, s =>
        s.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^\w]/g, '')),
    },
    {
      name: 'kebab-case',
      perform: editorSvc => transformSelection(editorSvc, s =>
        s.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')),
    },
  ],
};

export const sortLines = {
  method: 'sortLines',
  title: 'Sort lines alphabetically',
  icon: 'sort-alphabetical',
  // Sorts lines covered by selection (or the current line block if no
  // selection — but typically users select a list to sort). Locale-aware
  // so accented characters fall in the expected order.
  action: editorSvc => transformLines(editorSvc, (block) => {
    const lines = block.split('\n');
    return lines.slice().sort((a, b) => a.localeCompare(b)).join('\n');
  }),
};

// A small palette of typographic / math / arrow chars that get reached
// for daily but aren't on a keyboard.
const SPECIAL_CHARS = [
  ['—', 'Em dash'],
  ['–', 'En dash'],
  ['…', 'Ellipsis'],
  ['“', 'Open curly quote'],
  ['”', 'Close curly quote'],
  ['‘', 'Open curly apostrophe'],
  ['’', 'Close curly apostrophe'],
  ['→', 'Right arrow'],
  ['←', 'Left arrow'],
  ['↔', 'Both arrows'],
  ['•', 'Bullet'],
  ['©', 'Copyright'],
  ['®', 'Registered'],
  ['™', 'Trademark'],
  ['½', 'One half'],
  ['¼', 'One quarter'],
  ['¾', 'Three quarters'],
  ['×', 'Times'],
  ['÷', 'Divide'],
  ['±', 'Plus-minus'],
  ['≈', 'Approx'],
  ['≠', 'Not equal'],
  ['≤', 'Less or equal'],
  ['≥', 'Greater or equal'],
];

export const specialChars = {
  method: 'specialChars',
  title: 'Special characters',
  icon: 'omega',
  dropdown: true,
  items: SPECIAL_CHARS.map(([ch, label]) => ({
    name: `${ch}  ${label}`,
    perform: editorSvc => insertInline(editorSvc, ch),
  })),
};

export const wikiLink = {
  method: 'wikiLink',
  title: 'Wiki-style link',
  icon: 'link-bracket',
  // [[Page Name]] — Obsidian / Roam convention. StackEdit doesn't
  // resolve these natively, but inserting the syntax helps if the user
  // exports to a system that does (Obsidian, Foam, Logseq).
  action: editorSvc => wrap(editorSvc, '[[', ']]', 'Page Name'),
};

export const imageWithSize = {
  method: 'imageWithSize',
  title: 'Image with dimensions',
  icon: 'file-image',
  // Emits the bundled markdown-it-imsize syntax `![alt](url =WIDTHxHEIGHT)`
  // (note the space before `=`). Width-only `=300x` keeps the source
  // compact and lets the browser derive height from the image's aspect
  // ratio. The Hugo / kramdown / pandoc `{width=N}` attribute syntax —
  // which earlier versions of this button emitted — is NOT recognized
  // by markdown-it-imsize and renders as literal text after the image.
  action: (editorSvc) => {
    const { selected } = getSelection(editorSvc);
    const alt = selected || 'alt text';
    insertInline(editorSvc, `![${alt}](https://example.com/image.png =300x)`);
  },
};

// Build a markdown table of `rows × cols` with header row and a left-
// aligned separator. Cells are placeholder text the user overwrites.
function buildTable(rows, cols) {
  const header = `| ${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = Array.from({ length: rows - 1 }, () =>
    `| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`).join('\n');
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`;
}

export const tableInsert = {
  method: 'tableInsert',
  title: 'Insert table',
  icon: 'table',
  // Dropdown of common sizes. Pure-data approach so we don't have to
  // build a hover-grid picker SFC. Insert produces a fenced markdown
  // table with header + separator + body rows.
  dropdown: true,
  items: [
    { name: '2 × 2', perform: editorSvc => insertBlock(editorSvc, buildTable(2, 2)) },
    { name: '3 × 3', perform: editorSvc => insertBlock(editorSvc, buildTable(3, 3)) },
    { name: '4 × 3', perform: editorSvc => insertBlock(editorSvc, buildTable(4, 3)) },
    { name: '5 × 4', perform: editorSvc => insertBlock(editorSvc, buildTable(5, 4)) },
    { name: '10 × 4', perform: editorSvc => insertBlock(editorSvc, buildTable(10, 4)) },
  ],
};

export const textStats = {
  method: 'textStats',
  title: 'Text statistics for selection',
  icon: 'information',
  // Counts a mix of language-agnostic metrics (chars / words / lines /
  // sentences / reading- and speaking-time / token estimate) plus
  // markdown-aware structural counts (heading level breakdown, fenced
  // code blocks, inline code, links, images, GFM task completion).
  // Markdown counts are best-effort regex — close enough for an info
  // popup, not authoritative. Optional sections only render when the
  // doc contains the relevant construct, so plain prose stays terse.
  action: (editorSvc) => {
    const { selected } = getSelection(editorSvc);
    const text = selected || editorSvc.clEditor.getContent();

    // Language-agnostic counts.
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const words = (text.match(/\S+/g) || []).length;
    const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;
    const sentences = (text.match(/[^.!?\n]+[.!?]+(?=\s|$)/g) || []).length;
    const readMins = words ? Math.max(1, Math.round(words / 220)) : 0;
    // ~150 wpm is the widely-cited mid-range for adult read-aloud /
    // presentation pace; pairs with the existing 220 wpm silent-reading
    // rate. Same Math.max guard so a one-word selection still says "1 min".
    const speakMins = words ? Math.max(1, Math.round(words / 150)) : 0;
    // Rough chars/4 tokenizer-agnostic estimate. Real BPE varies by
    // model, but chars/4 is the canonical back-of-envelope for English
    // markdown and is what every "is this prompt going to fit" check
    // does in practice.
    const tokensEst = Math.ceil(chars / 4);

    // Paragraph count: blank-line-separated blocks that aren't pure
    // structural markup (heading, fence, blockquote, HR / front-matter,
    // table). Best-effort — short lists adjacent to prose may slip
    // through, but for a stats popup this is good enough.
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(b => b && !/^(#{1,6}\s|```|~~~|>|---|===|\|)/.test(b))
      .length;

    // Markdown-aware structure (best-effort regex).
    const headingsByLevel = [0, 0, 0, 0, 0, 0];
    (text.match(/^#{1,6}\s/gm) || []).forEach((m) => {
      headingsByLevel[m.trim().length - 1] += 1;
    });
    const headingsTotal = headingsByLevel.reduce((a, b) => a + b, 0);

    // Triple-backtick fenced blocks (paired). markdown-it also accepts
    // tilde fences but they're rare in real docs — skip for simplicity.
    const codeBlocks = (text.match(/^```[^\n]*\n[\s\S]*?\n```/gm) || []).length;
    // Strip fenced blocks first, then count inline code spans.
    const noFences = text.replace(/^```[\s\S]*?\n```/gm, '');
    const inlineCode = (noFences.match(/`[^`\n]+`/g) || []).length;

    // Link / image counts run on a fully code-stripped copy so tutorial
    // markdown that *quotes* `![alt](url)` inside backticks doesn't get
    // double-counted as a real image. Negative-lookbehind keeps `![]()`
    // images out of the link count. Reference-style `[text][label]`
    // links and bare-URL linkify are not counted — the syntax-driven
    // count is what the writer authored, not what the renderer auto-detects.
    const prose = noFences.replace(/`[^`\n]+`/g, '');
    const links = (prose.match(/(?<!!)\[[^\]]*\]\([^)]*\)/g) || []).length;
    const images = (prose.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;

    // GFM task list items: any list bullet followed by `[ ]`, `[x]`, or `[X]`.
    const taskTotal = (text.match(/^[ \t]*[-*+]\s+\[[ xX]\]/gm) || []).length;
    const taskDone = (text.match(/^[ \t]*[-*+]\s+\[[xX]\]/gm) || []).length;

    const scope = selected ? 'Selection' : 'Whole document';
    const lines = [
      { section: 'Counts' },
      { label: 'Characters', value: chars.toLocaleString() },
      { label: 'Characters (no whitespace)', value: charsNoSpace.toLocaleString() },
      { label: 'Words', value: words.toLocaleString() },
      { label: 'Lines', value: lineCount.toLocaleString() },
      { label: 'Paragraphs', value: paragraphs.toLocaleString() },
      { label: 'Sentences', value: sentences.toLocaleString() },
    ];

    const structureRows = [];
    if (headingsTotal > 0) {
      const breakdown = headingsByLevel
        .map((n, i) => (n > 0 ? `H${i + 1}: ${n}` : null))
        .filter(Boolean)
        .join(', ');
      structureRows.push({ label: 'Headings', value: `${headingsTotal} (${breakdown})` });
    }
    if (codeBlocks > 0 || inlineCode > 0) {
      structureRows.push({
        label: 'Code',
        value: `${codeBlocks} block${codeBlocks === 1 ? '' : 's'} + ${inlineCode} inline`,
      });
    }
    if (links > 0 || images > 0) {
      structureRows.push({ label: 'Links / Images', value: `${links} / ${images}` });
    }
    if (taskTotal > 0) {
      const pct = Math.round((taskDone / taskTotal) * 100);
      structureRows.push({ label: 'Tasks', value: `${taskDone}/${taskTotal} done (${pct}%)` });
    }
    if (structureRows.length) {
      lines.push({ separator: true });
      lines.push({ section: 'Structure' });
      lines.push(...structureRows);
    }

    lines.push({ separator: true });
    lines.push({ section: 'Reading' });
    lines.push({ label: 'Reading time', value: `${readMins} min (~220 wpm)` });
    if (words > 0) {
      lines.push({ label: 'Speaking time', value: `${speakMins} min (~150 wpm)` });
    }
    lines.push({ label: 'Estimated tokens', value: `~${tokensEst.toLocaleString()}` });

    useModalStore().open({ type: 'textStats', scope, lines }).catch(() => {});
  },
};

export const linkFromClipboard = {
  method: 'linkFromClipboard',
  title: 'Link from clipboard',
  icon: 'link-paste',
  // Reads navigator.clipboard. If the clipboard contains a URL, wraps
  // selected text (or 'link text' placeholder) as `[text](url)`. Falls
  // through to a plain markdown-link wrap if clipboard is empty / not
  // a URL / permission denied.
  action: async (editorSvc) => {
    const { selected } = getSelection(editorSvc);
    let url = '';
    try {
      const text = await navigator.clipboard.readText();
      if (text && /^https?:\/\//i.test(text.trim())) url = text.trim();
    } catch {
      // permission denied or clipboard empty — fall through
    }
    const linkText = selected || 'link text';
    if (url) {
      wrap(editorSvc, '[', `](${url})`, linkText);
    } else {
      wrap(editorSvc, '[', '](https://)', linkText);
    }
  },
};

// Order chosen to flow logically with the existing pagedown toolbar:
// formatting wrappers first (inline code, highlight, sub/super), then
// block-level inserts (HR, math, mermaid, music, callout, frontmatter),
// then meta (footnote, dateTime, wikiLink, linkFromClipboard, specialChars),
// then transforms (convertCase, sortLines), and finally the document-wide
// tidy action (visually separated via `separated: true`).
export default [
  inlineCode,
  highlight,
  subscript,
  superscript,
  horizontalRule,
  math,
  mermaid,
  music,
  callout,
  frontmatter,
  footnote,
  tableInsert,
  imageWithSize,
  dateTime,
  wikiLink,
  linkFromClipboard,
  specialChars,
  convertCase,
  sortLines,
  textStats,
  tidy,
];
