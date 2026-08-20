import { supabaseAdmin } from '../../../../lib/supabase';

export default async function handler(req, res) {
  const { id: channelId, includeTrashed } = req.query;

  try {
    const { data: links, error: linkErr } = await supabaseAdmin
      .from('channel_categories')
      .select('category_id')
      .eq('channel_id', channelId);
    if (linkErr) throw linkErr;

    const categoryIds = (links || []).map((l) => l.category_id);
    if (categoryIds.length === 0) {
      return res.status(200).json({ videos: [], needsCategory: true });
    }

    let videosQuery = supabaseAdmin
      .from('videos')
      .select('id, original_title, is_short, status, category_id, created_at, trashed_at')
      .in('category_id', categoryIds)
      .order('created_at', { ascending: false });

    if (includeTrashed !== 'true') {
      videosQuery = videosQuery.is('trashed_at', null);
    } else {
      videosQuery = videosQuery.not('trashed_at', 'is', null);
    }

    const { data: videos, error: vidErr } = await videosQuery;
    if (vidErr) throw vidErr;

    // ALL post_queue rows for this channel (not just latest), so we can find
    // the most recent one per video and correctly ignore stale/deleted history
    const { data: queueRows, error: qErr } = await supabaseAdmin
      .from('post_queue')
      .select('video_id, status, youtube_video_id, publish_mode, scheduled_date, created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false });
    if (qErr) throw qErr;

    const latestQueueByVideo = {};
    for (const q of queueRows) {
      if (!latestQueueByVideo[q.video_id]) latestQueueByVideo[q.video_id] = q;
    }

    const youtubeIds = queueRows.filter((q) => q.youtube_video_id).map((q) => q.youtube_video_id);
    let snapshotByYoutubeId = {};
    if (youtubeIds.length > 0) {
      const { data: snapshots } = await supabaseAdmin
        .from('video_analytics_snapshots')
        .select('*')
        .in('youtube_video_id', youtubeIds)
        .order('snapshot_date', { ascending: false });
      for (const s of snapshots || []) {
        if (!snapshotByYoutubeId[s.youtube_video_id]) snapshotByYoutubeId[s.youtube_video_id] = s;
      }
    }

    const enriched = videos.map((v) => {
      const queue = latestQueueByVideo[v.id] || null;
      const snapshot = queue?.youtube_video_id ? snapshotByYoutubeId[queue.youtube_video_id] : null;

      // Status resolution: trashed videos already filtered above; otherwise
      // Draft = never claimed by this channel, else reflect the latest attempt.
      let resolvedStatus = 'draft';
      if (queue) {
        if (queue.status === 'posted') {
          resolvedStatus = queue.publish_mode === 'private' ? 'private' : queue.publish_mode === 'scheduled' ? 'scheduled' : 'public';
        } else if (queue.status === 'failed') resolvedStatus = 'failed';
        else if (queue.status === 'uploading') resolvedStatus = 'uploading';
      }

      return {
        id: v.id,
        title: v.original_title,
        is_short: v.is_short,
        created_at: v.created_at,
        resolved_status: resolvedStatus, // draft | uploading | public | private | scheduled | failed
        is_posted: resolvedStatus === 'public' || resolvedStatus === 'private' || resolvedStatus === 'scheduled',
        youtube_video_id: queue?.youtube_video_id || null,
        views: snapshot?.views ?? null,
        likes: snapshot?.likes ?? null,
        comments: snapshot?.comments ?? null,
      };
    });

    res.status(200).json({ videos: enriched, needsCategory: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
