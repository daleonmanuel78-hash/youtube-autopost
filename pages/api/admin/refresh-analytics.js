import { supabaseAdmin } from '../../../lib/supabase';
import { refreshAccessToken } from '../../../lib/youtubeHelpers';
import { checkAdminAuth } from '../../../lib/adminAuth';
import { insertNotification } from '../../../lib/notifications';
import { sendNotificationEmail } from '../../../lib/email';
import { isYoutubeShort } from '../../../lib/detectShorts';
import { google } from 'googleapis';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const log = [];
  const add = (line) => log.push(line);

  try {
    const { data: posted } = await supabaseAdmin
      .from('post_queue')
      .select('video_id, youtube_video_id, channel_id, publish_mode')
      .eq('status', 'posted')
      .not('youtube_video_id', 'is', null);

    if (!posted || posted.length === 0) {
      add('No posted videos yet.');
      return res.status(200).json({ log });
    }

    const byChannel = {};
    for (const row of posted) {
      if (!byChannel[row.channel_id]) byChannel[row.channel_id] = [];
      byChannel[row.channel_id].push({ videoId: row.video_id, youtubeVideoId: row.youtube_video_id, publishMode: row.publish_mode });
    }

    const { data: channels } = await supabaseAdmin.from('channels').select('*');
    const channelById = Object.fromEntries((channels || []).map((c) => [c.id, c]));
    const today = todayDateString();
    let updated = 0;
    let autoTrashed = 0;

    for (const [channelId, videos] of Object.entries(byChannel)) {
      const channel = channelById[channelId];
      if (!channel) continue;
      add(`--- ${channel.name}: ${videos.length} video(s) ---`);

      const oauth2Client = await refreshAccessToken(channel);
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

      for (const { videoId, youtubeVideoId, publishMode } of videos) {
        try {
          const statsResp = await youtube.videos.list({ part: ['statistics'], id: [youtubeVideoId] });

          // No items back means the video no longer exists on YouTube — most
          // likely deleted directly there, outside our system. We'd never
          // otherwise learn about that, so self-heal by moving it to Trash.
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
            add(`⚠ ${youtubeVideoId}: no longer exists on YouTube — moved to Trash`);
            continue;
          }

          const stats = statsResp.data.items[0].statistics;

          // Self-heal Shorts/Long-form classification for library videos —
          // the original 1,313 Dropbox-imported videos never had real
          // duration/orientation captured at import time, using YouTube's
          // own /shorts/ URL behavior as the authoritative signal this time
          // (more reliable than the thumbnail-dimension heuristic we tried
          // before). Only works for public videos.
          if (publishMode === 'public') {
            const reallyIsShort = await isYoutubeShort(youtubeVideoId);
            if (reallyIsShort !== null) {
              await supabaseAdmin.from('videos').update({ is_short: reallyIsShort }).eq('id', videoId);
            }
          }

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
            /* analytics can be unavailable for new videos — non-fatal */
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
          add(`✓ ${youtubeVideoId}: ${stats?.viewCount ?? 0} views`);
        } catch (err) {
          add(`✗ ${youtubeVideoId}: ${err.message}`);
        }
      }
    }
    add(`Done. ${updated} snapshot(s) updated, ${autoTrashed} auto-trashed (deleted on YouTube).`);
    const title = `${updated} updated, ${autoTrashed} auto-trashed`;
    await insertNotification('refresh-analytics', 'success', title, log);
    await sendNotificationEmail(`YT AutoPosting: Analytics refresh — ${title}`, log);
    res.status(200).json({ log });
  } catch (err) {
    add(`Fatal error: ${err.message}`);
    await insertNotification('refresh-analytics', 'failed', `Fatal error: ${err.message}`, log);
    await sendNotificationEmail('YT AutoPosting: Analytics refresh FAILED', log);
    res.status(500).json({ log, error: err.message });
  }
}
