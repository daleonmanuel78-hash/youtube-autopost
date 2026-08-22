import { checkAdminAuth } from '../../../../lib/adminAuth';
import { getWorkflowState } from '../../../../lib/github';

export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const state = await getWorkflowState();
    res.status(200).json({ enabled: state === 'active' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
