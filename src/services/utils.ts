// Cross-cutting helpers — yaml settings overlay, marker hashing, query
// params, base64, DOM range wrappers. Free-form payloads (yaml objects,
// search criteria, item hash inputs) keep `unknown` annotations and
// narrow at the call site.
import yaml from 'js-yaml';
import presets from '../data/presets';
import constants from '../data/constants';

// For utils.uid()
const uidLength = 16;
const crypto: Crypto = window.crypto || (window as unknown as { msCrypto: Crypto }).msCrypto;
const alphabet: string[] = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const radix = alphabet.length;
const array = new Uint32Array(uidLength);

type QueryParams = Record<string, string>;

// For utils.parseQueryParams()
const parseQueryParams = (params: string): QueryParams => {
  const result: QueryParams = {};
  params.split('&').forEach((param: string) => {
    const [key, value] = param.split('=').map(decodeURIComponent);
    if (key && value != null) {
      result[key] = value;
    }
  });
  return result;
};

// For utils.setQueryParams()
const filterParams = (params: Record<string, unknown> = {}): QueryParams => {
  const result: QueryParams = {};
  Object.entries(params).forEach(([key, value]) => {
    if (key && value != null) {
      result[key] = String(value);
    }
  });
  return result;
};

// For utils.computeProperties() — recursive overlay; objects merge by
// key, primitives prefer the override, type mismatches keep the base.
const deepOverride = (obj: unknown, opt: unknown): unknown => {
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
  const o = obj as Record<string, unknown>;
  const p = opt as Record<string, unknown>;
  Object.keys({
    ...o,
    ...p,
  }).forEach((key: string) => {
    o[key] = deepOverride(o[key], p[key]);
  });
  return o;
};

// For utils.addQueryParams()
const urlParser = document.createElement('a');

function deepCopy<T>(obj: T): T {
  if (obj == null) {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj));
}

// Compute presets
const computedPresets: Record<string, unknown> = {};
const presetsMap = presets as unknown as Record<string, [unknown, unknown?]>;
Object.keys(presetsMap).forEach((key) => {
  let preset = deepCopy(presetsMap[key][0]);
  if (presetsMap[key][1]) {
    preset = deepOverride(preset, presetsMap[key][1]);
  }
  computedPresets[key] = preset;
});

interface Constants {
  textMaxLength: number;
  defaultName: string;
  [key: string]: unknown;
}
const consts = constants as Constants;

interface Item {
  id?: string;
  hash?: number;
  history?: unknown;
  [key: string]: unknown;
}

