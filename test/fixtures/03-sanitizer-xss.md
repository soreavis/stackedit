# Sanitizer / XSS smoke test (DOMPurify 3.4)

Paste into StackEdit. **None** of these should fire a JS alert, run a script, or load a tracking pixel. For every item, the preview should show either harmless rendered HTML or plain text. Open DevTools → Console — it should stay silent.

Reference: `src/libs/htmlSanitizer.js` (DOMPurify config).

## Direct script

<script>alert('pwned-script')</script>

Expected: `<script>` stripped entirely. No alert.

## Event handlers

<img src="x" onerror="alert('pwned-onerror')" alt="broken img">

<div onclick="alert('pwned-onclick')" onmouseover="alert('pwned-mouseover')">Hover or click me</div>

<button onfocus="alert('pwned-onfocus')" autofocus>focus-me</button>

Expected: elements render, all `on*` attributes removed.

## javascript: URI

<a href="javascript:alert('pwned-href')">CLICK ME</a>

Expected: href stripped (becomes a plain `<a>` or the link is inert).

## Data URI to HTML

<a href="data:text/html,<script>alert('pwned-data-html')</script>">data-link</a>

Expected: href stripped — `data:` is only allowed for `image/*` MIME.

## SVG with onload

<svg onload="alert('pwned-svg-onload')" width="30" height="30"><circle cx="15" cy="15" r="10" fill="red"/></svg>

Expected: SVG renders (red circle), `onload` stripped.

## Animated SVG with JS (should be blocked)

<svg><animate attributeName="href" to="javascript:alert('pwned-svg-animate')"/></svg>

Expected: nothing renders or renders harmlessly.

## Iframe — allowlisted

<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="320" height="180"></iframe>

Expected: YouTube iframe embeds. In rendered HTML (inspect element) it should have `sandbox="allow-scripts allow-same-origin allow-presentation"` and `referrerpolicy="no-referrer"` — added by the `afterSanitizeAttributes` hook.

## Iframe — untrusted origin (still allowed but sandboxed)

<iframe src="https://example.com"></iframe>

Expected: renders sandboxed; example.com blocks framing but no exploit occurs.

## Style injection

<style>body { background: red !important; }</style>

Expected: `<style>` tag stripped. Background should NOT turn red.

## CSS expression attack

<p style="background: url('javascript:alert(1)')">styled</p>

Expected: `style` attribute preserved but DOMPurify strips the javascript URL inside it.

## mXSS attempt (namespace confusion)

<svg><style><img src=x onerror=alert('pwned-mxss')>

Expected: malformed — nothing runs.

## Link with target=_blank — rel hook

<a href="https://example.com" target="_blank">example.com</a>

Expected: sanitizer auto-adds `rel="noopener noreferrer"`. Inspect the rendered element to confirm.

## Plain markdown still works

**bold**, *italic*, ~~strike~~, `code`, [link](https://example.com), ![img](https://placehold.co/80)

- list
- list

| a | b |
|---|---|
| 1 | 2 |

## Discussion comment XSS (hardest target — covered in earlier fix)

To test the CurrentDiscussion sanitizer, highlight any paragraph above, click the comment bubble, and add a comment whose body is:

```
<img src=x onerror="alert('pwned-comment')">Click
```

Then click the comment again. No alert should fire.
