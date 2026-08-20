import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req, res) {
  const { id: videoId } = req.query;

  try {
    const { data: video, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();
    if (vErr) throw vErr;

    const { data: queue } = await supabaseAdmin
      .from('post_queue')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: seo } = await supabaseAdmin
      .from('video_seo')
      .select('*')
      .eq('video_id', videoId)
      .maybeSingle();

    let snapshots = [];
    if (queue?.youtube_video_id) {
      const { data } = await supabaseAdmin
        .from('video_analytics_snapshots')
        .select('*')
        .eq('youtube_video_id', queue.youtube_video_id)
        .order('snapshot_date', { ascending: true });
      snapshots = data || [];
    }

    const latest = snapshots[snapshots.length - 1] || null;

    res.status(200).json({
      video,
      seo,
      queue,
      // description/title shown to viewers: Gemini's version if it exists, else the original
      display_title: seo?.generated_title || video.original_title,
      display_description: seo?.generated_description || video.original_caption || video.original_idea || '',
      thumbnail_url: queue?.youtube_video_id
        ? `https://i.ytimg.com/vi/${queue.youtube_video_id}/hqdefault.jpg`
        : null,
      latest_stats: latest,
      snapshot_history: snapshots,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
