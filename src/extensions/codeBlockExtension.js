import extensionSvc from '../services/extensionSvc';

// -------- Styles (injected once) --------

const STYLES = `
.code-block-wrapper { position: relative; }
.code-block-copy {
  position: absolute;
  top: 6px;
  right: 6px;
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
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  z-index: 1;
}
.code-block-wrapper:hover .code-block-copy,
.code-block-copy:focus { opacity: 1; }
.code-block-copy:hover { background: #fff; }
.code-block-copy.is-success { color: #1b8c1b; border-color: #1b8c1b; }
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = STYLES;
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

// -------- Copy button injection --------

function addCopyButton(preElt, codeElt) {
  if (preElt.$hasCodeCopyBtn) return;
  ensureStyles();
  preElt.classList.add('code-block-wrapper');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'code-block-copy';
  btn.textContent = '⧉';
  btn.title = 'Copy code';
  btn.setAttribute('aria-label', 'Copy code');
  btn.addEventListener('click', async (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const ok = await copyText(codeElt.textContent);
    if (ok) flashSuccess(btn, '⧉');
  });

  preElt.appendChild(btn);
  preElt.$hasCodeCopyBtn = true;
}

extensionSvc.onSectionPreview((elt) => {
  elt.querySelectorAll('pre > code.prism').cl_each((codeElt) => {
    if (codeElt.classList.contains('language-mermaid')) return;
    addCopyButton(codeElt.parentNode, codeElt);
  });
});

export const __test__ = {
  copyText,
  flashSuccess,
  addCopyButton,
};
