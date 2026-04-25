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

