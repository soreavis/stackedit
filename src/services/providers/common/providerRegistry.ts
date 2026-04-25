// @ts-nocheck
// Provider/helper module — HTTP / OAuth / API plumbing for an external
// sync service. Typed boundary work pending: response shapes vary by
// provider, error handling is dynamic. .ts rename is for migration
// tracking; full typing requires per-provider response interfaces.
export default {
  providersById: {},
  register(provider) {
    this.providersById[provider.id] = provider;
    return provider;
  },
};
