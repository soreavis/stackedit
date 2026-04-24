const getOptionsListeners = [];
const initConverterListeners = [];
const sectionPreviewListeners = [];

export default {
  onGetOptions(listener) {
    getOptionsListeners.push(listener);
  },

  onInitConverter(priority, listener) {
    initConverterListeners[priority] = listener;
  },

  onSectionPreview(listener) {
    sectionPreviewListeners.push(listener);
  },

  getOptions(properties, isCurrentFile) {
    return getOptionsListeners.reduce((options, listener) => {
      listener(options, properties, isCurrentFile);
      return options;
    }, {});
  },

  initConverter(markdown, options) {
    // Use forEach as it's a sparsed array
    initConverterListeners.forEach((listener) => {
      listener(markdown, options);
    });
  },

  sectionPreview(elt, options, isEditor) {
    // Listeners may be async (mermaid, for example). Return a Promise so
    // export paths can await the rendered DOM before reading innerHTML.
    // Callers that don't care (live preview) can just ignore the return.
    const results = sectionPreviewListeners.map(listener =>
      listener(elt, options, isEditor));
    return Promise.all(results);
  },
};
