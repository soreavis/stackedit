export const config = { runtime: 'edge' };

export default function handler() {
  const body = {
    status: 'ok',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
      || process.env.npm_package_version
      || 'dev',
    ts: Date.now(),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
