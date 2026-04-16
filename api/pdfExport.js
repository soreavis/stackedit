export default function handler(req, res) {
  res.status(501).json({
    error: 'pdf_export_unavailable',
    message: 'PDF export is not available in this deployment. Use HTML export instead, or print to PDF from your browser.',
  });
}
