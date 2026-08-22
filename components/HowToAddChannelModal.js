import { useTheme } from "../lib/ThemeContext";

const STEPS = [
  {
    title: 'Create a Google Cloud project',
    body: 'Go to console.cloud.google.com — click the project dropdown at the top → "New Project". Name it anything (e.g. "youtube-autopost"). Click Create, then make sure it\'s selected in the top project dropdown.',
  },
  {
    title: 'Enable both YouTube APIs',
    body: 'With the new project selected, go to APIs & Services → Library. Search "YouTube Data API v3" → click it → Enable. Then search "YouTube Analytics API" → click it → Enable.',
  },
  {
    title: 'Configure the OAuth consent screen',
    body: 'Go to APIs & Services → OAuth consent screen. Choose "External" user type. Fill in an App name, your email as support contact, and your email as developer contact. On the Scopes step, add these 4 exact scopes:\nyoutube.upload\nyoutube.readonly\nyt-analytics.readonly\nyoutube.force-ssl',
  },
  {
    title: 'Add test users',
    body: 'On the Test users step, click "+ Add Users" and add the Google account that owns this channel (and any other channel-owning accounts you plan to connect, while you\'re here). Save. While the app is in Testing mode, only accounts on this list can connect.',
  },
  {
    title: 'Create OAuth credentials with the exact redirect URIs',
    body: 'Go to APIs & Services → Credentials → "+ Create Credentials" → "OAuth client ID". Application type: "Web application". Under "Authorized redirect URIs", add BOTH of these exactly:\nhttp://localhost:3000/api/auth/callback\nhttps://youtube-autopost-ii0e.onrender.com/api/auth/callback\nClick Create.',
  },
  {
    title: 'Copy the Client ID and Client Secret',
    body: 'A popup shows your new Client ID and Client Secret — copy both. You can also find them later by clicking back into this credential on the Credentials page.',
  },
  {
    title: 'Update .env.local with these values',
    body: 'Open your project\'s .env.local file and set:\nGOOGLE_CLIENT_ID=(paste your Client ID)\nGOOGLE_CLIENT_SECRET=(paste your Client Secret)\nSave the file, then restart npm run dev so it picks up the change. If you\'re deploying to Render, update the same two values there too, under the Environment tab.',
  },
  {
    title: 'Click "Add channel"',
    body: 'Back here, click "+ Add channel" in the sidebar, sign in with the Google account that owns the channel, and approve access.',
  },
  {
    title: 'Choose a category',
    body: 'Once connected, pick which video category feeds this channel — that determines what gets posted here automatically.',
  },
];

export default function HowToAddChannelModal({ onClose }) {
  const { colors: c, font } = useTheme();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cardBg, borderRadius: 14, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💡</span> How to add a channel
        </div>
        <div style={{ color: c.textDim, fontSize: 13, marginBottom: 20 }}>
          A one-time setup per Google Cloud project — most channels can reuse the same project, so you'll usually only skip to step 8.
        </div>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: c.accentDim, color: c.accent, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: c.textDim, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{s.body}</div>
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: 8, padding: '10px 20px', background: c.statusScheduled, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
