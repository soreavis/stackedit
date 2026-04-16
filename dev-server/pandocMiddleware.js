import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outputFormats = {
  asciidoc: 'text/plain',
  context: 'application/x-latex',
  epub: 'application/epub+zip',
  epub3: 'application/epub+zip',
  latex: 'application/x-latex',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  rst: 'text/plain',
  rtf: 'application/rtf',
  textile: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const highlightStyles = new Set([
  'pygments', 'kate', 'monochrome', 'espresso', 'zenburn', 'haddock', 'tango',
]);

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

const parseQuery = (url) => new URL(url, 'http://x').searchParams;
const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const metaKeyRe = /^[A-Za-z0-9_-]{1,64}$/;

export async function pandocHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  let outputPath;
  try {
    const body = await readBody(req);
    const q = parseQuery(req.url);
    const requested = q.get('format') || 'pdf';
    const outputFormat = Object.prototype.hasOwnProperty.call(outputFormats, requested) ? requested : 'pdf';
    const options = safeJson(q.get('options'));
    const metadata = safeJson(q.get('metadata'));

    const dir = await mkdtemp(join(tmpdir(), 'stackedit-pandoc-'));
    outputPath = join(dir, `out.${outputFormat}`);

    const params = ['--pdf-engine=xelatex'];
    if (options.toc) params.push('--toc');
    const tocDepth = parseInt(options.tocDepth, 10);
    if (!Number.isNaN(tocDepth)) params.push('--toc-depth', String(tocDepth));
    const highlight = highlightStyles.has(options.highlightStyle) ? options.highlightStyle : 'kate';
    params.push('--highlight-style', highlight);
    for (const [k, v] of Object.entries(metadata)) {
      if (!metaKeyRe.test(k)) continue;
      const value = String(v).replace(/[\r\n]+/g, ' ');
      params.push('-M', `${k}=${value}`);
    }
    const target = outputFormat === 'pdf' ? 'latex' : outputFormat;
    params.push('-f', 'json', '-t', target, '-o', outputPath);

    let stderr = '';
    await new Promise((resolve, reject) => {
      const p = spawn('pandoc', params, { stdio: ['pipe', 'ignore', 'pipe'] });
      const timer = setTimeout(() => p.kill(), 60000);
      p.stderr.on('data', (d) => { stderr += d.toString(); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr || `pandoc exit ${code}`));
      });
      p.stdin.write(body);
      p.stdin.end();
    });

    const file = await readFile(outputPath);
    res.setHeader('Content-Type', outputFormats[outputFormat]);
    res.setHeader('Content-Length', file.length);
    res.end(file);
  } catch (err) {
    console.error('[pandoc]', err);
    res.statusCode = 500;
    res.end('pandoc_failed');
  } finally {
    if (outputPath) {
      unlink(outputPath).catch(() => {});
    }
  }
}
