import { supabaseAdmin } from '../../../../lib/supabase';

// Soft-archive rather than hard-delete: keeps all post history intact and
// queryable, just hides the channel from the sidebar and stops it from being
// picked by the daily posting worker.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;

  const { error } = await supabaseAdmin.from('channels').update({ archived_at: new Date().toISOString() }).eq('id', channelId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
}