export default {
  computedPresets,
  queryParams: parseQueryParams(window.location.hash.slice(1)) as QueryParams,
  setQueryParams(params: Record<string, unknown> = {}): void {
    this.queryParams = filterParams(params);
    const serializedParams = Object.entries(this.queryParams).map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const hash = `#${serializedParams}`;
    if (window.location.hash !== hash) {
      window.location.replace(hash);
    }
  },
  sanitizeText(text: unknown): string {
    const result = `${text || ''}`.slice(0, consts.textMaxLength);
    // last char must be a `\n`.
    return `${result}\n`.replace(/\n\n$/, '\n');
  },
  sanitizeName(name: unknown): string {
    return `${name || ''}`
      // Keep only 250 characters
      .slice(0, 250) || consts.defaultName;
  },
  sanitizeFilename(name: unknown): string {
    return this.sanitizeName(`${name || ''}`
      // Replace `/`, control characters and other kind of spaces with a space
      .replace(/[/\x00-\x1F\x7f-\xa0\s]+/g, ' ') // eslint-disable-line no-control-regex
      .trim()) || consts.defaultName;
  },
  deepCopy,
  serializeObject(obj: unknown): string | undefined {
    return obj === undefined ? undefined : JSON.stringify(obj, (_key: string, value: unknown) => {
      if (Object.prototype.toString.call(value) !== '[object Object]') {
        return value;
      }
      // Sort keys to have a predictable result
      const v = value as Record<string, unknown>;
      return Object.keys(v).sort().reduce((sorted: Record<string, unknown>, valueKey: string) => {
        sorted[valueKey] = v[valueKey];
        return sorted;
      }, {});
    });
  },
  search<T extends Record<string, unknown>>(items: T[], criteria: Record<string, unknown>): T | undefined {
    let result: T | undefined;
    items.some((item) => {
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
  hash(str: string | undefined | null): number {
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
  getItemHash(item: Item): number {
    return this.hash(this.serializeObject({
      ...item,
      // These properties must not be part of the hash
      id: undefined,
      hash: undefined,
      history: undefined,
    }));
  },
  addItemHash<T extends Item>(item: T): T & { hash: number } {
    return {
      ...item,
      hash: this.getItemHash(item),
    };
  },
  makeWorkspaceId(params: Record<string, unknown>): string {
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
      (_match: string, p1: string) => String.fromCharCode(parseInt(p1, 16)),
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
  computeProperties(yamlProperties: string | undefined): Record<string, unknown> {
    let properties: Record<string, unknown> = {};
    try {
      properties = (yaml.load(yamlProperties || '') || {}) as Record<string, unknown>;
    } catch (e) {
      // Ignore
    }
    const extensions = (properties.extensions || {}) as Record<string, unknown>;
    const computedPreset = deepCopy(computedPresets[extensions.preset as string] || computedPresets.default);
    const computedExtensions = deepOverride(computedPreset, properties.extensions) as Record<string, unknown>;
    computedExtensions.preset = extensions.preset;
    properties.extensions = computedExtensions;
    return properties;
  },
  randomize(value: number): number {
    return Math.floor((1 + (Math.random() * 0.2)) * value);
  },
  setInterval(func: () => unknown, interval: number): ReturnType<typeof setInterval> {
    return setInterval(() => func(), this.randomize(interval));
  },
  async awaitSequence<T, R>(values: T[], asyncFunc: (val: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    const valuesLeft = values.slice().reverse();
    const runWithNextValue = async (): Promise<R[]> => {
      if (!valuesLeft.length) {
        return results;
      }
      results.push(await asyncFunc(valuesLeft.pop() as T));
      return runWithNextValue();
    };
    return runWithNextValue();
  },
  async awaitSome(asyncFunc: () => Promise<unknown>): Promise<null> {
    if (await asyncFunc()) {
      return this.awaitSome(asyncFunc);
    }
    return null;
  },
  someResult<T, R>(values: T[], func: (val: T) => R | undefined | null): R | undefined {
    let result: R | undefined;
    values.some((value) => {
      const ret = func(value);
      if (ret) {
        result = ret;
      }
      return result;
    });
    return result;
  },
  parseQueryParams,
  addQueryParams(url: string = '', params: Record<string, unknown> = {}, hash: boolean = false): string {
    const keys = Object.keys(params).filter((key: string) => params[key] != null);
    urlParser.href = url;
    if (!keys.length) {
      return urlParser.href;
    }
    const serializedParams = keys.map((key: string) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`).join('&');
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
  parseGithubRepoUrl(url: string | undefined | null): { owner: string; repo: string } | null {
    const parsedRepo = url && url.match(/([^/:]+)\/([^/]+?)(?:\.git|\/)?$/);
    return parsedRepo ? {
      owner: parsedRepo[1],
      repo: parsedRepo[2],
    } : null;
  },
  parseGitlabProjectPath(url: string | undefined | null): string | null {
    const parsedProject = url && url.match(/^https:\/\/[^/]+\/(.+?)(?:\.git|\/)?$/);
    return parsedProject ? parsedProject[1] : null;
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
  wrapRange(range: Range, eltProperties: Record<string, unknown>): void {
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
          const elt = document.createElement('span') as HTMLSpanElement & Record<string, unknown>;
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
  unwrapRange(eltCollection: ArrayLike<HTMLElement>): void {
    Array.prototype.slice.call(eltCollection).forEach((elt: HTMLElement) => {
      // Loop in case another wrapper has been added inside
      for (let child: ChildNode | null = elt.firstChild; child; child = elt.firstChild) {
        if (child.nodeType === 3) {
          if (elt.previousSibling && elt.previousSibling.nodeType === 3) {
            child.nodeValue = (elt.previousSibling.nodeValue || '') + (child.nodeValue || '');
            elt.parentNode!.removeChild(elt.previousSibling);
          }
          if (!child.nextSibling && elt.nextSibling && elt.nextSibling.nodeType === 3) {
            child.nodeValue = (child.nodeValue || '') + (elt.nextSibling.nodeValue || '');
            elt.parentNode!.removeChild(elt.nextSibling);
          }
        }
        elt.parentNode!.insertBefore(child, elt);
      }
      elt.parentNode!.removeChild(elt);
    });
  },
};
