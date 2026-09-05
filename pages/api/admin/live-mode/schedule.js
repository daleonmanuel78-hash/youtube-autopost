import { supabaseAdmin } from '../../../../lib/supabase';
import { checkAdminAuth } from '../../../../lib/adminAuth';

export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('live_mode_settings').select('*').limit(1).single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { timezone, postTimes } = req.body;
    if (!timezone || !Array.isArray(postTimes) || postTimes.length === 0) {
      return res.status(400).json({ error: 'timezone and at least one postTime are required.' });
    }
    const validTimes = postTimes.every((t) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t));
    if (!validTimes) return res.status(400).json({ error: 'Times must be in HH:MM 24-hour format.' });

    const { data: existing } = await supabaseAdmin.from('live_mode_settings').select('id').limit(1).single();
    const { data, error } = await supabaseAdmin
      .from('live_mode_settings')
      .update({ timezone, post_times: postTimes, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
