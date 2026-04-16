import { beforeAll } from 'vitest';

beforeAll(() => {
  // happy-dom exposes window.crypto; ensure globalThis.crypto is defined for
  // tests that use crypto.subtle directly (Node's webcrypto global).
  if (!globalThis.crypto && typeof window !== 'undefined' && window.crypto) {
    globalThis.crypto = window.crypto;
  }
});
