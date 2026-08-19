// Phase 6: Analytics ingestion
//
// For every video that's been posted to YouTube, pulls current stats (views,
// likes, comments from the Data API; watch time, impressions, CTR from the
// YouTube Analytics API) and saves a snapshot for today. Safe to re-run —
// re-running today just updates today's snapshot rather than duplicating it.
//
// Setup (in your project folder):
//   npm install googleapis ws @supabase/supabase-js
//
// Run:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SECRET_KEY="your_secret_key"
//   $env:GOOGLE_CLIENT_ID="your_client_id"
//   $env:GOOGLE_CLIENT_SECRET="your_client_secret"
//   node refresh-analytics.js

const ws = require('ws');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws;
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Missing SUPABASE_URL, SUPABASE_SECRET_KEY, GOOGLE_CLIENT_ID, or GOOGLE_CLIENT_SECRET.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: { transport: ws },
});

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function refreshAccessToken(channel) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: channel.oauth_refresh_token });
  await oauth2Client.refreshAccessToken();
  return oauth2Client;
}

async function getStats(youtube, youtubeVideoId) {
  const resp = await youtube.videos.list({ part: ['statistics'], id: [youtubeVideoId] });
  const stats = resp.data.items?.[0]?.statistics;
  return {
    views: stats?.viewCount ? Number(stats.viewCount) : null,
    likes: stats?.likeCount ? Number(stats.likeCount) : null,
    comments: stats?.commentCount ? Number(stats.commentCount) : null,
  };
}

async function getWatchTimeAndImpressions(youtubeAnalytics, channelId, youtubeVideoId) {
  try {
    const resp = await youtubeAnalytics.reports.query({
      ids: `channel==${channelId}`,
      startDate: '2020-01-01', // wide range so we always capture lifetime totals
      endDate: todayDateString(),
      metrics: 'estimatedMinutesWatched,impressions,impressionsClickThroughRate',
      filters: `video==${youtubeVideoId}`,
    });
    const row = resp.data.rows?.[0];
    if (!row) return { watch_time_minutes: null, impressions: null, ctr: null };
    return {
      watch_time_minutes: row[0] ?? null,
      impressions: row[1] ?? null,
      ctr: row[2] ?? null,
    };
  } catch (err) {
    // Analytics can be unavailable for very new videos or certain video types — don't fail the whole run over it
    return { watch_time_minutes: null, impressions: null, ctr: null };
  }
}

async function main() {
  const { data: posted, error: pqErr } = await supabase
    .from('post_queue')
    .select('youtube_video_id, channel_id')
    .eq('status', 'posted')
    .not('youtube_video_id', 'is', null);
  if (pqErr) throw pqErr;

  if (!posted || posted.length === 0) {
    console.log('No posted videos yet. Nothing to refresh.');
    return;
  }

  // group by channel so we only refresh each channel's token once
  const byChannel = {};
  for (const row of posted) {
    if (!byChannel[row.channel_id]) byChannel[row.channel_id] = [];
    byChannel[row.channel_id].push(row.youtube_video_id);
  }

  const { data: channels, error: chErr } = await supabase.from('channels').select('*');
  if (chErr) throw chErr;
  const channelById = Object.fromEntries(channels.map((c) => [c.id, c]));

  const today = todayDateString();
  let updated = 0;
  let failed = 0;

  for (const [channelId, videoIds] of Object.entries(byChannel)) {
    const channel = channelById[channelId];
    if (!channel) continue;

    console.log(`--- ${channel.name}: ${videoIds.length} video(s) ---`);
    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

    for (const youtubeVideoId of videoIds) {
      try {
        const stats = await getStats(youtube, youtubeVideoId);
        const extra = await getWatchTimeAndImpressions(youtubeAnalytics, channel.youtube_channel_id, youtubeVideoId);

        const { error: upsertErr } = await supabase.from('video_analytics_snapshots').upsert(
          {
            youtube_video_id: youtubeVideoId,
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            watch_time_minutes: extra.watch_time_minutes,
            impressions: extra.impressions,
            ctr: extra.ctr,
            snapshot_date: today,
          },
          { onConflict: 'youtube_video_id,snapshot_date' }
        );
        if (upsertErr) throw upsertErr;

        updated++;
        console.log(`✓ ${youtubeVideoId}: ${stats.views ?? 0} views, ${stats.likes ?? 0} likes, ${stats.comments ?? 0} comments`);
      } catch (err) {
        failed++;
        console.error(`✗ ${youtubeVideoId}: ${err.message}`);
      }
    }
    console.log('');
  }

  console.log(`Done. ${updated} snapshots updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Analytics refresh failed:', err);
  process.exit(1);
});
