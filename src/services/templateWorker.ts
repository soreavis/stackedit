// Web Worker that runs user-supplied Handlebars templates in a sandboxed
// context. Loaded via Vite's ?worker suffix. Handlebars carries its own
// types since v4.7+ — the surface used here (registerHelper, compile,
// SafeString) is fully typed.
// This WebWorker provides a safe environment to run user scripts
// See http://stackoverflow.com/questions/10653809/making-webworkers-a-safe-environment/10796616

import Handlebars from 'handlebars';

interface TocItem {
  level: number;
  anchor?: string;
  title?: string;
  children?: TocItem[];
}

// Classeur own helpers
Handlebars.registerHelper('tocToHtml', (toc: TocItem[], depth: number = 6) => {
  function arrayToHtml(arr: TocItem[] | undefined): string {
    if (!arr || !arr.length || arr[0].level > depth) {
      return '';
    }
    const ulHtml = arr.map((item: TocItem) => {
      let result = '<li>';
      if (item.anchor && item.title) {
        result += `<a href="#${item.anchor}">${item.title}</a>`;
      }
      result += arrayToHtml(item.children);
      return `${result}</li>`;
    }).join('\n');
    return `\n<ul>\n${ulHtml}\n</ul>\n`;
  }
  return new Handlebars.SafeString(arrayToHtml(toc));
});

const whiteList = {
  self: 1,
  onmessage: 1,
  postMessage: 1,
  global: 1,
  whiteList: 1,
  eval: 1,
  Array: 1,
  Boolean: 1,
  Date: 1,
  Function: 1,
  Number: 1,
  Object: 1,
  RegExp: 1,
  String: 1,
  Error: 1,
  EvalError: 1,
  RangeError: 1,
  ReferenceError: 1,
  SyntaxError: 1,
  TypeError: 1,
  URIError: 1,
  decodeURI: 1,
  decodeURIComponent: 1,
  encodeURI: 1,
  encodeURIComponent: 1,
  isFinite: 1,
  isNaN: 1,
  parseFloat: 1,
  parseInt: 1,
  Infinity: 1,
  JSON: 1,
  Math: 1,
  NaN: 1,
  undefined: 1,
  safeEval: 1,
  close: 1,
};

 
let global = self;
while (global !== Object.prototype) {
  Object.getOwnPropertyNames(global).forEach((prop) => {  
    if (!Object.prototype.hasOwnProperty.call(whiteList, prop)) {
      try {
        Object.defineProperty(global, prop, {
          get() {
            throw new Error(`Security Exception: cannot access ${prop}`);
          },
          configurable: false,
        });
      } catch (e) {
        // Ignore
      }
    }
  });
  global = Object.getPrototypeOf(global);
}
(self as any).Handlebars = Handlebars;

function safeEval(code: string): void {
  // eslint-disable-next-line no-eval
  eval(`"use strict";\n${code}`);
}

self.onmessage = (evt) => {
  try {
    const template = Handlebars.compile(evt.data[0]);
    const context = evt.data[1];
    safeEval(evt.data[2]);
    self.postMessage([null, template(context)]);
  } catch (err) {
    self.postMessage([`${err}`]);
  }
  close();
};
