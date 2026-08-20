import { supabaseAdmin } from '../../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;
  const { categoryId } = req.body;
  if (!categoryId) return res.status(400).json({ error: 'categoryId required' });

  const { error } = await supabaseAdmin.from('channel_categories').insert({ channel_id: channelId, category_id: categoryId });
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
}
