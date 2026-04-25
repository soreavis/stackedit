// Type shims for non-typed deps and Vite-specific import suffixes used
// across the codebase. Keep this file flat — one declare per concern, no
// re-exports. Do NOT add `export {}` — that converts this file into a
// module and breaks the ambient module declarations below.

// Vite Worker import suffix (`./templateWorker.js?worker` etc.).
declare module '*?worker' {
  const workerCtor: {
    new (): Worker;
  };
  export default workerCtor;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const url: string;
  export default url;
}

// Untyped legacy deps. Tightening these is a follow-up.
declare module 'file-saver';
declare module 'bezier-easing';
declare module 'diff-match-patch';
declare module 'handlebars';
declare module 'js-yaml';
declare module 'tinykeys';
declare module 'abcjs';
declare module 'mermaid';
declare module 'prismjs';
declare module 'markdown-it';
declare module 'turndown/lib/turndown.browser.umd';

// clunderscore.js extends Array / NodeList / Function / Object prototypes
// with cl_each / cl_map / cl_some / cl_filter / cl_reduce / cl_bind /
// cl_extend. Top-level interface augments target the global scope when
// the file has no top-level imports/exports — keep it that way.
interface Array<T> {
  cl_each(cb: (item: T, idx?: number) => void): void;
  cl_map<U>(cb: (item: T, idx?: number) => U): U[];
  cl_some(cb: (item: T, idx?: number) => boolean): boolean;
  cl_filter(cb: (item: T, idx?: number) => boolean): T[];
  cl_reduce<U>(cb: (memo: U, item: T) => U, memo: U): U;
}
interface NodeList {
  cl_each(cb: (item: Node, idx?: number) => void): void;
  cl_map<U>(cb: (item: Node, idx?: number) => U): U[];
  cl_filter(cb: (item: Node, idx?: number) => boolean): Node[];
  cl_reduce<U>(cb: (memo: U, item: Node) => U, memo: U): U;
}
interface HTMLCollection {
  cl_each(cb: (item: Element, idx?: number) => void): void;
  cl_map<U>(cb: (item: Element, idx?: number) => U): U[];
}
interface CallableFunction {
  cl_bind(context: any, ...args: any[]): any;
}
// Object.prototype extension — every object gets cl_extend. Risky but
// matches runtime. Use sparingly.
interface Object {
  cl_extend(other: Record<string, unknown>): any;
}
