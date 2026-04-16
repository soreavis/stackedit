// @vitest-environment node
import { describe, it, expect } from 'vitest';
import devApiPlugin from '../../../dev-server/index.js';

// Capture calls to server.middlewares.use so we can assert the /api 404 handler
// is registered BEFORE the real dev handlers (middleware order matters).
function makeFakeServer() {
  const calls = [];
  return {
    calls,
    middlewares: {
      use: (...args) => calls.push(args),
    },
  };
}

describe('dev-server plugin', () => {
  const plugin = devApiPlugin();

  it('is a Vite plugin scoped to serve mode', () => {
    expect(plugin.name).toBe('stackedit-dev-api');
    expect(plugin.apply).toBe('serve');
    expect(typeof plugin.configureServer).toBe('function');
  });

  it('installs a /api 404 handler as the first middleware', () => {
    const server = makeFakeServer();
    plugin.configureServer(server);
    const firstMountPath = server.calls[0][0];
    expect(firstMountPath).toBe('/api');
  });

  it('/api 404 handler responds 404 without leaking source', () => {
    const server = makeFakeServer();
    plugin.configureServer(server);
    const [, apiHandler] = server.calls[0];

    let statusCode; let body;
    const fakeReq = {};
    const fakeRes = {
      set statusCode(v) { statusCode = v; },
      end(b) { body = b; },
    };
    apiHandler(fakeReq, fakeRes);
    expect(statusCode).toBe(404);
    expect(body).toMatch(/not found/i);
  });

  it('mounts /pdfExport, /pandocExport, /conf, /userInfo after the /api guard', () => {
    const server = makeFakeServer();
    plugin.configureServer(server);
    const paths = server.calls.map(call => call[0]);
    expect(paths).toEqual(['/api', '/pdfExport', '/pandocExport', '/conf', '/userInfo']);
  });
});
