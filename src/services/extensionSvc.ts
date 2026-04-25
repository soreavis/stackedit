// Pub/sub registry that bridges the markdown converter pipeline with the
// extension modules under `src/extensions/`. Each phase has its own listener
// list — `getOptions` resolves per-file extension options, `initConverter`
// configures the markdown-it instance, `sectionPreview` post-processes the
// rendered DOM (mermaid, katex, abcjs, etc.).

type ExtensionOptions = Record<string, unknown>;

type GetOptionsListener = (
  options: ExtensionOptions,
  properties: unknown,
  isCurrentFile?: boolean,
) => void;

type InitConverterListener = (markdown: unknown, options: ExtensionOptions) => void;

type SectionPreviewListener = (
  elt: HTMLElement,
  options: ExtensionOptions,
  isEditor: boolean,
) => unknown;

const getOptionsListeners: GetOptionsListener[] = [];
// Sparse on purpose — `onInitConverter` registers by priority so the
// markdown-it base config runs at 0 before plugins (1+) get to mutate it.
const initConverterListeners: InitConverterListener[] = [];
const sectionPreviewListeners: SectionPreviewListener[] = [];

export default {
  onGetOptions(listener: GetOptionsListener): void {
    getOptionsListeners.push(listener);
  },

  onInitConverter(priority: number, listener: InitConverterListener): void {
    initConverterListeners[priority] = listener;
  },

  onSectionPreview(listener: SectionPreviewListener): void {
    sectionPreviewListeners.push(listener);
  },

  getOptions(properties: unknown, isCurrentFile?: boolean): ExtensionOptions {
    return getOptionsListeners.reduce<ExtensionOptions>((options, listener) => {
      listener(options, properties, isCurrentFile);
      return options;
    }, {});
  },

  initConverter(markdown: unknown, options: ExtensionOptions): void {
    // Use forEach as it's a sparse array
    initConverterListeners.forEach((listener) => {
      listener(markdown, options);
    });
  },

  sectionPreview(elt: HTMLElement, options: ExtensionOptions, isEditor: boolean): Promise<unknown[]> {
    // Listeners may be async (mermaid, for example). Return a Promise so
    // export paths can await the rendered DOM before reading innerHTML.
    // Callers that don't care (live preview) can just ignore the return.
    const results = sectionPreviewListeners.map(listener =>
      listener(elt, options, isEditor));
    return Promise.all(results);
  },
};
