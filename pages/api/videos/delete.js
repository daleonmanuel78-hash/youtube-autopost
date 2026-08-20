import { supabaseAdmin } from '../../../lib/supabase';
import { refreshAccessToken } from '../../../lib/youtubeHelpers';
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

  for (const videoId of videoIds) {
    let ytDeleteError = null;
    try {
      const { data: video } = await supabaseAdmin.from('videos').select('*').eq('id', videoId).single();
      if (!video) throw new Error('Video not found');

      const { data: queue } = await supabaseAdmin
        .from('post_queue')
        .select('*, channels(*)')
        .eq('video_id', videoId)
        .eq('status', 'posted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queue?.youtube_video_id && queue.channels) {
        // Try to delete from YouTube, but don't let a failure here (e.g. the
        // video was already deleted directly on YouTube) block us from
        // updating our own database — that was the original bug: a failed
        // YouTube call meant the dashboard never reflected the deletion.
        try {
          const oauth2Client = await refreshAccessToken(queue.channels);
          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          await youtube.videos.delete({ id: queue.youtube_video_id });
        } catch (err) {
          ytDeleteError = err.message;
        }
        await supabaseAdmin.from('post_queue').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', queue.id);
      }

      await supabaseAdmin
        .from('videos')
        .update({ trashed_at: new Date().toISOString(), trashed_from_status: video.status, status: 'trashed' })
        .eq('id', videoId);

      results.push({ videoId, ok: true, ytDeleteError });
    } catch (err) {
      results.push({ videoId, ok: false, error: err.message });
    }
  }

  res.status(200).json({ results });
}
