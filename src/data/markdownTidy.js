// Whole-document markdown tidier used by the "Tidy markdown formatting"
// toolbar button. Pure string -> string so it can be unit-reasoned in
// isolation. The guiding ethos is non-destructive: anything ambiguous is
// left exactly as the user typed it, and fenced code blocks are never
// touched.
//
// What it does (outside fenced code):
//   - trims trailing whitespace, but preserves intentional two-space hard
//     line breaks (MD009)
//   - collapses runs of blank lines to a single blank line, trims leading
//     and trailing blank lines, ends the file with exactly one newline
//   - inserts the missing space after `#heading` and `-bullet` (a bare
//     `-foo`/`#foo` isn't a list/heading in CommonMark, so this fixes what
//     the user clearly meant) without mangling `**bold**` at line start
//   - normalizes unordered list markers `*`/`+` to `-` (MD004)
//   - renumbers ordered lists sequentially, per indentation level (MD029)
//   - strips ATX heading closing hashes (`## Foo ##` -> `## Foo`) (MD020/21)
//   - surrounds ATX headings with one blank line (MD022)
//   - adds a blank line around top-level fenced code blocks (MD031) and
//     around lists (MD032) WITHOUT inserting blanks between list items
//     (which would turn a tight list loose and change rendering)
//   - normalizes `*`/`_` thematic breaks to `---` (MD035)
//   - removes spaces just inside `**strong**` / `__strong__` markers (MD037),
//     conservatively (double markers only, never intraword, never inside
//     inline code) so arithmetic like `2 * 3 * 4` is left alone
//   - COMPACTS pipe tables: each cell single-space padded, a tight
//     `|---|---|` delimiter row, alignment colons preserved
//
// Deliberately NOT done: paragraph reflow, emphasis-style changes beyond the
// MD037 space trim, table column-width padding (the user wants compact
// tables, not aligned ones), reference-link rewriting.

