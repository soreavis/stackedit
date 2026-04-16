export default function handler(req, res) {
  res.status(501).json({
    error: 'pandoc_export_unavailable',
    message: 'Pandoc export is not available in this deployment.',
  });
}
