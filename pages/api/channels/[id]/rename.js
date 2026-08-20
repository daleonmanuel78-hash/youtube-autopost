import { supabaseAdmin } from '../../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const { error } = await supabaseAdmin.from('channels').update({ name: name.trim() }).eq('id', channelId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
}
