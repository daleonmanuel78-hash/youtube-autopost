import { supabaseAdmin } from '../../../../lib/supabase';
import { refreshAccessToken } from '../../../../lib/youtubeHelpers';
import { getYoutubeCategoryId } from '../../../../lib/youtubeCategoryMap';
import { insertNotification } from '../../../../lib/notifications';
import { sendNotificationEmail } from '../../../../lib/email';
import { google } from 'googleapis';
import formidable from 'formidable';
import fs from 'fs';

// Disable Next's default body parser — formidable handles the multipart
// stream itself, writing the video to a temp file on disk as it arrives
// rather than buffering the whole thing in memory. Important on a small
// Render instance where a large video could otherwise exhaust RAM.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;
  let tempFilePath = null;

  try {
    const { data: channel } = await supabaseAdmin.from('channels').select('*').eq('id', channelId).single();
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { data: links } = await supabaseAdmin.from('channel_categories').select('category_id').eq('channel_id', channelId).limit(1);
    const categoryId = links?.[0]?.category_id || null;

    const form = formidable({ maxFileSize: 4 * 1024 * 1024 * 1024 }); // 4GB ceiling, adjust if needed
    const [fields, files] = await form.parse(req);

    const get = (f) => (Array.isArray(fields[f]) ? fields[f][0] : fields[f]);
    const topic = get('topic');
    let title = get('title') || null;
    let description = get('description') || null;
    let tags = get('tags') ? get('tags').split(',').map((t) => t.trim()).filter(Boolean) : [];
    const madeForKids = get('madeForKids') === 'true';
    const visibility = get('visibility') || 'private'; // public | private
    const scheduledAt = get('scheduledAt') || null;
    const aiGenerated = get('aiGenerated') === 'true'; // set by the frontend once "Generate SEO" was used
    const isShort = get('isShort') === 'true'; // detected client-side from the actual video file

    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    const videoFile = Array.isArray(files.video) ? files.video[0] : files.video;
    if (!videoFile) return res.status(400).json({ error: 'No video file uploaded.' });
    tempFilePath = videoFile.filepath;

    if (!title) title = topic.slice(0, 100);

    // Always uploads to YouTube directly now — no Supabase Storage draft path
    // (removed due to the 50MB free-tier upload limit there; a "draft" that
    // never touches YouTube isn't something the YouTube API supports anyway,
    // so "Private" is the honest real equivalent).
    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const youtubeCategoryId = await getYoutubeCategoryId(supabaseAdmin, categoryId);

    const status = { selfDeclaredMadeForKids: madeForKids };
    if (scheduledAt) {
      status.privacyStatus = 'private';
      status.publishAt = new Date(scheduledAt).toISOString();
    } else {
      status.privacyStatus = visibility === 'public' ? 'public' : 'private';
    }

    // Retry once on a transient network error (e.g. ECONNRESET) — the file
    // is still sitting on disk at tempFilePath, so it's safe to re-read and
    // try again rather than fail the whole upload over a one-off network blip.
    async function attemptUpload() {
      return youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title, description: description || '', tags, categoryId: youtubeCategoryId },
          status,
        },
        media: { body: fs.createReadStream(tempFilePath) },
      });
    }

    let insertResp;
    try {
      insertResp = await attemptUpload();
    } catch (err) {
      const isTransient = /ECONNRESET|ETIMEDOUT|socket hang up/i.test(err.message || '');
      if (!isTransient) throw err;
      insertResp = await attemptUpload(); // one retry
    }
    const youtubeVideoId = insertResp.data.id;

    // If a thumbnail was generated in the popup, we always save it to our own
    // Storage first (so the dashboard has a real featured image regardless of
    // what happens next), then try to also apply it on YouTube. That YouTube
    // step is best-effort — it requires the channel to have a verified phone
    // number, so it can legitimately fail even when everything else works.
    const thumbnailDataUrl = get('thumbnailDataUrl');
    let thumbnailError = null;
    let customThumbnailUrl = null;
    if (thumbnailDataUrl) {
      const base64 = thumbnailDataUrl.split(',')[1];
      const thumbBuffer = Buffer.from(base64, 'base64');

      try {
        const storagePath = `thumbnails/${channelId}-${Date.now()}.jpg`;
        const { error: storageErr } = await supabaseAdmin.storage
          .from('channel-uploads')
          .upload(storagePath, thumbBuffer, { contentType: 'image/jpeg', upsert: true });
        if (storageErr) throw storageErr;
        const { data: publicUrlData } = supabaseAdmin.storage.from('channel-uploads').getPublicUrl(storagePath);
        customThumbnailUrl = publicUrlData.publicUrl;
      } catch (err) {
        console.error('Failed to save thumbnail to storage:', err.message);
      }

      try {
        await youtube.thumbnails.set({
          videoId: youtubeVideoId,
          media: { mimeType: 'image/jpeg', body: require('stream').Readable.from(thumbBuffer) },
        });
      } catch (err) {
        thumbnailError = err.message;
        console.error('Thumbnail upload to YouTube failed:', err.message);
      }
    }

    const { data: row, error: insertErr } = await supabaseAdmin
      .from('channel_uploads')
      .insert({
        channel_id: channelId,
        category_id: categoryId,
        topic,
        title,
        description,
        tags,
        made_for_kids: madeForKids,
        visibility: scheduledAt ? 'scheduled' : visibility,
        scheduled_at: scheduledAt,
        youtube_video_id: youtubeVideoId,
        status: 'posted',
        gemini_generated: aiGenerated,
        is_short: isShort,
        custom_thumbnail_url: customThumbnailUrl,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { data: channelInfo } = await supabaseAdmin.from('channels').select('name').eq('id', channelId).single();
    const visibilityLabel = scheduledAt ? 'scheduled' : visibility;
    const summaryLines = [`Topic: ${topic}`, `Title: ${title}`, `Visibility: ${visibilityLabel}`, `YouTube ID: ${youtubeVideoId}`, thumbnailError ? `Thumbnail: failed (${thumbnailError})` : 'Thumbnail: applied'].filter(Boolean);
    await insertNotification(
      'manual-upload',
      'success',
      `New video uploaded to ${channelInfo?.name || 'channel'} (${visibilityLabel}): "${title}"`,
      summaryLines
    );
    await sendNotificationEmail(
      `YT AutoPosting: Manual video uploaded to ${channelInfo?.name || 'channel'}`,
      summaryLines
    );

    res.status(200).json({ ok: true, status: 'posted', youtubeVideoId, upload: row, thumbnailError });
  } catch (err) {
    console.error(err);
    await insertNotification('manual-upload', 'failed', `Manual upload failed: ${err.message}`, [err.message]);
    await sendNotificationEmail('YT AutoPosting: Manual upload FAILED', [err.message]);
    res.status(500).json({ error: err.message });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath, () => {}); // best-effort cleanup of the temp file
    }
  }
}
