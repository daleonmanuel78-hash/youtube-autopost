import { supabaseAdmin } from '../../../lib/supabase';

// Restores a trashed video back into the posting queue as "pending" — it will
// be picked up by the daily worker like any fresh video and uploaded as a
// brand-new YouTube video (new video ID, view/like counts start at zero).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { videoIds } = req.body;
  if (!Array.isArray(videoIds) || videoIds.length === 0) return res.status(400).json({ error: 'videoIds required' });

  const { error } = await supabaseAdmin
    .from('videos')
    .update({ trashed_at: null, trashed_from_status: null, status: 'pending' })
    .in('id', videoIds);

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, restored: videoIds.length });
}
