import { chromium } from 'playwright';

const pageFormats = new Set(['A3', 'A4', 'Legal', 'Letter']);

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

const parseQuery = (url) => {
  const q = new URL(url, 'http://x').searchParams;
  let options = {};
  try { options = JSON.parse(q.get('options') || '{}'); } catch {}
  return options;
};

const px = (v, fallback) => {
  const n = parseInt(v, 10);
  return `${Number.isNaN(n) ? fallback : n}px`;
};

let browserPromise;
const getBrowser = () => {
  if (!browserPromise) {
    browserPromise = chromium.launch();
    process.on('exit', () => {
      browserPromise.then((b) => b.close()).catch(() => {});
    });
  }
  return browserPromise;
};

const headerFooterTpl = (left, center, right, fontName, fontSize) => {
  if (!left && !center && !right) return '';
  const style = `font-family:${fontName || 'Arial'};font-size:${fontSize || 9}px;width:100%;padding:0 12px;display:flex;justify-content:space-between;`;
  return `<div style="${style}"><span>${left || ''}</span><span>${center || ''}</span><span>${right || ''}</span></div>`;
};

export async function pdfHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  let browser;
  let page;
  try {
    const html = await readBody(req);
    const options = parseQuery(req.url);

    browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const headerTemplate = headerFooterTpl(
      options.headerLeft, options.headerCenter, options.headerRight,
      options.headerFontName, options.headerFontSize,
    );
    const footerTemplate = headerFooterTpl(
      options.footerLeft, options.footerCenter, options.footerRight,
      options.footerFontName, options.footerFontSize,
    );

    const pdf = await page.pdf({
      format: pageFormats.has(options.pageSize) ? options.pageSize : 'A4',
      margin: {
        top: px(options.marginTop, 25),
        right: px(options.marginRight, 25),
        bottom: px(options.marginBottom, 25),
        left: px(options.marginLeft, 25),
      },
      printBackground: true,
      displayHeaderFooter: !!(headerTemplate || footerTemplate),
      headerTemplate: headerTemplate || '<div></div>',
      footerTemplate: footerTemplate || '<div></div>',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error('[pdf]', err);
    res.statusCode = 500;
    res.end('pdf_failed');
  } finally {
    if (page) await page.close().catch(() => {});
  }
}
