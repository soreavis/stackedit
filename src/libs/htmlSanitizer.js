import DOMPurify from 'dompurify';

const ALLOWED_URI_SCHEMES = /^(https?|ftp|mailto|tel|file|blob):/i;
const ALLOWED_IMG_URI_SCHEMES = /^((https?|ftp|file|blob):|data:image\/)/i;

const urlParsingNode = window.document.createElement('a');
function sanitizeUri(uri, isImage) {
  const regex = isImage ? ALLOWED_IMG_URI_SCHEMES : ALLOWED_URI_SCHEMES;
  urlParsingNode.setAttribute('href', uri);
  const normalized = urlParsingNode.href;
  if (normalized !== '' && !regex.test(normalized)) {
    return `unsafe:${normalized}`;
  }
  return uri;
}

// StackEdit historically allowed iframes (for YouTube) and a wide SVG set.
// Preserve that while delegating actual parsing to DOMPurify.
const ADD_TAGS = ['iframe'];
const ADD_ATTR = [
  'allowfullscreen', 'frameborder', 'scrolling',
  'target', 'align', 'valign', 'cite',
  'xmlns', 'xmlns:xlink', 'xlink:href',
];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('target') && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IFRAME') {
    node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    ADD_TAGS,
    ADD_ATTR,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: false },
    FORBID_TAGS: ['style', 'script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}

export default {
  sanitizeHtml,
  sanitizeUri,
};
