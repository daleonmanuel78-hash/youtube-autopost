import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { google } from 'googleapis';

export default async function handler(req, res) {
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
      return res.status(200).json({ comments: [], notPostedYet: true });
    }

    const oauth2Client = await refreshAccessToken(queue.channels);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    if (req.method === 'GET') {
      const resp = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: queue.youtube_video_id,
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
    // Missing the force-ssl scope shows up as a 403 here — surface a clear,
    // actionable message instead of a raw Google API error.
    if (err.message?.includes('insufficient') || err.code === 403) {
      return res.status(403).json({
        error: 'This channel needs to be reconnected to allow replying to comments (a permission was added after it was first connected).',
      });
    }
    res.status(500).json({ error: err.message });
  }
}
