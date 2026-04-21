// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/extensionSvc.js', () => ({
  default: { onGetOptions: () => {}, onSectionPreview: () => {} },
}));
vi.mock('../../../src/services/utils.js', () => ({
  default: { uid: () => 'test-uid' },
}));

const { __test__ } = await import('../../../src/extensions/mermaidExtension.js');
const {
  addLightboxButton,
  closeLightbox,
  serializeSvg,
  diagramFilename,
  replaceForeignObjectsWithText,
} = __test__;

const mkWrapperWithSvg = () => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="10" height="10"/></svg>';
  document.body.appendChild(wrapper);
  // happy-dom doesn't implement getBBox — stub it so fit-to-viewport code
  // has something to work with.
  const svg = wrapper.querySelector('svg');
  svg.getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  return wrapper;
};

const getOverlay = () => document.querySelector('.mermaid-lightbox-overlay');

beforeEach(() => {
  closeLightbox();
  document.body.innerHTML = '';
});

describe('mermaid rendered-diagram action buttons', () => {
  it('adds an enlarge button; adds a copy button only when source is provided', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'flowchart TD\n  A-->B');
    const actions = wrapper.querySelector('.mermaid-wrapper-actions');
    expect(actions).toBeTruthy();
    expect(actions.querySelectorAll('.mermaid-action-btn').length).toBe(2);
    expect(wrapper.querySelector('[aria-label="Enlarge diagram"]')).toBeTruthy();
    expect(wrapper.querySelector('[aria-label="Copy diagram source"]')).toBeTruthy();
  });

  it('omits copy button when no source is passed', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper);
    expect(wrapper.querySelector('[aria-label="Copy diagram source"]')).toBeNull();
    expect(wrapper.querySelector('[aria-label="Enlarge diagram"]')).toBeTruthy();
  });

  it('no-op when wrapper has no SVG', () => {
    const wrapper = document.createElement('div');
    addLightboxButton(wrapper, 'src');
    expect(wrapper.querySelector('.mermaid-wrapper-actions')).toBeNull();
  });

  it('wrapper copy button writes source to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mkWrapperWithSvg();
    const src = 'flowchart TD\n  A-->B';
    addLightboxButton(wrapper, src);
    const btn = wrapper.querySelector('[aria-label="Copy diagram source"]');
    btn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(src);
  });
});

describe('mermaid lightbox open/close', () => {
  it('clicking enlarge opens an overlay with a cloned SVG', () => {
    const wrapper = mkWrapperWithSvg();
    const originalSvg = wrapper.querySelector('svg');
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();

    const overlay = getOverlay();
    expect(overlay).toBeTruthy();
    const cloned = overlay.querySelector('svg');
    expect(cloned).toBeTruthy();
    expect(cloned).not.toBe(originalSvg);
    // Width/height attributes are preserved so the browser can measure the
    // clone at its natural CSS-pixel size before we apply fit-to-viewport.
    expect(wrapper.contains(originalSvg)).toBe(true);
  });

  it('closes on Escape', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    expect(getOverlay()).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(getOverlay()).toBeNull();
  });

  it('closes on close-button click', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    getOverlay().querySelector('[aria-label="Close"]').click();
    expect(getOverlay()).toBeNull();
  });

  it('opening a new lightbox replaces the previous one', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    expect(document.querySelectorAll('.mermaid-lightbox-overlay').length).toBe(1);
  });
});

describe('mermaid lightbox pan + zoom', () => {
  it('wheel scroll updates the SVG transform', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    const overlay = getOverlay();
    const cloneSvg = overlay.querySelector('svg');
    const before = cloneSvg.style.transform;

    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    wheel.deltaY = -100;
    wheel.clientX = 200;
    wheel.clientY = 200;
    overlay.dispatchEvent(wheel);

    expect(cloneSvg.style.transform).not.toBe('');
    expect(cloneSvg.style.transform).not.toBe(before);
  });

  it('zoom-in toolbar button changes transform', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    const overlay = getOverlay();
    const cloneSvg = overlay.querySelector('svg');
    const before = cloneSvg.style.transform;

    overlay.querySelector('[aria-label="Zoom in"]').click();
    expect(cloneSvg.style.transform).not.toBe(before);
  });

  it('reset button restores the initial transform', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    const overlay = getOverlay();
    const cloneSvg = overlay.querySelector('svg');
    const initial = cloneSvg.style.transform;

    overlay.querySelector('[aria-label="Zoom in"]').click();
    expect(cloneSvg.style.transform).not.toBe(initial);
    overlay.querySelector('[aria-label="Reset view"]').click();
    expect(cloneSvg.style.transform).toBe(initial);
  });

  it('dragging updates pan offsets', () => {
    const wrapper = mkWrapperWithSvg();
    addLightboxButton(wrapper, 'src');
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    const overlay = getOverlay();
    const cloneSvg = overlay.querySelector('svg');
    const before = cloneSvg.style.transform;

    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 140 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(cloneSvg.style.transform).not.toBe(before);
    expect(overlay.classList.contains('mermaid-lightbox-overlay--dragging')).toBe(false);
  });
});

