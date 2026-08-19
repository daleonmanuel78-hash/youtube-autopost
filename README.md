# YouTube auto-post dashboard (Phase 3 starter)

## What's here
- `/api/auth/connect` — redirects to Google's OAuth consent screen
- `/api/auth/callback` — handles the redirect back, saves the channel + tokens to Supabase
- `/` — lists connected channels, has an "Add channel" button

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your real values.
3. In Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs,
   make sure `http://localhost:3000/api/auth/callback` is listed.
4. `npm run dev`
5. Open http://localhost:3000, click "Add channel", approve access with the Google account
   that owns one of your YouTube channels.
6. You should land back on the dashboard and see the channel listed.

## Notes
- If you see "No refresh token returned" — go to
  https://myaccount.google.com/permissions, remove this app's access, and try again.
  Google only issues a refresh_token on the *first* consent unless access was revoked.
- Once this works locally, we deploy it to Render and add the Render URL's
  `/api/auth/callback` as a second Authorized redirect URI in GCP (Phase 9 in the
  build plan, but we'll do a lightweight version now so OAuth can work in production too).
