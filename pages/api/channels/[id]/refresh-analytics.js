import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { google } from 'googleapis';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// Same job as the admin panel's global "Refresh analytics," scoped to just
// this one channel's videos — lets the channel dashboard's own button do the
// full job (including auto-trashing anything deleted directly on YouTube)
// without needing the admin password.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;

  try {
    const { data: channel } = await supabaseAdmin.from('channels').select('*').eq('id', channelId).single();
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { data: posted } = await supabaseAdmin
      .from('post_queue')
      .select('video_id, youtube_video_id')
      .eq('channel_id', channelId)
      .eq('status', 'posted')
      .not('youtube_video_id', 'is', null);

    if (!posted || posted.length === 0) {
      return res.status(200).json({ updated: 0, autoTrashed: 0 });
    }

    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
    const today = todayDateString();
    let updated = 0;
    let autoTrashed = 0;

    for (const { video_id: videoId, youtube_video_id: youtubeVideoId } of posted) {
      try {
        const statsResp = await youtube.videos.list({ part: ['statistics'], id: [youtubeVideoId] });

        if (!statsResp.data.items || statsResp.data.items.length === 0) {
          await supabaseAdmin
            .from('videos')
            .update({ trashed_at: new Date().toISOString(), trashed_from_status: 'posted', status: 'trashed' })
            .eq('id', videoId);
          await supabaseAdmin
            .from('post_queue')
            .update({ status: 'deleted', deleted_at: new Date().toISOString() })
            .eq('video_id', videoId)
            .eq('youtube_video_id', youtubeVideoId);
          autoTrashed++;
          continue;
        }

        const stats = statsResp.data.items[0].statistics;
        let extra = { watch_time_minutes: null, impressions: null, ctr: null };
        try {
          const anResp = await youtubeAnalytics.reports.query({
            ids: `channel==${channel.youtube_channel_id}`,
            startDate: '2020-01-01',
            endDate: today,
            metrics: 'estimatedMinutesWatched,impressions,impressionsClickThroughRate',
            filters: `video==${youtubeVideoId}`,
          });
          const row = anResp.data.rows?.[0];
          if (row) extra = { watch_time_minutes: row[0] ?? null, impressions: row[1] ?? null, ctr: row[2] ?? null };
        } catch (e) {
          /* non-fatal */
        }

        await supabaseAdmin.from('video_analytics_snapshots').upsert(
          {
            youtube_video_id: youtubeVideoId,
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
        updated++;
      } catch (err) {
        console.error(`Failed to refresh ${youtubeVideoId}:`, err.message);
      }
    }

    res.status(200).json({ updated, autoTrashed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
