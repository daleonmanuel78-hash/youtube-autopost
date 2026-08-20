import { google } from 'googleapis';
import { getOAuthClient } from '../../../lib/google';
import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) return res.status(400).send(`Google returned an error: ${error}`);
  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResp = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channelResp.data.items?.[0];
    if (!channel) return res.status(400).send('No YouTube channel found on this Google account.');

    const youtubeChannelId = channel.id;
    const name = channel.snippet.title;
    const thumbnailUrl = channel.snippet.thumbnails?.default?.url || null;

    if (!tokens.refresh_token) {
      return res.status(400).send(
        'No refresh token returned. Go to myaccount.google.com/permissions, remove access for this app, then try connecting again.'
      );
    }

    const { data: savedChannel, error: dbError } = await supabaseAdmin
      .from('channels')
      .upsert(
        {
          name,
          youtube_channel_id: youtubeChannelId,
          oauth_refresh_token: tokens.refresh_token,
          oauth_access_token: tokens.access_token,
          token_expires_at: new Date(tokens.expiry_date).toISOString(),
          thumbnail_url: thumbnailUrl,
          archived_at: null, // reconnecting un-archives a previously removed channel
        },
        { onConflict: 'youtube_channel_id' }
      )
      .select()
      .single();

    if (dbError) return res.status(500).send(`Saved tokens but failed to write to Supabase: ${dbError.message}`);

    // Land directly on this channel's page — if it has no category linked yet,
    // the page itself shows the picker immediately.
    res.redirect(`/channels/${savedChannel.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`OAuth callback failed: ${err.message}`);
  }
}
