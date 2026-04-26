import type { VercelRequest, VercelResponse } from './_types';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(501).json({
    error: 'pandoc_export_unavailable',
    message: 'Pandoc export is not available in this deployment.',
  });
}
