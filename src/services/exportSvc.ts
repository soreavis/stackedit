import FileSaver from 'file-saver';
// Vite resolves `./templateWorker` to .ts via resolve.extensions. The
// previous explicit `.js` was kept around for the original .js file —
// drop it now that the worker source is .ts.
import TemplateWorker from './templateWorker?worker';
import localDbSvc from './localDbSvc';
import markdownConversionSvc from './markdownConversionSvc';
import extensionSvc from './extensionSvc';
import utils from './utils';
import store from '../store';
import htmlSanitizer from '../libs/htmlSanitizer';

interface Heading {
  title: string;
  anchor: string;
  level: number;
  children: Heading[];
}

interface Template {
  value: string;
  helpers: string;
}

function groupHeadings(headings: Heading[], level = 1): Heading[] {
  const result: Heading[] = [];
  let currentItem: Heading | undefined;

  function pushCurrentItem() {
    if (currentItem) {
      if (currentItem.children.length > 0) {
        currentItem.children = groupHeadings(currentItem.children, level + 1);
      }
      result.push(currentItem);
    }
  }
  headings.forEach((heading) => {
    if (heading.level !== level) {
      currentItem = currentItem || ({ children: [] } as unknown as Heading);
      currentItem.children.push(heading);
    } else {
      pushCurrentItem();
      currentItem = heading;
    }
  });
  pushCurrentItem();
  return result;
}

const containerElt = document.createElement('div');
containerElt.className = 'hidden-rendering-container';
document.body.appendChild(containerElt);

export default {
  /**
   * Apply the template to the file content
   */
  async applyTemplate(
    fileId: string,
    template: Template = {
      value: '{{{files.0.content.text}}}',
      helpers: '',
    },
    pdf = false,
  ): Promise<string> {
    const file = store.state.file.itemsById[fileId];
    const content = await localDbSvc.loadItem(`${fileId}/content`);
    const properties = utils.computeProperties(content.properties);
    const options = extensionSvc.getOptions(properties);
    const converter = (markdownConversionSvc as any).createConverter(options, true);
    const parsingCtx = (markdownConversionSvc as any).parseSections(converter, content.text);
    const conversionCtx = (markdownConversionSvc as any).convert(parsingCtx);
    const html = conversionCtx.htmlSectionList.map(htmlSanitizer.sanitizeHtml).join('');
    containerElt.innerHTML = html;
    // Await async extension rendering (e.g. mermaid) so the exported
    // innerHTML contains finished SVG instead of the original code fence.
    await extensionSvc.sectionPreview(containerElt, options, false);

    // Strip mermaid interactive controls (copy/enlarge buttons) from exports.
    (containerElt.querySelectorAll('.mermaid-wrapper-actions') as any).cl_each((actionsElt: HTMLElement) => {
      actionsElt.parentNode?.removeChild(actionsElt);
    });

    // Unwrap tables
    (containerElt.querySelectorAll('.table-wrapper') as any).cl_each((wrapperElt: HTMLElement) => {
      while (wrapperElt.firstChild) {
        wrapperElt.parentNode!.insertBefore(wrapperElt.firstChild, wrapperElt.nextSibling);
      }
      wrapperElt.parentNode!.removeChild(wrapperElt);
    });

    // Make TOC
    const headings: Heading[] = (containerElt.querySelectorAll('h1,h2,h3,h4,h5,h6') as any)
      .cl_map((headingElt: HTMLElement) => ({
        title: headingElt.textContent || '',
        anchor: headingElt.id,
        level: parseInt(headingElt.tagName.slice(1), 10),
        children: [],
      }));
    const toc = groupHeadings(headings);
    const view = {
      pdf,
      files: [{
        name: file.name,
        content: {
          text: content.text,
          properties,
          yamlProperties: content.properties,
          html: containerElt.innerHTML,
          toc,
        },
      }],
    };
    containerElt.innerHTML = '';

    // Run template conversion in a Worker to prevent attacks from helpers
    const worker = new TemplateWorker();
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error('Template generation timeout.'));
      }, 10000);
      worker.addEventListener('message', (e: MessageEvent) => {
        clearTimeout(timeoutId);
        worker.terminate();
        // e.data can contain unsafe data if helpers attempts to call postMessage
        const [err, result] = e.data as [unknown, unknown];
        if (err) {
          reject(new Error(`${err}`));
        } else {
          resolve(`${result}`);
        }
      });
      worker.postMessage([template.value, view, template.helpers]);
    });
  },

  /**
   * Export a file to disk.
   */
  async exportToDisk(fileId: string, type: string, template?: Template): Promise<void> {
    const file = store.state.file.itemsById[fileId];
    const html = await this.applyTemplate(fileId, template);
    const blob = new Blob([html], {
      type: 'text/plain;charset=utf-8',
    });
    FileSaver.saveAs(blob, `${file.name}.${type}`);
  },
};
