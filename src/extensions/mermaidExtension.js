import extensionSvc from '../services/extensionSvc';
import utils from '../services/utils';

const config = {
  logLevel: 'fatal',
  startOnLoad: false,
  arrowMarkerAbsolute: false,
  theme: 'neutral',
  securityLevel: 'strict',
  flowchart: {
    htmlLabels: true,
    curve: 'linear',
    // Keep INSIDE-shape padding generous (32) — labels inside nodes and
    // subgraph titles both looked cramped at mermaid's defaults. But
    // rankSpacing controls the OUTSIDE gap between stacked nodes, which
    // was making vertical TB flowcharts feel sparse — pulled that back
    // in. nodeSpacing too, a touch.
    padding: 32,
    nodeSpacing: 50,
    rankSpacing: 30,
    diagramPadding: 16,
    subGraphTitleMargin: { top: 14, bottom: 14 },
  },
  sequence: {
    diagramMarginX: 50,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
    mirrorActors: true,
    bottomMarginAdj: 1,
    useMaxWidth: true,
  },
  gantt: {
    titleTopMargin: 25,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    leftPadding: 75,
    gridLineStartPadding: 35,
    fontSize: 11,
    fontFamily: '"Open-Sans", "sans-serif"',
    numberSectionStyles: 4,
    axisFormat: '%Y-%m-%d',
  },
};

let mermaidPromise = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize(config);
      return m.default;
    });
  }
  return mermaidPromise;
}

// -------- Styles (injected once) --------

