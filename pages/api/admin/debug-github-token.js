import { checkAdminAuth } from '../../../lib/adminAuth';

// Temporary diagnostic route — shows the shape of GITHUB_TOKEN as the server
// actually sees it (length, first/last few characters only) without ever
// exposing the real value. Delete this file once the issue is resolved.
export default function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const raw = process.env.GITHUB_TOKEN || '';
  res.status(200).json({
    exists: !!process.env.GITHUB_TOKEN,
    length: raw.length,
    startsWithGhp: raw.startsWith('ghp_'),
    first6: raw.slice(0, 6),
    last4: raw.slice(-4),
    hasQuotes: raw.includes('"') || raw.includes("'"),
    hasWhitespace: raw !== raw.trim(),
    owner: process.env.GITHUB_OWNER || '(using default)',
    repo: process.env.GITHUB_REPO || '(using default)',
  });
}
