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
.mermaid-wrapper { position: relative; }
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
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  font-family: inherit;
}
.mermaid-action-btn:hover { background: #fff; }
.mermaid-action-btn.is-success { color: #1b8c1b; border-color: #1b8c1b; }

.mermaid-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  overflow: hidden;
  user-select: none;
  cursor: grab;
}
.mermaid-lightbox-overlay--dragging { cursor: grabbing; }
.mermaid-lightbox-overlay svg {
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
  background: rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  backdrop-filter: blur(8px);
}
.mermaid-lightbox-tool {
  min-width: 36px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}
.mermaid-lightbox-tool:hover { background: rgba(255, 255, 255, 0.3); }
.mermaid-lightbox-tool.is-success { background: rgba(50, 180, 80, 0.5); }
.mermaid-lightbox-close {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  background: #fff;
  color: #222;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Arial, sans-serif;
  font-size: 26px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  transition: background 0.1s, color 0.1s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mermaid-lightbox-close svg { display: block; }
.mermaid-lightbox-close:hover {
  background: #e53935;
  color: #fff;
  border-color: #e53935;
  transform: scale(1.05);
}
.mermaid-lightbox-close:focus-visible {
  outline: 2px solid #39f;
  outline-offset: 2px;
}
.mermaid-lightbox-hint {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  backdrop-filter: blur(8px);
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
  // Keep mermaid's intrinsic width/height so the browser can render the SVG
  // at its natural CSS-pixel size before we measure and scale it.
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
  // Inline SVG × — pixel-exact centering regardless of font metrics.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const closeIcon = document.createElementNS(SVG_NS, 'svg');
  closeIcon.setAttribute('viewBox', '0 0 24 24');
  closeIcon.setAttribute('width', '22');
  closeIcon.setAttribute('height', '22');
  closeIcon.setAttribute('aria-hidden', 'true');
  const mkLine = (x1, y1, x2, y2) => {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', 'currentColor');
    l.setAttribute('stroke-width', '2.5');
    l.setAttribute('stroke-linecap', 'round');
    return l;
  };
  closeIcon.appendChild(mkLine(6, 6, 18, 18));
  closeIcon.appendChild(mkLine(18, 6, 6, 18));
  closeBtn.appendChild(closeIcon);
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

  // Measure the SVG's natural rendered size (CSS pixels) AFTER it is in the
  // DOM but BEFORE any transform is applied. This is the correct unit for
  // fit-to-viewport math — SVG internal coordinates (getBBox) would be wrong
  // whenever viewBox scaling differs from 1:1.
  const vw = overlay.clientWidth || window.innerWidth;
  const vh = overlay.clientHeight || window.innerHeight;
  const rect = clone.getBoundingClientRect();
  const attrW = parseFloat(clone.getAttribute('width')) || 0;
  const attrH = parseFloat(clone.getAttribute('height')) || 0;
  const svgW = rect.width || attrW || 400;
  const svgH = rect.height || attrH || 300;

  // Fit-to-viewport with a ~2.5% gutter on each side.
  const fitScale = Math.min(vw / svgW, vh / svgH) * 0.95;
  const initialPanX = (vw - svgW * fitScale) / 2;
  const initialPanY = (vh - svgH * fitScale) / 2;
  let scale = fitScale;
  let panX = initialPanX;
  let panY = initialPanY;

  const apply = () => {
    clone.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
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

  // Toolbar: zoom in, zoom out, reset, copy-source
  toolbar.appendChild(mkToolBtn('+', 'Zoom in', () => zoomCenter(1.25)));
  toolbar.appendChild(mkToolBtn('−', 'Zoom out', () => zoomCenter(0.8)));
  toolbar.appendChild(mkToolBtn('⤾', 'Reset view', resetView));
  if (sourceText) {
    const copyBtn = mkToolBtn('Copy', 'Copy diagram source', async (btn) => {
      const ok = await copyText(sourceText);
      if (ok) flashSuccess(btn, 'Copy');
    });
    toolbar.appendChild(copyBtn);
  }

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

const render = async (elt) => {
  try {
    const source = elt.textContent; // Capture before innerHTML wipes it.
    const mermaid = await getMermaid();
    const svgId = `mermaid-svg-${utils.uid()}`;
    const { svg } = await mermaid.render(svgId, source);
    elt.innerHTML = svg;
    addLightboxButton(elt, source);
  } catch (e) {
    console.error(e);
  }
};

extensionSvc.onGetOptions((options, properties) => {
  options.mermaid = properties.extensions.mermaid.enabled;
});

extensionSvc.onSectionPreview((elt) => {
  elt.querySelectorAll('.prism.language-mermaid')
    .cl_each(diagramElt => render(diagramElt.parentNode));
});

export const __test__ = {
  openLightbox,
  closeLightbox,
  addLightboxButton,
  copyText,
};