const LIGHTBOX_STYLES = `
.mermaid-wrapper { position: relative; text-align: center; }
.mermaid-wrapper > svg { display: inline-block; max-width: 100%; }
.mermaid-wrapper-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  z-index: 1;
}
.mermaid-wrapper:hover .mermaid-wrapper-actions,
.mermaid-wrapper-actions:focus-within { opacity: 1; }
.mermaid-action-btn {
  width: 35px;
  height: 35px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  font-family: inherit;
}
.mermaid-action-btn:hover { background: #fff; }
.mermaid-action-btn.is-success { color: #1b8c1b; border-color: #1b8c1b; }

.mermaid-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  overflow: hidden;
  user-select: none;
  cursor: grab;
}
.mermaid-lightbox-overlay--dragging { cursor: grabbing; }
.mermaid-lightbox-overlay--light { background: #fff; }
/* Direct-child selector: applies only to the enlarged diagram SVG, not
   to any icon SVGs inside toolbar/close buttons. Early iterations used
   a plain descendant selector here, which painted a white background
   onto the close button's child SVG and masked its contents. */
.mermaid-lightbox-overlay > svg {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  background: #fff;
  will-change: transform;
}
.mermaid-lightbox-toolbar {
  position: fixed;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 6px;
  padding: 6px;
  background: rgba(20, 20, 22, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
.mermaid-lightbox-tool {
  min-width: 36px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}
.mermaid-lightbox-tool:hover { background: rgba(255, 255, 255, 0.28); }
.mermaid-lightbox-tool.is-success { background: rgba(50, 180, 80, 0.6); }
.mermaid-lightbox-close {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.88);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
  padding-bottom: 4px;
  transition: background 0.1s;
}
.mermaid-lightbox-close:hover { background: rgba(40, 40, 44, 0.95); }
.mermaid-lightbox-close:focus-visible {
  outline: 2px solid #39f;
  outline-offset: 2px;
}
.mermaid-lightbox-close svg {
  display: block;
  pointer-events: none;
}
.mermaid-lightbox-hint {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  background: rgba(20, 20, 22, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
@media print {
  .mermaid-wrapper-actions { display: none !important; }
}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.setAttribute('data-mermaid-lightbox', '');
  style.textContent = LIGHTBOX_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// -------- Clipboard helper --------

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // Fall through to legacy path.
  }
  // Legacy fallback (works on HTTP pages and older browsers).
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function flashSuccess(btn, originalText) {
  btn.classList.add('is-success');
  btn.textContent = '✓';
  setTimeout(() => {
    btn.classList.remove('is-success');
    btn.textContent = originalText;
  }, 1200);
}

// -------- Export helpers (SVG + PNG) --------

// Build a portable, self-contained SVG string from the rendered diagram.
// Mermaid already inlines its fonts and styles via a <style> child, so no
// external fetches are needed — the resulting file opens in any viewer.
function serializeSvg(sourceSvg) {
  const clone = sourceSvg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  // Strip any layout styles the lightbox may have set on the live node.
  clone.removeAttribute('style');
  const vb = sourceSvg.viewBox && sourceSvg.viewBox.baseVal;
  if (vb && vb.width && vb.height) {
    // Pin intrinsic dimensions so external viewers render at a sane size.
    clone.setAttribute('width', vb.width);
    clone.setAttribute('height', vb.height);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so the browser has time to dispatch the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function diagramFilename(ext) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `mermaid-${stamp}.${ext}`;
}

function exportSvg(sourceSvg) {
  const svgText = serializeSvg(sourceSvg);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, diagramFilename('svg'));
}

// Drawing an SVG containing <foreignObject> onto a <canvas> taints the canvas
// (browsers treat foreignObject content as a potential cross-origin vector),
// so `canvas.toBlob()` throws SecurityError. Mermaid's flowchart labels live
// in foreignObject → we replace each with a plain SVG <text> of the same
// label text before rasterizing. Visual fidelity drops slightly (no bold/
// italic emphasis) but the node labels — including multi-line breaks — are
// preserved, which is what matters for a PNG export.

// Walk a foreignObject DOM and produce the label text as an array of lines,
// splitting on <br> elements and block-level children (<div>, <p>).
function extractLabelLines(root) {
  const lines = [];
  let current = '';
  const push = () => {
    const trimmed = current.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
    current = '';
  };
  const walk = (node) => {
    if (node.nodeType === 3) { // Node.TEXT_NODE
      current += node.textContent;
      return;
    }
    if (node.nodeType !== 1) return; // Non-element, non-text: skip.
    const tag = node.tagName.toUpperCase();
    if (tag === 'BR') {
      push();
      return;
    }
    const isBlock = tag === 'P' || tag === 'DIV';
    if (isBlock) push();
    node.childNodes.forEach(walk);
    if (isBlock) push();
  };
  walk(root);
  push();
  return lines.length ? lines : [''];
}

function replaceForeignObjectsWithText(svg) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LINE_HEIGHT = 16;
  const FONT_SIZE = 14;
  const foreignObjects = svg.querySelectorAll('foreignObject');
  foreignObjects.forEach((fo) => {
    const x = parseFloat(fo.getAttribute('x')) || 0;
    const y = parseFloat(fo.getAttribute('y')) || 0;
    const w = parseFloat(fo.getAttribute('width')) || 0;
    const h = parseFloat(fo.getAttribute('height')) || 0;
    const lines = extractLabelLines(fo);

    const cx = x + w / 2;
    // Vertically center the block of lines inside the foreignObject's box.
    const blockHeight = lines.length * LINE_HEIGHT;
    const firstBaselineY = y + h / 2 - blockHeight / 2 + LINE_HEIGHT * 0.8;

    const replacement = document.createElementNS(SVG_NS, 'text');
    replacement.setAttribute('x', cx);
    replacement.setAttribute('y', firstBaselineY);
    replacement.setAttribute('text-anchor', 'middle');
    replacement.setAttribute('font-family', '"trebuchet ms", verdana, arial, sans-serif');
    replacement.setAttribute('font-size', String(FONT_SIZE));
    replacement.setAttribute('fill', '#000');

    lines.forEach((line, i) => {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', cx);
      if (i > 0) tspan.setAttribute('dy', String(LINE_HEIGHT));
      tspan.textContent = line;
      replacement.appendChild(tspan);
    });

    fo.parentNode.replaceChild(replacement, fo);
  });
  return svg;
}

async function exportPng(sourceSvg, _sourceText, scale = 3) {
  let svgForExport = sourceSvg;
  if (sourceSvg.querySelector('foreignObject')) {
    // Work on a disposable clone; don't mutate the live preview SVG.
    svgForExport = sourceSvg.cloneNode(true);
    replaceForeignObjectsWithText(svgForExport);
  }

  const vb = svgForExport.viewBox && svgForExport.viewBox.baseVal;
  const naturalW = (vb && vb.width) || svgForExport.clientWidth || 400;
  const naturalH = (vb && vb.height) || svgForExport.clientHeight || 300;

  const svgText = serializeSvg(svgForExport);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image load failed'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(naturalW * scale);
    canvas.height = Math.round(naturalH * scale);
    const ctx = canvas.getContext('2d');
    // Opaque white background — diagrams are designed against white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    downloadBlob(pngBlob, diagramFilename('png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// -------- Lightbox (pan + zoom) --------

let activeOverlay = null;
let activeCleanup = null;

function closeLightbox() {
  if (!activeOverlay) return;
  if (activeCleanup) activeCleanup();
  activeOverlay.remove();
  document.removeEventListener('keydown', onEsc, true);
  activeOverlay = null;
  activeCleanup = null;
}

function onEsc(evt) {
  if (evt.key === 'Escape') {
    evt.stopPropagation();
    closeLightbox();
  }
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function openLightbox(sourceSvg, sourceText) {
  if (!sourceSvg) return;
  ensureStyles();
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.className = 'mermaid-lightbox-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Enlarged diagram');

  const clone = sourceSvg.cloneNode(true);
  // Strip mermaid's own sizing hints. It emits `width="100%"` plus an inline
  // `style="max-width: <natural>px"` which, left in place, clamps our
  // style.width on zoom → diagram can't grow past its intrinsic size. We
  // drive layout entirely from style.width / style.height ourselves.
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.removeAttribute('style');
  overlay.appendChild(clone);

  // Toolbar (top-left)
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-lightbox-toolbar';
  overlay.appendChild(toolbar);

  const mkToolBtn = (label, ariaLabel, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mermaid-lightbox-tool';
    b.textContent = label;
    b.setAttribute('aria-label', ariaLabel);
    b.title = ariaLabel;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(b);
    });
    b.addEventListener('mousedown', e => e.stopPropagation());
    return b;
  };

  // Close button (top-right, separate from toolbar so it stays anchored)
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mermaid-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  // Text × — same approach as the toolbar buttons, which render reliably.
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    closeLightbox();
  });
  closeBtn.addEventListener('mousedown', e => e.stopPropagation());
  overlay.appendChild(closeBtn);

  // Hint strip
  const hint = document.createElement('div');
  hint.className = 'mermaid-lightbox-hint';
  hint.textContent = 'Drag to pan · Scroll to zoom · Double-click to reset · Esc to close';
  overlay.appendChild(hint);

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Natural SVG size = viewBox dimensions. That's what we treat as "100%"
  // for fit-to-viewport math and for scaling on zoom. Reading viewBox is
  // more reliable than measuring the rendered box, since a freshly-stripped
  // SVG with no width/height defaults to a browser-chosen size.
  const vw = overlay.clientWidth || window.innerWidth;
  const vh = overlay.clientHeight || window.innerHeight;
  const vb = sourceSvg.viewBox && sourceSvg.viewBox.baseVal;
  const fallbackRect = sourceSvg.getBoundingClientRect();
  const svgW = (vb && vb.width) || fallbackRect.width || 400;
  const svgH = (vb && vb.height) || fallbackRect.height || 300;

  // Fit-to-viewport with a ~2.5% gutter on each side.
  const fitScale = Math.min(vw / svgW, vh / svgH) * 0.95;
  const initialPanX = (vw - svgW * fitScale) / 2;
  const initialPanY = (vh - svgH * fitScale) / 2;
  let scale = fitScale;
  let panX = initialPanX;
  let panY = initialPanY;

  // Resize the SVG via its layout width/height (native vector re-layout at
  // every zoom) instead of `transform: scale()` (which rasterizes first and
  // then scales the bitmap — pixelated at high zoom). `transform: translate`
  // is kept for pan only, since translation doesn't rasterize.
  const apply = () => {
    clone.style.width = `${svgW * scale}px`;
    clone.style.height = `${svgH * scale}px`;
    clone.style.transform = `translate(${panX}px, ${panY}px)`;
  };
  apply();

  const zoomAt = (cx, cy, factor) => {
    const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    const k = newScale / scale;
    panX = cx - (cx - panX) * k;
    panY = cy - (cy - panY) * k;
    scale = newScale;
    apply();
  };

  const zoomCenter = (factor) => {
    zoomAt(overlay.clientWidth / 2, overlay.clientHeight / 2, factor);
  };

  const resetView = () => {
    scale = fitScale;
    panX = initialPanX;
    panY = initialPanY;
    apply();
  };

  // Toolbar: zoom in, zoom out, reset, toggle background, copy-source, export
  toolbar.appendChild(mkToolBtn('+', 'Zoom in', () => zoomCenter(1.25)));
  toolbar.appendChild(mkToolBtn('−', 'Zoom out', () => zoomCenter(0.8)));
  toolbar.appendChild(mkToolBtn('⤾', 'Reset view', resetView));
  const bgBtn = mkToolBtn('☀', 'Toggle background (light / dark)', (btn) => {
    const isLight = overlay.classList.toggle('mermaid-lightbox-overlay--light');
    btn.textContent = isLight ? '☾' : '☀';
    btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  });
  bgBtn.setAttribute('aria-pressed', 'false');
  toolbar.appendChild(bgBtn);
  if (sourceText) {
    const copyBtn = mkToolBtn('⧉', 'Copy diagram source', async (btn) => {
      const ok = await copyText(sourceText);
      if (ok) flashSuccess(btn, '⧉');
    });
    toolbar.appendChild(copyBtn);
  }
  toolbar.appendChild(mkToolBtn('SVG', 'Download as SVG', (btn) => {
    try {
      exportSvg(sourceSvg);
      flashSuccess(btn, 'SVG');
    } catch (e) {
      console.error('SVG export failed:', e);
    }
  }));
  toolbar.appendChild(mkToolBtn('PNG', 'Download as PNG (3×)', async (btn) => {
    try {
      await exportPng(sourceSvg, sourceText, 3);
      flashSuccess(btn, 'PNG');
    } catch (e) {
      console.error('PNG export failed:', e);
    }
  }));

  // Wheel zoom (cursor-anchored). exp-of-deltaY gives mouse wheels ~5%/tick
  // and trackpads sub-percent increments — smooth on both.
  const onWheel = (evt) => {
    evt.preventDefault();
    const rectOverlay = overlay.getBoundingClientRect();
    const cx = evt.clientX - rectOverlay.left;
    const cy = evt.clientY - rectOverlay.top;
    const factor = Math.exp(-evt.deltaY * 0.0008);
    zoomAt(cx, cy, factor);
  };
  overlay.addEventListener('wheel', onWheel, { passive: false });

  // Drag pan
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  const onDown = (evt) => {
    if (evt.button !== 0) return;
    // Don't pan when grabbing a toolbar/close button (their listeners stopProp).
    dragging = true;
    startX = evt.clientX;
    startY = evt.clientY;
    startPanX = panX;
    startPanY = panY;
    overlay.classList.add('mermaid-lightbox-overlay--dragging');
  };
  const onMove = (evt) => {
    if (!dragging) return;
    panX = startPanX + (evt.clientX - startX);
    panY = startPanY + (evt.clientY - startY);
    apply();
  };
  const onUp = () => {
    dragging = false;
    overlay.classList.remove('mermaid-lightbox-overlay--dragging');
  };
  overlay.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // Double-click the SVG to reset
  clone.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    resetView();
  });

  activeCleanup = () => {
    overlay.removeEventListener('wheel', onWheel);
    overlay.removeEventListener('mousedown', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('keydown', onEsc, true);
  closeBtn.focus();
}

// -------- Per-diagram action buttons (enlarge + copy) --------

function addLightboxButton(wrapperElt, sourceText) {
  const svg = wrapperElt.querySelector('svg');
  if (!svg) return;
  ensureStyles();
  wrapperElt.classList.add('mermaid-wrapper');

  const actions = document.createElement('div');
  actions.className = 'mermaid-wrapper-actions';

  if (sourceText) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mermaid-action-btn';
    copyBtn.textContent = '⧉';
    copyBtn.setAttribute('aria-label', 'Copy diagram source');
    copyBtn.title = 'Copy source';
    copyBtn.addEventListener('click', async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const ok = await copyText(sourceText);
      if (ok) flashSuccess(copyBtn, '⧉');
    });
    actions.appendChild(copyBtn);
  }

  const enlargeBtn = document.createElement('button');
  enlargeBtn.type = 'button';
  enlargeBtn.className = 'mermaid-action-btn';
  enlargeBtn.textContent = '⤢';
  enlargeBtn.setAttribute('aria-label', 'Enlarge diagram');
  enlargeBtn.title = 'Enlarge';
  enlargeBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    openLightbox(svg, sourceText);
  });
  actions.appendChild(enlargeBtn);

  wrapperElt.appendChild(actions);
}

// -------- Render pipeline --------

// Extra horizontal padding for edge-label pills. Mermaid emits each edge
// label inside a foreignObject with a clip rect sized to the measured
// HTML content — so any CSS padding added after render gets clipped
// (see the earlier aborted attempt in commit 04c5176). Instead we widen
// the foreignObject itself + the companion labelBkg rect by EDGE_PAD
// and shift them by half that much to keep the label centered.
const EDGE_LABEL_PAD = 16;

function padEdgeLabels(svgEl) {
  if (!svgEl) return;
  svgEl.querySelectorAll('.edgeLabel foreignObject').forEach((fo) => {
    const w = parseFloat(fo.getAttribute('width'));
    const x = parseFloat(fo.getAttribute('x'));
    if (!Number.isFinite(w) || !Number.isFinite(x)) return;
    fo.setAttribute('width', `${w + EDGE_LABEL_PAD}`);
    fo.setAttribute('x', `${x - EDGE_LABEL_PAD / 2}`);
  });
  svgEl.querySelectorAll('.edgeLabels rect, .edgeLabel rect').forEach((rect) => {
    const w = parseFloat(rect.getAttribute('width'));
    const x = parseFloat(rect.getAttribute('x'));
    if (!Number.isFinite(w) || !Number.isFinite(x)) return;
    rect.setAttribute('width', `${w + EDGE_LABEL_PAD}`);
    rect.setAttribute('x', `${x - EDGE_LABEL_PAD / 2}`);
  });
}

const render = async (elt) => {
  try {
    const source = elt.textContent; // Capture before innerHTML wipes it.
    const mermaid = await getMermaid();
    const svgId = `mermaid-svg-${utils.uid()}`;
    const { svg } = await mermaid.render(svgId, source);
    elt.innerHTML = svg;
    padEdgeLabels(elt.querySelector('svg'));
    addLightboxButton(elt, source);
  } catch (e) {
    console.error(e);
  }
};

extensionSvc.onGetOptions((options, properties) => {
  options.mermaid = properties.extensions.mermaid.enabled;
});

extensionSvc.onSectionPreview((elt) => {
  const pending = [];
  elt.querySelectorAll('.prism.language-mermaid')
    .cl_each(diagramElt => pending.push(render(diagramElt.parentNode)));
  // Returned so export callers that await sectionPreview can see the
  // rendered SVG in innerHTML. Live preview just ignores the promise.
  return Promise.all(pending);
});

export const __test__ = {
  openLightbox,
  closeLightbox,
  addLightboxButton,
  copyText,
  serializeSvg,
  diagramFilename,
  replaceForeignObjectsWithText,
};
