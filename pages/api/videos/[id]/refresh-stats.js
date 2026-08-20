import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { google } from 'googleapis';

// Instant, single-video version of the daily analytics refresh — called from
// the video popup's Refresh button, so it only touches the one video you're
// actually looking at instead of the whole library.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: videoId } = req.query;

  try {
    const { data: queue } = await supabaseAdmin
      .from('post_queue')
      .select('youtube_video_id, channels(*)')
      .eq('video_id', videoId)
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!queue?.youtube_video_id || !queue.channels) {
      return res.status(200).json({ ok: false, message: 'Not posted to YouTube yet.' });
    }

    const oauth2Client = await refreshAccessToken(queue.channels);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
    const today = new Date().toISOString().slice(0, 10);

    const statsResp = await youtube.videos.list({ part: ['statistics'], id: [queue.youtube_video_id] });
    const stats = statsResp.data.items?.[0]?.statistics;

    let extra = { watch_time_minutes: null, impressions: null, ctr: null };
    try {
      const anResp = await youtubeAnalytics.reports.query({
        ids: `channel==${queue.channels.youtube_channel_id}`,
        startDate: '2020-01-01',
        endDate: today,
        metrics: 'estimatedMinutesWatched,impressions,impressionsClickThroughRate',
        filters: `video==${queue.youtube_video_id}`,
      });
      const row = anResp.data.rows?.[0];
      if (row) extra = { watch_time_minutes: row[0] ?? null, impressions: row[1] ?? null, ctr: row[2] ?? null };
    } catch (e) {
      /* analytics can lag for very fresh videos — non-fatal */
    }

    await supabaseAdmin.from('video_analytics_snapshots').upsert(
      {
        youtube_video_id: queue.youtube_video_id,
        views: stats?.viewCount ? Number(stats.viewCount) : null,
        likes: stats?.likeCount ? Number(stats.likeCount) : null,
        comments: stats?.commentCount ? Number(stats.commentCount) : null,
        watch_time_minutes: extra.watch_time_minutes,
        impressions: extra.impressions,
        ctr: extra.ctr,
        snapshot_date: today,
      },
      { onConflict: 'youtube_video_id,snapshot_date' }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
