# YAML / front-matter smoke test (js-yaml 4.1.0)

This exercises the `js-yaml safeLoad → load` migration across File Properties and Settings.

## File properties dialog — paste into the "YAML" tab

Open the doc, right-click → **File properties** → YAML tab. Paste:

```yaml
extensions:
  katex:
    enabled: true
  mermaid:
    enabled: true
  emoji:
    enabled: true
    emojiShortcuts: false
  markdown:
    breaks: true
    linkify: true
    typographer: true
    table: true
    fence: true
  preset: commonmark
author: Test Author
date: 2026-04-16
tags:
  - security
  - dompurify
  - mermaid-11
metadata:
  description: "Quote handling test: it's a \"test\""
  nested:
    deeply:
      ok: true
```

Expected:
- No error in the dialog.
- Toggling to the "Simple" tab and back should keep the structure.
- `metadata.description` should preserve the single + escaped double quotes.

## Settings (Custom settings) — Menu → Settings → Custom settings

Paste the default-ish set:

```yaml
editor:
  showGutter: true
  scrollSync: true
  maxWidth: 990
  tabSize: 4
newFileContent: "\n\n\n> Empty file placeholder.\n"
shortcuts:
  bold: "Mod+B"
  italic: "Mod+I"
emoji:
  emojiShortcuts: true
```

Expected: no syntax error flag under the editor. Close — edit reopens — values persist.

## Broken YAML — should surface a parse error

```yaml
author: unterminated "quote
list:
  - ok
 - bad indent
```

Expected: StackEdit shows "YAML parse error" (or similar) in the dialog; saving is blocked until fixed. **Never** a blank screen or uncaught exception in the console.
