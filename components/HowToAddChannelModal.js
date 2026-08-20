import { theme } from '../styles/theme';

const STEPS = [
  { title: 'Create a Google Cloud project', body: 'Go to console.cloud.google.com and create a new project (or reuse an existing one) dedicated to this system.' },
  { title: 'Enable the YouTube APIs', body: 'In APIs & Services → Library, enable "YouTube Data API v3" and "YouTube Analytics API".' },
  { title: 'Configure the OAuth consent screen', body: 'In APIs & Services → OAuth consent screen, add the required scopes and, while in Testing mode, add the Google account that owns the channel as a test user.' },
  { title: 'Create OAuth credentials', body: 'In APIs & Services → Credentials, create an OAuth 2.0 Client ID (Web application) and add this app\'s callback URL to Authorized redirect URIs.' },
  { title: 'Click "Add channel"', body: 'Back here, click "+ Add channel" in the sidebar, sign in with the Google account that owns the channel, and approve access.' },
  { title: 'Choose a category', body: 'Once connected, pick which video category feeds this channel — that determines what gets posted here automatically.' },
];

export default function HowToAddChannelModal({ onClose }) {
  const c = theme.colors;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cardBg, borderRadius: 14, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ fontFamily: theme.font.display, fontWeight: 700, fontSize: 20, marginBottom: 4 }}>How to add a channel</div>
        <div style={{ color: c.textDim, fontSize: 13, marginBottom: 20 }}>A one-time setup per Google Cloud project — most channels can reuse the same project.</div>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: c.accentDim, color: c.accent, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i + 1}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: c.textDim, lineHeight: 1.5 }}>{s.body}</div>
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: 8, padding: '10px 20px', background: c.text, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
