# Markdown plugin smoke test

Covers all `markdown-it-*` plugins still in deps (untouched this round, but worth a regression pass).

## Abbreviations (markdown-it-abbr)

The HTML spec is defined by the W3C and WHATWG.

*[HTML]: HyperText Markup Language
*[W3C]: World Wide Web Consortium
*[WHATWG]: Web Hypertext Application Technology Working Group

Expected: dotted underline under each; tooltip on hover.

## Definition list (markdown-it-deflist)

Term 1
:   Definition of term 1
:   A second definition

Term 2
:   Definition of term 2

## Footnotes (markdown-it-footnote)

Here is a sentence with a footnote.[^1] Another one.[^second]

[^1]: First footnote body.
[^second]: Named footnote, also works.

## Marked text (markdown-it-mark)

This is ==highlighted text==.

## Sub / super (markdown-it-sub / sup)

Water: H~2~O. Einstein: E = mc^2^.

## Emoji (markdown-it-emoji)

:tada: :rocket: :warning: :lock: :white_check_mark:

## Task list

- [x] Security headers
- [x] DOMPurify
- [x] Mermaid 11
- [ ] Vue 3 migration

## Image with size (markdown-it-imsize shim)

![placeholder =80x80](https://placehold.co/80)

## Fenced code + Prism highlighting

```javascript
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userInput, { FORBID_ATTR: ['onerror'] });
document.getElementById('out').innerHTML = clean;
```

```python
def add(a: int, b: int) -> int:
    return a + b
```

```bash
npm audit --omit=dev
```

## Table with alignment

| left | center | right |
|:-----|:------:|------:|
| a    |   b    |     c |
| 1    |   2    |     3 |

## Blockquote + nested list

> - outer
>   - nested
>     - deep
> - back to outer
