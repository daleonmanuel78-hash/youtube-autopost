import { checkAdminAuth } from '../../../../lib/adminAuth';
import { setWorkflowEnabled } from '../../../../lib/github';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { enable } = req.body;
  try {
    await setWorkflowEnabled(!!enable);
    res.status(200).json({ enabled: !!enable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
