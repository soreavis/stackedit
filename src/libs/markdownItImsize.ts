// In-tree port of `markdown-it-imsize`: extends the default image rule to
// recognize `![alt](url =WIDTHxHEIGHT)` syntax (note the space before `=`)
// and emit `width` / `height` HTML attributes accordingly. Width-only
// (`=300x`) and height-only (`=x150`) variants are both supported.
import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

interface NumberParseResult {
  ok: boolean;
  pos: number;
  value: string;
}

function parseNextNumber(str: string, posIn: number, max: number): NumberParseResult {
  let pos = posIn;
  const start = pos;
  let code = str.charCodeAt(pos);
  while ((pos < max && code >= 0x30 && code <= 0x39) || code === 0x25) {
    pos += 1;
    code = str.charCodeAt(pos);
  }
  return { ok: true, pos, value: str.slice(start, pos) };
}

interface ImageSizeParseResult {
  ok: boolean;
  pos: number;
  width: string;
  height: string;
}

function parseImageSize(str: string, posIn: number, max: number): ImageSizeParseResult {
  const result: ImageSizeParseResult = { ok: false, pos: 0, width: '', height: '' };
  let pos = posIn;
  if (pos >= max) return result;
  let code = str.charCodeAt(pos);
  if (code !== 0x3d) return result;
  pos += 1;
  code = str.charCodeAt(pos);
  if (code !== 0x78 && (code < 0x30 || code > 0x39)) return result;
  const resultW = parseNextNumber(str, pos, max);
  pos = resultW.pos;
  code = str.charCodeAt(pos);
  if (code !== 0x78) return result;
  pos += 1;
  const resultH = parseNextNumber(str, pos, max);
  pos = resultH.pos;
  result.width = resultW.value;
  result.height = resultH.value;
  result.pos = pos;
  result.ok = true;
  return result;
}

function imageWithSize(md: MarkdownIt) {
  return function image(state: StateInline, silent: boolean): boolean {
    let attrs: Array<[string, string]>;
    let code: number;
    let label: string | undefined;
    let labelEnd: number;
    let labelStart: number;
    let pos: number;
    let ref: { href: string; title?: string } | undefined;
    let res: { ok?: boolean; pos?: number; str?: string };
    let title = '';
    let width = '';
    let height = '';
    let token;
    let tokens;
    let start;
    let href = '';
    const oldPos = state.pos;
    const max = state.posMax;

    if (state.src.charCodeAt(state.pos) !== 0x21) return false;
    if (state.src.charCodeAt(state.pos + 1) !== 0x5b) return false;

    labelStart = state.pos + 2;
    labelEnd = md.helpers.parseLinkLabel(state, state.pos + 1, false);
    if (labelEnd < 0) return false;

    pos = labelEnd + 1;
    if (pos < max && state.src.charCodeAt(pos) === 0x28) {
      pos += 1;
      for (; pos < max; pos += 1) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }
      if (pos >= max) return false;

      start = pos;
      const linkRes = md.helpers.parseLinkDestination(state.src, pos, state.posMax) as {
        ok: boolean; pos: number; str: string;
      };
      if (linkRes.ok) {
        href = state.md.normalizeLink(linkRes.str);
        if (state.md.validateLink(href)) {
          pos = linkRes.pos;
        } else {
          href = '';
        }
      }

      start = pos;
      for (; pos < max; pos += 1) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }

      const titleRes = md.helpers.parseLinkTitle(state.src, pos, state.posMax) as {
        ok: boolean; pos: number; str: string;
      };
      if (pos < max && start !== pos && titleRes.ok) {
        title = titleRes.str;
        pos = titleRes.pos;
        for (; pos < max; pos += 1) {
          code = state.src.charCodeAt(pos);
          if (code !== 0x20 && code !== 0x0a) break;
        }
      } else {
        title = '';
      }

      if (pos - 1 >= 0) {
        code = state.src.charCodeAt(pos - 1);
        if (code === 0x20) {
          res = parseImageSize(state.src, pos, state.posMax);
          if (res.ok) {
            const sizeRes = res as ImageSizeParseResult;
            width = sizeRes.width;
            height = sizeRes.height;
            pos = sizeRes.pos;
            for (; pos < max; pos += 1) {
              code = state.src.charCodeAt(pos);
              if (code !== 0x20 && code !== 0x0a) break;
            }
          }
        }
      }

      if (pos >= max || state.src.charCodeAt(pos) !== 0x29) {
        state.pos = oldPos;
        return false;
      }
      pos += 1;
    } else {
      const env = state.env as { references?: Record<string, { href: string; title?: string }> };
      if (typeof env.references === 'undefined') return false;
      for (; pos < max; pos += 1) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }
      if (pos < max && state.src.charCodeAt(pos) === 0x5b) {
        start = pos + 1;
        pos = md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) {
          label = state.src.slice(start, pos);
          pos += 1;
        } else {
          pos = labelEnd + 1;
        }
      } else {
        pos = labelEnd + 1;
      }
      if (!label) label = state.src.slice(labelStart, labelEnd);
      ref = env.references[md.utils.normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title || '';
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;
      tokens = [];
      // markdown-it's inline State has a constructor on the public API even
      // though the typings don't always expose it cleanly — cast the access
      // path to keep this surgical.
      const InlineState = (state.md.inline as unknown as {
        State: new (src: string, md: MarkdownIt, env: unknown, tokens: unknown[]) => StateInline;
      }).State;
      const newState = new InlineState(
        state.src.slice(labelStart, labelEnd),
        state.md,
        state.env,
        tokens,
      );
      newState.md.inline.tokenize(newState);

      token = state.push('image', 'img', 0);
      attrs = [['src', href], ['alt', '']];
      token.attrs = attrs;
      token.children = tokens;
      if (title) attrs.push(['title', title]);
      if (width !== '') attrs.push(['width', width]);
      if (height !== '') attrs.push(['height', height]);
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  };
}

export default function imsizePlugin(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'image', imageWithSize(md));
}
