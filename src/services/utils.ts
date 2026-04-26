// Heterogeneous helper bag (yaml, marker offsets, hashing). Typed
// loosely with `any` at boundaries — full shapes would require shared
// content/discussion types out of scope for this pass.
import yaml from 'js-yaml';
import presets from '../data/presets';
import constants from '../data/constants';

// For utils.uid()
const uidLength = 16;
const crypto: Crypto = (window as any).crypto || (window as any).msCrypto;
const alphabet: string[] = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const radix = alphabet.length;
const array = new Uint32Array(uidLength);

// For utils.parseQueryParams()
const parseQueryParams = (params: string): any => {
  const result: any = {};
  params.split('&').forEach((param: string) => {
    const [key, value] = param.split('=').map(decodeURIComponent);
    if (key && value != null) {
      result[key] = value;
    }
  });
  return result;
};

// For utils.setQueryParams()
const filterParams = (params: any = {}): any => {
  const result: any = {};
  Object.entries(params).forEach(([key, value]) => {
    if (key && value != null) {
      result[key] = value;
    }
  });
  return result;
};

// For utils.computeProperties()
const deepOverride = (obj: any, opt: any): any => {
  if (obj === undefined) {
    return opt;
  }
  const objType = Object.prototype.toString.call(obj);
  const optType = Object.prototype.toString.call(opt);
  if (objType !== optType) {
    return obj;
  }
  if (objType !== '[object Object]') {
    return opt === undefined ? obj : opt;
  }
  Object.keys({
    ...obj,
    ...opt,
  }).forEach((key: string) => {
    obj[key] = deepOverride(obj[key], opt[key]);
  });
  return obj;
};

// For utils.addQueryParams()
const urlParser = document.createElement('a');

const deepCopy = (obj: any): any => {
  if (obj == null) {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj));
};

// Compute presets
const computedPresets: any = {};
Object.keys(presets).forEach((key: string) => {
  let preset = deepCopy((presets as any)[key][0]);
  if ((presets as any)[key][1]) {
    preset = deepOverride(preset, (presets as any)[key][1]);
  }
  computedPresets[key] = preset;
});

