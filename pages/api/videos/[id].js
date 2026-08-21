import { supabaseAdmin } from '../../../lib/supabase';

async function loadFromLibrary(videoId) {
  const { data: video } = await supabaseAdmin.from('videos').select('*').eq('id', videoId).maybeSingle();
  if (!video) return null;

  const { data: queue } = await supabaseAdmin
    .from('post_queue')
    .select('*')
    .eq('video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: seo } = await supabaseAdmin.from('video_seo').select('*').eq('video_id', videoId).maybeSingle();

  return {
    display_title: seo?.generated_title || video.original_title,
    display_description: seo?.generated_description || video.original_caption || video.original_idea || '',
    youtube_video_id: queue?.youtube_video_id || null,
    queue,
  };
}

async function loadFromManualUploads(videoId) {
  const { data: upload } = await supabaseAdmin.from('channel_uploads').select('*').eq('id', videoId).maybeSingle();
  if (!upload) return null;

  return {
    display_title: upload.title || upload.topic,
    display_description: upload.description || '',
    youtube_video_id: upload.youtube_video_id,
    // shape this like a post_queue row so the rest of the response/UI works unchanged
    queue: { status: upload.status, publish_mode: upload.visibility, error_message: upload.error_message },
  };
}

export default async function handler(req, res) {
  const { id: videoId } = req.query;

  try {
    const found = (await loadFromLibrary(videoId)) || (await loadFromManualUploads(videoId));
    if (!found) return res.status(404).json({ error: 'Video not found.' });

    const { display_title, display_description, youtube_video_id, queue } = found;

    let snapshots = [];
    if (youtube_video_id) {
      const { data } = await supabaseAdmin
        .from('video_analytics_snapshots')
        .select('*')
        .eq('youtube_video_id', youtube_video_id)
        .order('snapshot_date', { ascending: true });
      snapshots = data || [];
    }

    const latest = snapshots[snapshots.length - 1] || null;
    const totals = {
      views: latest?.views ?? null,
      likes: latest?.likes ?? null,
      comments: latest?.comments ?? null,
      watch_time_minutes: latest?.watch_time_minutes ?? null,
    };

    res.status(200).json({
      queue,
      display_title,
      display_description,
      youtube_video_id,
      thumbnail_url: youtube_video_id ? `https://i.ytimg.com/vi/${youtube_video_id}/hqdefault.jpg` : null,
      totals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
