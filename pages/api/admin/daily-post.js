import { supabaseAdmin } from '../../../lib/supabase';
import { refreshAccessToken } from '../../../lib/youtubeHelpers';
import { checkAdminAuth } from '../../../lib/adminAuth';
import { getYoutubeCategoryId } from '../../../lib/youtubeCategoryMap';
import { isYoutubeShort } from '../../../lib/detectShorts';
import { sendNotificationEmail } from '../../../lib/email';
import { insertNotification } from '../../../lib/notifications';
import { getNextOccurrenceUTC, getDateStringForInstant } from '../../../lib/computeSchedule';
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

// Picks the next pending video for a channel's category, skipping anything
// already claimed today for that channel (so a transient failure earlier
// today doesn't get retried forever against the same doomed video).
async function pickVideoForChannel(channel, categoryId) {
  const today = todayDateString();
  const { data: alreadyClaimedToday } = await supabaseAdmin
    .from('post_queue')
    .select('video_id')
    .eq('channel_id', channel.id)
    .eq('scheduled_date', today);
  const claimedIds = (alreadyClaimedToday || []).map((r) => r.video_id);

  let videoQuery = supabaseAdmin
    .from('videos')
    .select('*')
    .eq('category_id', categoryId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (claimedIds.length > 0) {
    videoQuery = videoQuery.not('id', 'in', `(${claimedIds.join(',')})`);
  }
  const { data: videos } = await videoQuery;
  return videos && videos[0];
}

// Uploads one video to YouTube for a channel, with the given status object
// (immediate public/private, OR scheduled private+publishAt). Shared by both
// the immediate manual-button flow and the new target-schedule flow.
async function uploadVideoForChannel({ channel, categoryId, statusOverride, publishModeLabel, add }) {
  const video = await pickVideoForChannel(channel, categoryId);
  if (!video) {
    add('No pending videos left (or all remaining ones already attempted today). Skipping.');
    return null;
  }
  add(`Selected: ${video.original_title}`);

  const today = todayDateString();
  const { data: claim, error: claimErr } = await supabaseAdmin
    .from('post_queue')
    .insert({ video_id: video.id, channel_id: channel.id, status: 'uploading', publish_mode: publishModeLabel || statusOverride.privacyStatus, scheduled_date: today })
    .select()
    .single();
  if (claimErr) throw new Error(`Claim failed (already claimed today?): ${claimErr.message}`);

  const { data: seo } = await supabaseAdmin.from('video_seo').select('*').eq('video_id', video.id).maybeSingle();
  const metadata = buildMetadata(video, seo);
  add(seo ? `Using Gemini-generated metadata: "${metadata.title}"` : `Using original (fallback) metadata: "${metadata.title}"`);

  const oauth2Client = await refreshAccessToken(channel);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const youtubeCategoryId = await getYoutubeCategoryId(supabaseAdmin, categoryId);

  const videoResp = await fetch(video.source_url);
  if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);

  const insertResp = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags, categoryId: youtubeCategoryId },
      status: { ...statusOverride, selfDeclaredMadeForKids: false },
    },
    media: { body: Readable.fromWeb(videoResp.body) },
  });
  const youtubeVideoId = insertResp.data.id;

  await supabaseAdmin.from('post_queue').update({ status: 'posted', youtube_video_id: youtubeVideoId }).eq('id', claim.id);
  await supabaseAdmin.from('videos').update({ status: 'posted' }).eq('id', video.id);

  // Correct Shorts/Long-form using YouTube's own determination — only works
  // once truly public, so scheduled-but-not-yet-live videos skip this for now.
  if (statusOverride.privacyStatus === 'public') {
    const reallyIsShort = await isYoutubeShort(youtubeVideoId);
    if (reallyIsShort !== null) {
      await supabaseAdmin.from('videos').update({ is_short: reallyIsShort }).eq('id', video.id);
    }
  }

  return youtubeVideoId;
}

