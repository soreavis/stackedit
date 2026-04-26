// Minimal request/response types for the Vercel-style serverless
// handlers. Avoids depending on `@vercel/node` (devDep with multiple
// transitive vulnerabilities — path-to-regexp, undici, ajv, smol-toml,
// minimatch). These shapes only need to cover what our handlers
// actually touch.

export interface VercelRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  method?: string;
  url?: string;
  socket?: { remoteAddress?: string };
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  send(body: unknown): VercelResponse;
  json(body: unknown): VercelResponse;
  setHeader(name: string, value: string | string[]): VercelResponse;
  end(body?: unknown): VercelResponse;
}
