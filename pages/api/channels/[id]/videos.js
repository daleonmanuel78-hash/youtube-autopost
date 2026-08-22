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
      return res.status(200).json({ videos: [], needsCategory: true });
    }

    // Imported library videos (from Dropbox)
    const { data: libraryVideos, error: vidErr } = await supabaseAdmin
      .from('videos')
      .select('id, original_title, is_short, status, category_id, created_at, trashed_at')
      .in('category_id', categoryIds)
      .is('trashed_at', null)
      .order('created_at', { ascending: false });
    if (vidErr) throw vidErr;

    // Manually uploaded videos (from the "Upload a Video" popup), for THIS channel
    const { data: manualUploads, error: uploadErr } = await supabaseAdmin
      .from('channel_uploads')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false });
    if (uploadErr) throw uploadErr;

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

    const youtubeIds = [
      ...queueRows.filter((q) => q.youtube_video_id).map((q) => q.youtube_video_id),
      ...manualUploads.filter((u) => u.youtube_video_id).map((u) => u.youtube_video_id),
    ];
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

    const enrichedLibrary = libraryVideos.map((v) => {
      const queue = latestQueueByVideo[v.id] || null;
      const snapshot = queue?.youtube_video_id ? snapshotByYoutubeId[queue.youtube_video_id] : null;

      let resolvedStatus = 'draft';
      if (queue) {
        if (queue.status === 'posted') {
          resolvedStatus = queue.publish_mode === 'private' ? 'private' : queue.publish_mode === 'scheduled' ? 'scheduled' : 'public';
        } else if (queue.status === 'failed') resolvedStatus = 'failed';
        else if (queue.status === 'uploading') resolvedStatus = 'uploading';
      }

      return {
        id: v.id,
        source: 'library',
        title: v.original_title,
        is_short: v.is_short,
        created_at: v.created_at,
        resolved_status: resolvedStatus,
        is_posted: resolvedStatus === 'public' || resolvedStatus === 'private' || resolvedStatus === 'scheduled',
        youtube_video_id: queue?.youtube_video_id || null,
        custom_thumbnail_url: null,
        views: snapshot?.views ?? null,
        likes: snapshot?.likes ?? null,
        comments: snapshot?.comments ?? null,
      };
    });

    // Manual uploads use their OWN status field directly (draft/posted/failed),
    // not the post_queue mechanism the daily worker uses for library videos.
    const enrichedManual = manualUploads.map((u) => {
      const snapshot = u.youtube_video_id ? snapshotByYoutubeId[u.youtube_video_id] : null;
      let resolvedStatus = 'draft';
      if (u.status === 'posted') {
        resolvedStatus = u.visibility === 'public' ? 'public' : u.visibility === 'scheduled' ? 'scheduled' : 'private';
      } else if (u.status === 'failed') resolvedStatus = 'failed';

      return {
        id: u.id,
        source: 'manual',
        title: u.title || u.topic,
        is_short: u.is_short === true,
        custom_thumbnail_url: u.custom_thumbnail_url || null,
        created_at: u.created_at,
        resolved_status: resolvedStatus,
        is_posted: resolvedStatus === 'public' || resolvedStatus === 'private' || resolvedStatus === 'scheduled',
        youtube_video_id: u.youtube_video_id,
        views: snapshot?.views ?? null,
        likes: snapshot?.likes ?? null,
        comments: snapshot?.comments ?? null,
      };
    });

    const videos = [...enrichedManual, ...enrichedLibrary].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.status(200).json({ videos, needsCategory: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
