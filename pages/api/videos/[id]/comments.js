import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { google } from 'googleapis';

// A video lives in one of two places: the imported library (post_queue) or
// a manual upload (channel_uploads) — comments previously only checked the
// first, so manually-uploaded videos could never load their comments at all.
async function findVideoAndChannel(videoId) {
  const { data: queue } = await supabaseAdmin
    .from('post_queue')
    .select('youtube_video_id, channels(*)')
    .eq('video_id', videoId)
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (queue?.youtube_video_id && queue.channels) {
    return { youtubeVideoId: queue.youtube_video_id, channel: queue.channels };
  }

  const { data: upload } = await supabaseAdmin
    .from('channel_uploads')
    .select('youtube_video_id, channels(*)')
    .eq('id', videoId)
    .eq('status', 'posted')
    .maybeSingle();

  if (upload?.youtube_video_id && upload.channels) {
    return { youtubeVideoId: upload.youtube_video_id, channel: upload.channels };
  }

  return null;
}

export default async function handler(req, res) {
  const { id: videoId } = req.query;

  try {
    const found = await findVideoAndChannel(videoId);
    if (!found) {
      return res.status(200).json({ comments: [], notPostedYet: true });
    }
    const { youtubeVideoId, channel } = found;

    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    if (req.method === 'GET') {
      const resp = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: youtubeVideoId,
        maxResults: 50,
        order: 'time',
      });

      const comments = (resp.data.items || []).map((thread) => ({
        id: thread.id,
        author: thread.snippet.topLevelComment.snippet.authorDisplayName,
        authorImage: thread.snippet.topLevelComment.snippet.authorProfileImageUrl,
        text: thread.snippet.topLevelComment.snippet.textDisplay,
        likeCount: thread.snippet.topLevelComment.snippet.likeCount,
        publishedAt: thread.snippet.topLevelComment.snippet.publishedAt,
        replies: (thread.replies?.comments || []).map((r) => ({
          id: r.id,
          author: r.snippet.authorDisplayName,
          authorImage: r.snippet.authorProfileImageUrl,
          text: r.snippet.textDisplay,
          publishedAt: r.snippet.publishedAt,
        })),
      }));

      return res.status(200).json({ comments });
    }

    if (req.method === 'POST') {
      const { parentId, text } = req.body;
      if (!parentId || !text) return res.status(400).json({ error: 'parentId and text required' });

      await youtube.comments.insert({
        part: ['snippet'],
        requestBody: { snippet: { parentId, textOriginal: text } },
      });

      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    const rawMessage = err.errors?.[0]?.message || err.message || 'Unknown error';
    const reason = err.errors?.[0]?.reason || '';

    // insufficientPermissions specifically means a missing OAuth scope — that's
    // the one case where reconnecting actually fixes it. Anything else, show
    // the real Google error so we're not guessing at the cause.
    if (reason === 'insufficientPermissions' || rawMessage.toLowerCase().includes('insufficient')) {
      return res.status(403).json({
        error: 'This channel needs to be reconnected to allow replying to comments (a permission was added after it was first connected).',
        detail: rawMessage,
      });
    }

    return res.status(500).json({ error: rawMessage });
  }
}