export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const log = [];
  const add = (line) => log.push(line);

  try {
    const { data: channels } = await supabaseAdmin.from('channels').select('*');
    if (!channels || channels.length === 0) {
      add('No channels connected.');
      return res.status(200).json({ log });
    }

    if (req.body?.mode === 'schedule') {
      // The real Live Mode flow: upload can happen anytime (whenever this
      // is triggered), but each video is scheduled via YouTube's own
      // publishAt to actually go live at the configured target-country
      // time — decoupling "when we upload" from "when it publishes".
      const { data: settings } = await supabaseAdmin.from('live_mode_settings').select('*').limit(1).single();
      if (!settings) {
        add('No schedule configured yet in Admin Panel — nothing to do.');
        return res.status(200).json({ log });
      }

      for (const channel of channels) {
        add(`--- ${channel.name} ---`);
        const { data: links } = await supabaseAdmin.from('channel_categories').select('category_id').eq('channel_id', channel.id).limit(1);
        if (!links || links.length === 0) {
          add('No category linked. Skipping.');
          continue;
        }
        const categoryId = links[0].category_id;

        for (const slot of settings.post_times) {
          try {
            const nextOccurrence = getNextOccurrenceUTC(settings.timezone, slot);
            const targetDateStr = getDateStringForInstant(settings.timezone, nextOccurrence);

            const { error: queueClaimErr } = await supabaseAdmin
              .from('live_mode_fired_log')
              .insert({ job_type: 'daily-post', channel_id: channel.id, fire_date: targetDateStr, time_slot: slot });
            if (queueClaimErr) {
              add(`Slot ${slot} (next publish ${nextOccurrence.toISOString()}) already queued for this channel — skipping.`);
              continue;
            }

            add(`Queuing for slot ${slot} ${settings.timezone} — will go live at ${nextOccurrence.toISOString()} (UTC)`);
            const youtubeVideoId = await uploadVideoForChannel({
              channel,
              categoryId,
              statusOverride: { privacyStatus: 'private', publishAt: nextOccurrence.toISOString() },
              publishModeLabel: 'scheduled',
              add,
            });
            if (youtubeVideoId) add(`✓ Scheduled: https://youtube.com/watch?v=${youtubeVideoId}`);
          } catch (err) {
            add(`✗ Error scheduling slot ${slot} for ${channel.name}: ${err.message}`);
          }
        }
      }
    } else {
      // Manual button click from Admin Panel — publishes immediately,
      // exactly as before, for quick testing purposes.
      const privacyStatus = req.body?.privacyStatus === 'private' ? 'private' : 'public';
      for (const channel of channels) {
        try {
          add(`--- ${channel.name} ---`);
          const { data: links } = await supabaseAdmin.from('channel_categories').select('category_id').eq('channel_id', channel.id).limit(1);
          if (!links || links.length === 0) {
            add('No category linked. Skipping.');
            continue;
          }
          const youtubeVideoId = await uploadVideoForChannel({
            channel,
            categoryId: links[0].category_id,
            statusOverride: { privacyStatus },
            add,
          });
          if (youtubeVideoId) add(`✓ Uploaded: https://youtube.com/watch?v=${youtubeVideoId}`);
        } catch (err) {
          add(`✗ Error for ${channel.name}: ${err.message}`);
        }
      }
    }

    add('Done.');
    const successCount = log.filter((l) => l.startsWith('✓')).length;
    const failCount = log.filter((l) => l.startsWith('✗')).length;
    await sendNotificationEmail(`YT AutoPosting: ${successCount} posted/scheduled, ${failCount} failed — ${todayDateString()}`, log);
    await insertNotification('daily-post', failCount > 0 && successCount === 0 ? 'failed' : 'success', `${successCount} posted/scheduled, ${failCount} failed`, log);

    res.status(200).json({ log });
  } catch (err) {
    add(`Fatal error: ${err.message}`);
    await sendNotificationEmail(`YT AutoPosting: Fatal error — ${todayDateString()}`, log);
    await insertNotification('daily-post', 'failed', `Fatal error: ${err.message}`, log);
    res.status(500).json({ log, error: err.message });
  }
}
