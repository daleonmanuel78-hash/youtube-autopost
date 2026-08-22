import { supabaseAdmin } from '../../../lib/supabase';
import { refreshAccessToken } from '../../../lib/youtubeHelpers';
import { insertNotification } from '../../../lib/notifications';
import { sendNotificationEmail } from '../../../lib/email';
import { google } from 'googleapis';

// Deletes selected videos from YouTube (if they were actually posted there)
// and soft-trashes them in Supabase — never a hard delete, so they can be
// restored later. Restoring re-queues the video as a NEW upload; YouTube
// itself has no "undelete," so the original video/view history can't return.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { videoIds } = req.body;
  if (!Array.isArray(videoIds) || videoIds.length === 0) return res.status(400).json({ error: 'videoIds required' });

  const results = [];
  const deletedByChannel = {}; // channel name -> count, for the notification summary

  for (const videoId of videoIds) {
    let ytDeleteError = null;
    try {
      // A video lives in one of two places: the imported library (`videos`)
      // or a manual upload (`channel_uploads`) — check both, since the
      // dashboard shows them merged into one list but they're separate tables.
      const { data: video } = await supabaseAdmin.from('videos').select('*').eq('id', videoId).maybeSingle();

      if (video) {
        const { data: queue } = await supabaseAdmin
          .from('post_queue')
          .select('*, channels(*)')
          .eq('video_id', videoId)
          .eq('status', 'posted')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queue?.youtube_video_id && queue.channels) {
          try {
            const oauth2Client = await refreshAccessToken(queue.channels);
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            await youtube.videos.delete({ id: queue.youtube_video_id });
          } catch (err) {
            ytDeleteError = err.message;
          }
          await supabaseAdmin.from('post_queue').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', queue.id);
          const chName = queue.channels.name || 'channel';
          deletedByChannel[chName] = (deletedByChannel[chName] || 0) + 1;
        }

        await supabaseAdmin
          .from('videos')
          .update({ trashed_at: new Date().toISOString(), trashed_from_status: video.status, status: 'trashed' })
          .eq('id', videoId);

        results.push({ videoId, ok: true, ytDeleteError });
        continue;
      }

      const { data: upload } = await supabaseAdmin.from('channel_uploads').select('*, channels(*)').eq('id', videoId).maybeSingle();
      if (!upload) throw new Error('Video not found');

      if (upload.youtube_video_id && upload.channels) {
        try {
          const oauth2Client = await refreshAccessToken(upload.channels);
          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          await youtube.videos.delete({ id: upload.youtube_video_id });
        } catch (err) {
          ytDeleteError = err.message;
        }
        const chName = upload.channels.name || 'channel';
        deletedByChannel[chName] = (deletedByChannel[chName] || 0) + 1;
      }

      await supabaseAdmin.from('channel_uploads').update({ status: 'deleted' }).eq('id', videoId);

      results.push({ videoId, ok: true, ytDeleteError });
    } catch (err) {
      results.push({ videoId, ok: false, error: err.message });
    }
  }

  const totalDeleted = results.filter((r) => r.ok).length;
  if (totalDeleted > 0) {
    const channelSummary = Object.entries(deletedByChannel)
      .map(([name, count]) => `${count} from ${name}`)
      .join(', ');
    const title = `${totalDeleted} video(s) deleted${channelSummary ? ` (${channelSummary})` : ''} successfully`;
    const summaryLines = results.map((r) => (r.ok ? `✓ ${r.videoId}${r.ytDeleteError ? ` (YouTube delete warning: ${r.ytDeleteError})` : ''}` : `✗ ${r.videoId}: ${r.error}`));
    await insertNotification('delete-video', 'success', title, summaryLines);
    await sendNotificationEmail(`YT AutoPosting: ${title}`, summaryLines);
  }

  res.status(200).json({ results });
}
