// Lightweight registry for sync/publish providers. Providers register
// themselves at module load (via Provider's constructor), keyed by id.
// Consumers (workspaceSvc, syncSvc, publishSvc, store getters) look up
// by string id from the data the user persisted.

interface ProviderShape {
  id: string;
  [key: string]: unknown;
}

interface Registry {
  providersById: Record<string, ProviderShape>;
  register<T extends ProviderShape>(provider: T): T;
}

const providerRegistry: Registry = {
  providersById: {},
  register<T extends ProviderShape>(provider: T): T {
    this.providersById[provider.id] = provider;
    return provider;
  },
};

export default providerRegistry;
