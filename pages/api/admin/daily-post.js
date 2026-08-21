import { supabaseAdmin } from '../../../lib/supabase';
import { refreshAccessToken } from '../../../lib/youtubeHelpers';
import { checkAdminAuth } from '../../../lib/adminAuth';
import { getYoutubeCategoryId } from '../../../lib/youtubeCategoryMap';
import { google } from 'googleapis';
import { Readable } from 'stream';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function buildMetadata(video, seo) {
  if (seo) {
    return { title: seo.generated_title, description: seo.generated_description, tags: seo.generated_tags || [] };
  }
  const title = (video.original_title || 'Untitled').slice(0, 100);
  const descriptionParts = [video.original_caption, video.original_idea].filter(Boolean);
  const description = descriptionParts.join('\n\n').slice(0, 4900) || video.original_title || '';
  return { title, description, tags: video.original_tags || [] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const privacyStatus = req.body?.privacyStatus === 'private' ? 'private' : 'public';
  const log = [];
  const add = (line) => log.push(line);

  try {
    const { data: channels, error: chErr } = await supabaseAdmin.from('channels').select('*');
    if (chErr) throw chErr;

    if (!channels || channels.length === 0) {
      add('No connected channels found.');
      return res.status(200).json({ log });
    }

    for (const channel of channels) {
      add(`--- ${channel.name} ---`);
      let claim = null;
      try {
        const { data: links } = await supabaseAdmin
          .from('channel_categories')
          .select('category_id, priority')
          .eq('channel_id', channel.id)
          .order('priority', { ascending: true });
        if (!links || links.length === 0) {
          add('No category linked. Skipping.');
          continue;
        }
        const categoryId = links[0].category_id;

        const { data: videos } = await supabaseAdmin
          .from('videos')
          .select('*')
          .eq('category_id', categoryId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);
        const video = videos && videos[0];
        if (!video) {
          add('No pending videos left. Skipping.');
          continue;
        }
        add(`Selected: ${video.original_title}`);

        const { data: claimRow, error: claimErr } = await supabaseAdmin
          .from('post_queue')
          .insert({
            video_id: video.id,
            channel_id: channel.id,
            category_id: categoryId,
            scheduled_date: todayDateString(),
            status: 'uploading',
            publish_mode: privacyStatus,
          })
          .select()
          .single();
        if (claimErr) throw claimErr;
        claim = claimRow;

        const { data: seoRows } = await supabaseAdmin.from('video_seo').select('*').eq('video_id', video.id).limit(1);
        const seo = seoRows && seoRows[0];
        const metadata = buildMetadata(video, seo);
        add(`Using ${seo ? 'Gemini-generated' : 'original (fallback)'} metadata: "${metadata.title}"`);

        const oauth2Client = await refreshAccessToken(channel);
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const youtubeCategoryId = await getYoutubeCategoryId(supabaseAdmin, categoryId);

        const videoResp = await fetch(video.source_url);
        if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);

        const insertResp = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags, categoryId: youtubeCategoryId },
            // Auto-posted videos are never marked as Made for Kids — that
            // restricts features like comments and personalized ads in ways
            // that don't fit this content.
            status: { privacyStatus, selfDeclaredMadeForKids: false },
          },
          // Node's built-in fetch returns a Web-standard ReadableStream, but
          // googleapis' upload expects a classic Node Readable (with .pipe) —
          // convert it before handing it off.
          media: { body: Readable.fromWeb(videoResp.body) },
        });
        const youtubeVideoId = insertResp.data.id;

        await supabaseAdmin.from('post_queue').update({ status: 'posted', youtube_video_id: youtubeVideoId }).eq('id', claim.id);
        await supabaseAdmin.from('videos').update({ status: 'posted' }).eq('id', video.id);

        add(`✓ Uploaded: https://youtube.com/watch?v=${youtubeVideoId}`);
      } catch (err) {
        add(`✗ Error for ${channel.name}: ${err.message}`);
        if (claim) {
          await supabaseAdmin.from('post_queue').update({ status: 'failed', error_message: err.message }).eq('id', claim.id);
        }
      }
    }

    add('Done.');
    res.status(200).json({ log });
  } catch (err) {
    add(`Fatal error: ${err.message}`);
    res.status(500).json({ log, error: err.message });
  }
}
