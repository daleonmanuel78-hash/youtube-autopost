import { google } from 'googleapis';

export async function refreshAccessToken(channel) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: channel.oauth_refresh_token });
  await oauth2Client.refreshAccessToken();
  return oauth2Client;
}
