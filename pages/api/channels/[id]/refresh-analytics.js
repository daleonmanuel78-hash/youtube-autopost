import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { google } from 'googleapis';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const { id: channelId } = req.query;

  try {
    const { data: channel } = await supabaseAdmin.from('channels').select('*').eq('id', channelId).single();
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { data: posted } = await supabaseAdmin
      .from('post_queue')
      .select('id, video_id, youtube_video_id, publish_mode')
      .eq('channel_id', channelId)
      .eq('status', 'posted')
      .not('youtube_video_id', 'is', null);

    if (!posted || posted.length === 0) {
      return res.status(200).json({ updated: 0, autoTrashed: 0, statusCorrected: 0 });
    }

    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const today = todayDateString();
    let updated = 0;
    let autoTrashed = 0;
    let statusCorrected = 0;

    for (const row of posted) {
      try {
        // Fetch BOTH statistics and status — status is what lets us detect a
        // scheduled video that has since actually gone live, so the
        // dashboard stops showing it as "Scheduled" forever after the fact.
        const statsResp = await youtube.videos.list({ part: ['statistics', 'status'], id: [row.youtube_video_id] });

        if (!statsResp.data.items || statsResp.data.items.length === 0) {
          await supabaseAdmin
            .from('videos')
            .update({ trashed_at: new Date().toISOString(), trashed_from_status: 'posted', status: 'trashed' })
            .eq('id', row.video_id);
          await supabaseAdmin
            .from('post_queue')
            .update({ status: 'deleted', deleted_at: new Date().toISOString() })
            .eq('id', row.id);
          autoTrashed++;
          continue;
        }

        const item = statsResp.data.items[0];
        const stats = item.statistics;
        const actualPrivacyStatus = item.status?.privacyStatus; // 'public' | 'private' | 'unlisted'

        // Self-heal: a video we scheduled (publish_mode='scheduled') that has
        // now actually gone public on YouTube's side should stop showing as
        // "Scheduled" — correct it to reflect what's really true right now.
        if (row.publish_mode === 'scheduled' && actualPrivacyStatus === 'public') {
          await supabaseAdmin.from('post_queue').update({ publish_mode: 'public' }).eq('id', row.id);
          statusCorrected++;
        }

        await supabaseAdmin.from('video_analytics_snapshots').upsert(
          {
            youtube_video_id: row.youtube_video_id,
            snapshot_date: today,
            views: parseInt(stats.viewCount) || 0,
            likes: parseInt(stats.likeCount) || 0,
            comments: parseInt(stats.commentCount) || 0,
          },
          { onConflict: 'youtube_video_id,snapshot_date' }
        );
        updated++;
      } catch (err) {
        console.error(`Failed to refresh ${row.youtube_video_id}:`, err.message);
      }
    }

    res.status(200).json({ updated, autoTrashed, statusCorrected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
