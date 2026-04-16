function parseNextNumber(str, pos, max) {
  let code;
  const start = pos;
  code = str.charCodeAt(pos);
  while ((pos < max && code >= 0x30 && code <= 0x39) || code === 0x25) {
    code = str.charCodeAt(++pos);
  }
  return { ok: true, pos, value: str.slice(start, pos) };
}

function parseImageSize(str, pos, max) {
  const result = { ok: false, pos: 0, width: '', height: '' };
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

function imageWithSize(md) {
  return function image(state, silent) {
    let attrs;
    let code;
    let label;
    let labelEnd;
    let labelStart;
    let pos;
    let ref;
    let res;
    let title;
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
      res = md.helpers.parseLinkDestination(state.src, pos, state.posMax);
      if (res.ok) {
        href = state.md.normalizeLink(res.str);
        if (state.md.validateLink(href)) {
          pos = res.pos;
        } else {
          href = '';
        }
      }

      start = pos;
      for (; pos < max; pos += 1) {
        code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }

      res = md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
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
            width = res.width;
            height = res.height;
            pos = res.pos;
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
      if (typeof state.env.references === 'undefined') return false;
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
      ref = state.env.references[md.utils.normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title;
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;
      tokens = [];
      const newState = new state.md.inline.State(
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

export default function imsizePlugin(md) {
  md.inline.ruler.before('emphasis', 'image', imageWithSize(md));
}