const FENCE_RE = /^(\s*)(```|~~~)/;
const isBlank = line => line.trim() === '';

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

// Split a markdown table row into trimmed cell strings. Strips a single
// leading/trailing pipe (the optional GFM edge delimiters) then splits on
// pipes that aren't backslash-escaped and aren't inside an inline code span.
function splitTableRow(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i += 1;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

const rowHasPipe = line => /\|/.test(line);

// A delimiter row is `---`, `:--`, `--:`, `:-:` cells separated by pipes.
// Requiring an actual pipe keeps a bare `---` (setext underline / thematic
// break) from being mistaken for a one-column table.
function isDelimiterRow(line) {
  if (!line || !rowHasPipe(line) || isBlank(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
}

function parseAlign(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

function delimMarker(align) {
  switch (align) {
    case 'left': return ':---';
    case 'right': return '---:';
    case 'center': return ':---:';
    default: return '---';
  }
}

// Rewrite every detected pipe table in compact form: single-space cells and
// a tight delimiter row. Column count is the widest row so no cells are lost.
function reflowTables(lines) {
  const out = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      i += 1;
      continue;
    }
    const isTableStart = !inFence
      && !isBlank(line)
      && rowHasPipe(line)
      && i + 1 < lines.length
      && isDelimiterRow(lines[i + 1]);
    if (!isTableStart) {
      out.push(line);
      i += 1;
      continue;
    }

    const indent = (line.match(/^(\s*)/) || ['', ''])[1];
    const header = splitTableRow(line);
    const aligns = splitTableRow(lines[i + 1]).map(parseAlign);
    const body = [];
    let j = i + 2;
    while (j < lines.length
      && !isBlank(lines[j])
      && rowHasPipe(lines[j])
      && !FENCE_RE.test(lines[j])) {
      body.push(splitTableRow(lines[j]));
      j += 1;
    }

    const ncols = Math.max(header.length, aligns.length, ...body.map(r => r.length));
    const padCols = (cells) => {
      const c = cells.slice();
      while (c.length < ncols) c.push('');
      return c;
    };
    const fmtRow = cells => `${indent}| ${padCols(cells).join(' | ')} |`;
    const fmtDelim = () => `${indent}|${
      Array.from({ length: ncols }, (_, k) => delimMarker(aligns[k] || 'none')).join('|')
    }|`;

    // Surround a top-level table with blank lines (MD058) so it can't get
    // glued onto a preceding/following paragraph. Indented tables (inside a
    // list item) are left as-is to avoid breaking the list's structure.
    const topLevel = indent === '';
    if (topLevel && out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(fmtRow(header));
    out.push(fmtDelim());
    body.forEach(r => out.push(fmtRow(r)));
    if (topLevel && j < lines.length && !isBlank(lines[j])) out.push('');
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Line-level cleanup (fence-aware)
// ---------------------------------------------------------------------------

// True for a `*`/`_` thematic break (`***`, `___`, `* * *`) — but not `**`
// (too few) and not `**bold**` (not all marker chars).
function isStarOrUnderscoreHr(trimmed) {
  const compact = trimmed.replace(/ /g, '');
  return /^\*{3,}$/.test(compact) || /^_{3,}$/.test(compact);
}

// Remove spaces immediately inside double emphasis markers, outside inline
// code, without touching intraword text or single-marker arithmetic.
function fixEmphasis(line) {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((seg, idx) => (idx % 2 === 1
      ? seg // inline code span — leave verbatim
      : seg.replace(
        /(^|[^\w*_])(\*\*|__)[ \t]+(\S(?:.*?\S)?)[ \t]+\2(?=$|[^\w*_])/g,
        '$1$2$3$2',
      )))
    .join('');
}

function lineCleanup(lines) {
  const out = [];
  let inFence = false;
  let blankRun = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      blankRun = 0;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // Preserve a two-space hard line break; strip any other trailing run.
    const trail = line.match(/[ \t]+$/);
    const body = line.replace(/[ \t]+$/, '');
    const hardBreak = body !== '' && trail != null && /^ {2,}$/.test(trail[0]);

    if (body === '') {
      blankRun += 1;
      if (blankRun > 1) continue;
      out.push('');
      continue;
    }
    blankRun = 0;

    const trimmed = body.trim();
    if (isStarOrUnderscoreHr(trimmed)) {
      const indent = (body.match(/^(\s*)/) || ['', ''])[1];
      out.push(`${indent}---`);
      continue;
    }

    let t = body;
    // `#foo` -> `# foo`
    t = t.replace(/^(#{1,6})([^\s#])/, '$1 $2');
    // `## Foo ##` -> `## Foo`  (strip ATX closing sequence)
    t = t.replace(/^(#{1,6}\s+.*?)\s+#+\s*$/, '$1');
    // `-foo` -> `- foo`, but NOT `**bold**` (marker followed by another marker)
    t = t.replace(/^(\s*)([-*+])(?![-*+\s])(\S)/, '$1$2 $3');
    // `* item` / `+ item` -> `- item`
    t = t.replace(/^(\s*)[*+]([ \t]+)/, '$1-$2');
    t = fixEmphasis(t);

    out.push(hardBreak ? `${t}  ` : t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ordered-list renumbering (fence-aware)
// ---------------------------------------------------------------------------

const ORDERED_RE = /^(\s*)(\d+)([.)])(\s+)(.*)$/;
const UNORDERED_RE = /^(\s*)[-*+](\s+)/;

function renumberOrdered(lines) {
  const out = [];
  let inFence = false;
  const stack = []; // [{ indent, next }] per nesting level
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence || isBlank(line)) {
      out.push(line); // a single blank doesn't end a (loose) list
      continue;
    }
    const m = line.match(ORDERED_RE);
    if (m) {
      const lead = m[1];
      const indent = lead.length;
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        top = { indent, next: parseInt(m[2], 10) }; // keep the author's start number
        stack.push(top);
      }
      const n = top.next;
      top.next = n + 1;
      out.push(`${lead}${n}${m[3]}${m[4]}${m[5]}`);
      continue;
    }
    // Not an ordered item. Keep counters across unordered items and indented
    // continuation lines (still inside the list); reset once a real top-level
    // block interrupts the list.
    const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
    if (!UNORDERED_RE.test(line) && indent === 0) {
      stack.length = 0;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block spacing
// ---------------------------------------------------------------------------

const isHeading = l => /^#{1,6}\s/.test(l);
const isListItem = l => /^\s*([-*+]|\d+[.)])(\s|$)/.test(l);

// Surround ATX headings with one blank line (MD022). Blank runs were already
// collapsed, so checking the immediate neighbour avoids creating doubles.
function headingBlanks(lines) {
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && isHeading(line)) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(line);
      const next = lines[i + 1];
      if (next !== undefined && next !== '') out.push('');
      continue;
    }
    out.push(line);
  }
  return out;
}

// Blank line around top-level fenced code blocks (MD031) and around lists
// (MD032). Never inserts a blank between two list items — that would turn a
// tight list loose and change the rendered output.
function blockBlanks(lines) {
  const out = [];
  let inFence = false;
  let fenceIndent = 0;
  let inList = false;
  const last = () => (out.length ? out[out.length - 1] : '');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
      if (!inFence) {
        // Opening a top-level fence right after content: separate it.
        if (indent === 0 && !inList && out.length > 0 && last() !== '') out.push('');
        fenceIndent = indent;
      } else if (fenceIndent === 0 && !inList) {
        // Closing a top-level fence — flag so the next non-blank gets a gap.
        out.push(line);
        inFence = false;
        if (lines[i + 1] !== undefined && !isBlank(lines[i + 1])) out.push('');
        continue;
      }
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    if (isBlank(line)) {
      out.push(line);
      continue;
    }

    const item = isListItem(line);
    const indented = /^\s+\S/.test(line);
    if (!inList) {
      if (item) {
        if (out.length > 0 && last() !== '') out.push(''); // blank before list
        inList = true;
      }
      out.push(line);
    } else if (item || indented) {
      out.push(line); // still inside the list (new item or continuation)
    } else {
      if (last() !== '') out.push(''); // blank after list
      inList = false;
      out.push(line);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------

// Collapse 2+ blanks to one (fence-aware), trim leading/trailing blanks, end
// with exactly one newline.
function finalize(lines) {
  const out = [];
  let inFence = false;
  let blankRun = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      blankRun = 0;
      continue;
    }
    if (!inFence && isBlank(line)) {
      blankRun += 1;
      if (blankRun > 1) continue;
      out.push('');
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

export default function tidyMarkdown(text) {
  let lines = text.split('\n');
  lines = lineCleanup(lines);
  lines = renumberOrdered(lines);
  lines = reflowTables(lines);
  lines = headingBlanks(lines);
  lines = blockBlanks(lines);
  return finalize(lines);
}