describe('mermaid lightbox toolbar copy', () => {
  it('toolbar Copy button writes source to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mkWrapperWithSvg();
    const src = 'sequenceDiagram\n  A->>B: hi';
    addLightboxButton(wrapper, src);
    wrapper.querySelector('[aria-label="Enlarge diagram"]').click();
    const copyBtn = getOverlay().querySelector('[aria-label="Copy diagram source"]');
    expect(copyBtn).toBeTruthy();
    copyBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(src);
  });
});

describe('mermaid export helpers', () => {
  const mkSvgWithViewBox = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 200 100');
    svg.setAttribute('width', '100%');
    svg.setAttribute('style', 'max-width: 200px;');
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', '50');
    rect.setAttribute('height', '30');
    svg.appendChild(rect);
    document.body.appendChild(svg);
    return svg;
  };

  it('diagramFilename produces a timestamped name with the requested extension', () => {
    const name = diagramFilename('svg');
    expect(name).toMatch(/^mermaid-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.svg$/);
    expect(diagramFilename('png')).toMatch(/\.png$/);
  });

  it('serializeSvg emits an XML prolog + namespace-qualified SVG', () => {
    const svg = mkSvgWithViewBox();
    const out = serializeSvg(svg);
    expect(out.startsWith('<?xml version="1.0"')).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('<rect');
  });

  it('serializeSvg pins width/height to viewBox dims and strips inline style', () => {
    const svg = mkSvgWithViewBox();
    const out = serializeSvg(svg);
    expect(out).toContain('width="200"');
    expect(out).toContain('height="100"');
    expect(out).not.toContain('max-width');
  });

  it('serializeSvg does not mutate the source node', () => {
    const svg = mkSvgWithViewBox();
    const beforeStyle = svg.getAttribute('style');
    const beforeWidth = svg.getAttribute('width');
    serializeSvg(svg);
    expect(svg.getAttribute('style')).toBe(beforeStyle);
    expect(svg.getAttribute('width')).toBe(beforeWidth);
  });

  it('replaceForeignObjectsWithText swaps <foreignObject> for an SVG <text> of its text', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const fo = document.createElementNS(ns, 'foreignObject');
    fo.setAttribute('x', '10');
    fo.setAttribute('y', '20');
    fo.setAttribute('width', '100');
    fo.setAttribute('height', '40');
    fo.textContent = '  Hello World  ';
    svg.appendChild(fo);

    replaceForeignObjectsWithText(svg);

    expect(svg.querySelector('foreignObject')).toBeNull();
    const text = svg.querySelector('text');
    expect(text).toBeTruthy();
    expect(text.textContent).toBe('Hello World');
    expect(parseFloat(text.getAttribute('x'))).toBe(60);
    expect(text.getAttribute('text-anchor')).toBe('middle');
    expect(text.querySelectorAll('tspan').length).toBe(1);
  });

  it('replaceForeignObjectsWithText preserves <br>-separated lines as <tspan>s', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const svg = document.createElementNS(ns, 'svg');
    const fo = document.createElementNS(ns, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '200');
    fo.setAttribute('height', '60');
    // Simulate mermaid's htmlLabels output: <b>header</b><br/>subtitle
    const div = document.createElementNS(xhtml, 'div');
    const b = document.createElementNS(xhtml, 'b');
    b.textContent = '1. DNS zone';
    const br = document.createElementNS(xhtml, 'br');
    const txt = document.createTextNode('internal.coevera.com');
    div.appendChild(b);
    div.appendChild(br);
    div.appendChild(txt);
    fo.appendChild(div);
    svg.appendChild(fo);

    replaceForeignObjectsWithText(svg);

    const text = svg.querySelector('text');
    const tspans = text.querySelectorAll('tspan');
    expect(tspans.length).toBe(2);
    expect(tspans[0].textContent).toBe('1. DNS zone');
    expect(tspans[1].textContent).toBe('internal.coevera.com');
    expect(tspans[1].getAttribute('dy')).toBe('16');
    // Both tspans anchor at the same x (center) for proper alignment
    expect(tspans[0].getAttribute('x')).toBe(tspans[1].getAttribute('x'));
  });

  it('replaceForeignObjectsWithText treats block-level <div>/<p> children as line breaks', () => {
    const ns = 'http://www.w3.org/2000/svg';
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const svg = document.createElementNS(ns, 'svg');
    const fo = document.createElementNS(ns, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '100');
    fo.setAttribute('height', '60');
    const wrapper = document.createElementNS(xhtml, 'div');
    const p1 = document.createElementNS(xhtml, 'p');
    p1.textContent = 'Line one';
    const p2 = document.createElementNS(xhtml, 'p');
    p2.textContent = 'Line two';
    wrapper.appendChild(p1);
    wrapper.appendChild(p2);
    fo.appendChild(wrapper);
    svg.appendChild(fo);

    replaceForeignObjectsWithText(svg);

    const tspans = svg.querySelectorAll('tspan');
    expect(tspans.length).toBe(2);
    expect(tspans[0].textContent).toBe('Line one');
    expect(tspans[1].textContent).toBe('Line two');
  });
});
