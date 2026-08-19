// Phase 5: Daily posting worker
//
// For each connected channel, picks its linked category (round-robin if it has
// more than one), claims the next un-posted video in that category, builds the
// SEO metadata (uses Gemini's output if available, falls back to your original
// title/caption/tags if not), downloads the video from its Dropbox link, and
// uploads it straight to YouTube.
//
// Setup (in your project folder):
//   npm install googleapis node-fetch@2 ws @supabase/supabase-js
//
// Run manually (safe to re-run — each video is only ever claimed once):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SECRET_KEY="your_secret_key"
//   $env:GOOGLE_CLIENT_ID="your_client_id"
//   $env:GOOGLE_CLIENT_SECRET="your_client_secret"
//   node daily-post.js
//
// Flags:
//   node daily-post.js --dry-run     -> does everything except the actual YouTube upload
//   node daily-post.js --private     -> uploads as private instead of public (good for testing)

const ws = require('ws');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws;
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const { google } = require('googleapis');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const DRY_RUN = process.argv.includes('--dry-run');
const PRIVACY_STATUS = process.argv.includes('--private') ? 'private' : 'public';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Missing SUPABASE_URL, SUPABASE_SECRET_KEY, GOOGLE_CLIENT_ID, or GOOGLE_CLIENT_SECRET.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: { transport: ws },
});

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Builds the metadata to publish. Prefers Gemini's enriched version; falls back
// to the original imported data if Gemini hasn't processed this video yet.
function buildMetadata(video, seo) {
  if (seo) {
    return {
      title: seo.generated_title,
      description: seo.generated_description,
      tags: seo.generated_tags || [],
    };
  }
  const title = (video.original_title || 'Untitled').slice(0, 100);
  const descriptionParts = [video.original_caption, video.original_idea].filter(Boolean);
  const description = descriptionParts.join('\n\n').slice(0, 4900) || video.original_title || '';
  const tags = video.original_tags || [];
  return { title, description, tags };
}

async function refreshAccessToken(channel) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: channel.oauth_refresh_token });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return { oauth2Client, credentials };
}

async function pickCategoryForChannel(channel) {
  const { data: links, error } = await supabase
    .from('channel_categories')
    .select('category_id, priority')
    .eq('channel_id', channel.id)
    .order('priority', { ascending: true });
  if (error) throw error;
  if (!links || links.length === 0) return null;
  // simple version for now: always use the first (lowest priority number).
  // Once a channel has multiple categories, this is the spot to add real round-robin.
  return links[0].category_id;
}

async function pickNextVideo(categoryId) {
  const { data: videos, error } = await supabase
    .from('videos')
    .select('*')
    .eq('category_id', categoryId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return videos && videos[0] ? videos[0] : null;
}

async function claimVideo(video, channel, categoryId) {
  const { data, error } = await supabase
    .from('post_queue')
    .insert({
      video_id: video.id,
      channel_id: channel.id,
      category_id: categoryId,
      scheduled_date: todayDateString(),
      status: 'uploading',
      publish_mode: PRIVACY_STATUS,
    })
    .select()
    .single();
  if (error) throw error; // unique constraint stops double-claims automatically
  return data;
}

async function uploadToYouTube(oauth2Client, video, metadata) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const videoResp = await fetch(video.source_url);
  if (!videoResp.ok) {
    throw new Error(`Failed to download video from Dropbox: ${videoResp.status}`);
  }

  const insertResp = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
      },
      status: {
        privacyStatus: PRIVACY_STATUS,
      },
    },
    media: {
      body: videoResp.body,
    },
  });

  return insertResp.data.id;
}

async function main() {
  const { data: channels, error: chErr } = await supabase.from('channels').select('*');
  if (chErr) throw chErr;

  if (!channels || channels.length === 0) {
    console.log('No connected channels found. Nothing to do.');
    return;
  }

  console.log(`Found ${channels.length} channel(s). Privacy status: ${PRIVACY_STATUS}. Dry run: ${DRY_RUN}\n`);

  for (const channel of channels) {
    console.log(`--- ${channel.name} ---`);
    try {
      const categoryId = await pickCategoryForChannel(channel);
      if (!categoryId) {
        console.log('No category linked to this channel yet. Skipping.\n');
        continue;
      }

      const video = await pickNextVideo(categoryId);
      if (!video) {
        console.log('No pending videos left in this channel\'s category. Skipping.\n');
        continue;
      }

      console.log(`Selected video: ${video.original_title} (${video.id})`);

      const claim = await claimVideo(video, channel, categoryId);

      const { data: seoRows } = await supabase
        .from('video_seo')
        .select('*')
        .eq('video_id', video.id)
        .limit(1);
      const seo = seoRows && seoRows[0] ? seoRows[0] : null;
      const metadata = buildMetadata(video, seo);
      console.log(`Using ${seo ? 'Gemini-generated' : 'original (fallback)'} metadata: "${metadata.title}"`);

      if (DRY_RUN) {
        console.log('Dry run — skipping actual upload.\n');
        await supabase.from('post_queue').update({ status: 'posted', error_message: '[dry run]' }).eq('id', claim.id);
        continue;
      }

      const { oauth2Client } = await refreshAccessToken(channel);
      const youtubeVideoId = await uploadToYouTube(oauth2Client, video, metadata);

      await supabase
        .from('post_queue')
        .update({ status: 'posted', youtube_video_id: youtubeVideoId })
        .eq('id', claim.id);
      await supabase.from('videos').update({ status: 'posted' }).eq('id', video.id);

      console.log(`✓ Uploaded: https://youtube.com/watch?v=${youtubeVideoId}\n`);
    } catch (err) {
      console.error(`✗ Error for ${channel.name}: ${err.message}\n`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
