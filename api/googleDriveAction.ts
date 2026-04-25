export const config = { runtime: 'edge' };

export default function handler(req: Request): Response {
  const url = new URL(req.url);
  const state = encodeURIComponent(url.searchParams.get('state') || '');
  return Response.redirect(
    new URL(`/app#providerId=googleDrive&state=${state}`, url).toString(),
    302,
  );
}