export default {
  computedPresets,
  queryParams: parseQueryParams(window.location.hash.slice(1)) as any,
  setQueryParams(params: any = {}): void {
    this.queryParams = filterParams(params);
    const serializedParams = Object.entries(this.queryParams).map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value as any)}`).join('&');
    const hash = `#${serializedParams}`;
    if (window.location.hash !== hash) {
      window.location.replace(hash);
    }
  },
  sanitizeText(text: any): string {
    const result = `${text || ''}`.slice(0, (constants as any).textMaxLength);
    // last char must be a `\n`.
    return `${result}\n`.replace(/\n\n$/, '\n');
  },
  sanitizeName(name: any): string {
    return `${name || ''}`
      // Keep only 250 characters
      .slice(0, 250) || (constants as any).defaultName;
  },
  sanitizeFilename(name: any): string {
    return this.sanitizeName(`${name || ''}`
      // Replace `/`, control characters and other kind of spaces with a space
      .replace(/[/\x00-\x1F\x7f-\xa0\s]+/g, ' ') // eslint-disable-line no-control-regex
      .trim()) || (constants as any).defaultName;
  },
  deepCopy,
  serializeObject(obj: any): any {
    return obj === undefined ? obj : JSON.stringify(obj, (key: string, value: any) => {
      if (Object.prototype.toString.call(value) !== '[object Object]') {
        return value;
      }
      // Sort keys to have a predictable result
      return Object.keys(value).sort().reduce((sorted: any, valueKey: string) => {
        sorted[valueKey] = value[valueKey];
        return sorted;
      }, {});
    });
  },
  search(items: any[], criteria: any): any {
    let result: any;
    items.some((item: any) => {
      // If every field fits the criteria
      if (Object.entries(criteria).every(([key, value]) => value === item[key])) {
        result = item;
      }
      return result;
    });
    return result;
  },
  uid(): string {
    crypto.getRandomValues(array);
    // Note: Uint32Array.map returns a Uint32Array, which would coerce
    // the string callback result back to 0. Array.from produces a
    // regular string[].
    return Array.from(array, (value: number) => alphabet[value % radix]).join('');
  },
  hash(str: any): number {
    // https://stackoverflow.com/a/7616484/1333165
    let hash = 0;
    if (!str) return hash;
    for (let i = 0; i < str.length; i += 1) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash;
  },
  getItemHash(item: any): number {
    return this.hash(this.serializeObject({
      ...item,
      // These properties must not be part of the hash
      id: undefined,
      hash: undefined,
      history: undefined,
    }));
  },
  addItemHash(item: any): any {
    return {
      ...item,
      hash: this.getItemHash(item),
    };
  },
  makeWorkspaceId(params: any): string {
    return Math.abs(this.hash(this.serializeObject(params))).toString(36);
  },
  getDbName(workspaceId: string): string {
    let dbName = 'stackedit-db';
    if (workspaceId !== 'main') {
      dbName += `-${workspaceId}`;
    }
    return dbName;
  },
  encodeBase64(str: string, urlSafe: boolean = false): string {
    const uriEncodedStr = encodeURIComponent(str);
    const utf8Str = uriEncodedStr.replace(
      /%([0-9A-F]{2})/g,
      (match: string, p1: string) => String.fromCharCode(`0x${p1}` as any),
    );
    const result = btoa(utf8Str);
    if (!urlSafe) {
      return result;
    }
    return result
      .replace(/\//g, '_') // Replace `/` with `_`
      .replace(/\+/g, '-') // Replace `+` with `-`
      .replace(/=+$/, ''); // Remove trailing `=`
  },
  decodeBase64(str: string): string {
    // In case of URL safe base64
    const sanitizedStr = str.replace(/_/g, '/').replace(/-/g, '+');
    const utf8Str = atob(sanitizedStr);
    const uriEncodedStr = utf8Str
      .split('')
      .map((c: string) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join('');
    return decodeURIComponent(uriEncodedStr);
  },
  computeProperties(yamlProperties: any): any {
    let properties: any = {};
    try {
      properties = yaml.load(yamlProperties) || {};
    } catch (e) {
      // Ignore
    }
    const extensions = properties.extensions || {};
    const computedPreset = deepCopy(computedPresets[extensions.preset] || computedPresets.default);
    const computedExtensions = deepOverride(computedPreset, properties.extensions);
    computedExtensions.preset = extensions.preset;
    properties.extensions = computedExtensions;
    return properties;
  },
  randomize(value: number): number {
    return Math.floor((1 + (Math.random() * 0.2)) * value);
  },
  setInterval(func: () => any, interval: number): any {
    return setInterval(() => func(), this.randomize(interval));
  },
  async awaitSequence(values: any[], asyncFunc: (val: any) => Promise<any>): Promise<any[]> {
    const results: any[] = [];
    const valuesLeft = values.slice().reverse();
    const runWithNextValue = async (): Promise<any[]> => {
      if (!valuesLeft.length) {
        return results;
      }
      results.push(await asyncFunc(valuesLeft.pop()));
      return runWithNextValue();
    };
    return runWithNextValue();
  },
  async awaitSome(asyncFunc: () => Promise<any>): Promise<any> {
    if (await asyncFunc()) {
      return this.awaitSome(asyncFunc);
    }
    return null;
  },
  someResult(values: any[], func: (val: any) => any): any {
    let result: any;
    values.some((value: any) => {
      result = func(value);
      return result;
    });
    return result;
  },
  parseQueryParams,
  addQueryParams(url: string = '', params: any = {}, hash: boolean = false): string {
    const keys = Object.keys(params).filter((key: string) => params[key] != null);
    urlParser.href = url;
    if (!keys.length) {
      return urlParser.href;
    }
    const serializedParams = keys.map((key: string) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
    if (hash) {
      if (urlParser.hash) {
        urlParser.hash += '&';
      } else {
        urlParser.hash = '#';
      }
      urlParser.hash += serializedParams;
    } else {
      if (urlParser.search) {
        urlParser.search += '&';
      } else {
        urlParser.search = '?';
      }
      urlParser.search += serializedParams;
    }
    return urlParser.href;
  },
  resolveUrl(baseUrl: string, path: string): string {
    const oldBaseElt = document.getElementsByTagName('base')[0];
    const oldHref = oldBaseElt && oldBaseElt.href;
    const newBaseElt = oldBaseElt || document.head.appendChild(document.createElement('base'));
    newBaseElt.href = baseUrl;
    urlParser.href = path;
    const result = urlParser.href;
    if (oldBaseElt) {
      oldBaseElt.href = oldHref;
    } else {
      document.head.removeChild(newBaseElt);
    }
    return result;
  },
  getHostname(url: string): string {
    urlParser.href = url;
    return urlParser.hostname;
  },
  encodeUrlPath(path: string): string {
    return path ? path.split('/').map(encodeURIComponent).join('/') : '';
  },
  parseGithubRepoUrl(url: any): any {
    const parsedRepo = url && url.match(/([^/:]+)\/([^/]+?)(?:\.git|\/)?$/);
    return parsedRepo && {
      owner: parsedRepo[1],
      repo: parsedRepo[2],
    };
  },
  parseGitlabProjectPath(url: any): any {
    const parsedProject = url && url.match(/^https:\/\/[^/]+\/(.+?)(?:\.git|\/)?$/);
    return parsedProject && parsedProject[1];
  },
  createHiddenIframe(url: string): HTMLIFrameElement {
    const iframeElt = document.createElement('iframe');
    iframeElt.style.position = 'absolute';
    iframeElt.style.left = '-99px';
    iframeElt.style.width = '1px';
    iframeElt.style.height = '1px';
    iframeElt.src = url;
    return iframeElt;
  },
  wrapRange(range: any, eltProperties: any): void {
    const rangeLength = `${range}`.length;
    let wrappedLength = 0;
    const treeWalker = document
      .createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let { startOffset } = range;
    treeWalker.currentNode = range.startContainer;
    if (treeWalker.currentNode.nodeType === Node.TEXT_NODE || treeWalker.nextNode()) {
      do {
        if (treeWalker.currentNode.nodeValue !== '\n') {
          if (treeWalker.currentNode === range.endContainer &&
            range.endOffset < (treeWalker.currentNode.nodeValue as string).length
          ) {
            (treeWalker.currentNode as Text).splitText(range.endOffset);
          }
          if (startOffset) {
            treeWalker.currentNode = (treeWalker.currentNode as Text).splitText(startOffset);
            startOffset = 0;
          }
          const elt: any = document.createElement('span');
          Object.entries(eltProperties).forEach(([key, value]) => {
            elt[key] = value;
          });
          (treeWalker.currentNode.parentNode as Node).insertBefore(elt, treeWalker.currentNode);
          elt.appendChild(treeWalker.currentNode);
        }
        wrappedLength += (treeWalker.currentNode.nodeValue as string).length;
        if (wrappedLength >= rangeLength) {
          break;
        }
      }
      while (treeWalker.nextNode());
    }
  },
  unwrapRange(eltCollection: any): void {
    Array.prototype.slice.call(eltCollection).forEach((elt: any) => {
      // Loop in case another wrapper has been added inside
      for (let child = elt.firstChild; child; child = elt.firstChild) {
        if (child.nodeType === 3) {
          if (elt.previousSibling && elt.previousSibling.nodeType === 3) {
            child.nodeValue = elt.previousSibling.nodeValue + child.nodeValue;
            elt.parentNode.removeChild(elt.previousSibling);
          }
          if (!child.nextSibling && elt.nextSibling && elt.nextSibling.nodeType === 3) {
            child.nodeValue += elt.nextSibling.nodeValue;
            elt.parentNode.removeChild(elt.nextSibling);
          }
        }
        elt.parentNode.insertBefore(child, elt);
      }
      elt.parentNode.removeChild(elt);
    });
  },
};
