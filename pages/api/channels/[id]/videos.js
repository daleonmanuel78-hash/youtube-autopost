import { supabaseAdmin } from '../../../../lib/supabase';

export default async function handler(req, res) {
  const { id: channelId } = req.query;

  try {
    const { data: links, error: linkErr } = await supabaseAdmin
      .from('channel_categories')
      .select('category_id')
      .eq('channel_id', channelId);
    if (linkErr) throw linkErr;

    const categoryIds = (links || []).map((l) => l.category_id);
    if (categoryIds.length === 0) {
      return res.status(200).json({ videos: [] });
    }

    const { data: videos, error: vidErr } = await supabaseAdmin
      .from('videos')
      .select('id, original_title, is_short, status, category_id, created_at')
      .in('category_id', categoryIds)
      .order('created_at', { ascending: false });
    if (vidErr) throw vidErr;

    // Only videos THIS channel has actually claimed/posted show up in post_queue —
    // filtering by channel_id alone keeps this a small, cheap query, unlike filtering
    // by hundreds of video IDs (which blew past Supabase's URL/header size limit).
    const { data: queueRows, error: qErr } = await supabaseAdmin
      .from('post_queue')
      .select('video_id, status, youtube_video_id, publish_mode, scheduled_date')
      .eq('channel_id', channelId);
    if (qErr) throw qErr;
    const queueByVideo = Object.fromEntries(queueRows.map((q) => [q.video_id, q]));

    const youtubeIds = queueRows.filter((q) => q.youtube_video_id).map((q) => q.youtube_video_id);
    let snapshotByYoutubeId = {};
    if (youtubeIds.length > 0) {
      const { data: snapshots, error: sErr } = await supabaseAdmin
        .from('video_analytics_snapshots')
        .select('*')
        .in('youtube_video_id', youtubeIds)
        .order('snapshot_date', { ascending: false });
      if (sErr) throw sErr;
      for (const s of snapshots) {
        if (!snapshotByYoutubeId[s.youtube_video_id]) snapshotByYoutubeId[s.youtube_video_id] = s;
      }
    }

    const enriched = videos.map((v) => {
      const queue = queueByVideo[v.id] || null;
      const snapshot = queue?.youtube_video_id ? snapshotByYoutubeId[queue.youtube_video_id] : null;
      return {
        id: v.id,
        title: v.original_title,
        is_short: v.is_short,
        created_at: v.created_at,
        post_status: queue ? queue.status : 'draft',
        publish_mode: queue?.publish_mode || null,
        youtube_video_id: queue?.youtube_video_id || null,
        views: snapshot?.views ?? null,
        likes: snapshot?.likes ?? null,
        comments: snapshot?.comments ?? null,
      };
    });

    res.status(200).json({ videos: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
