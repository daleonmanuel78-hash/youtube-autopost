import { getOAuthClient, SCOPES } from '../../../lib/google';

export default function handler(req, res) {
  const oauth2Client = getOAuthClient();

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // required to get a refresh_token back
    prompt: 'consent',        // forces Google to re-issue a refresh_token every time
    scope: SCOPES,
  });

  res.redirect(url);
}
