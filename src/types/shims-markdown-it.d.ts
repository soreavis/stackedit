// markdown-it plugins that ship no type declarations. They're used only as
// `md.use(plugin)` and carry no API surface we type against, so an opaque
// module declaration is sufficient (and keeps strict noImplicitAny happy).
declare module 'markdown-it-emoji';
declare module 'markdown-it-abbr';
declare module 'markdown-it-deflist';
declare module 'markdown-it-footnote';
declare module 'markdown-it-mark';
declare module 'markdown-it-sub';
declare module 'markdown-it-sup';
