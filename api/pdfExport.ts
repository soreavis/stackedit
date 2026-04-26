import type { VercelRequest, VercelResponse } from './_types';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(501).json({
    error: 'pdf_export_unavailable',
    message: 'PDF export is not available in this deployment. Use HTML export instead, or print to PDF from your browser.',
  });
}
