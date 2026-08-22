import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '../lib/ThemeContext';
import HowToAddChannelModal from './HowToAddChannelModal';
import NotificationBell from './NotificationBell';

export default function AppShell({ channels = [], activeChannelId, children }) {
  const router = useRouter();
  const { colors: c, font, mode, toggle } = useTheme();
  const [howToOpen, setHowToOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg }}>
      <aside style={{ width: 240, flexShrink: 0, background: c.sidebarBg, color: c.sidebarText, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: -0.3 }}>
              YT Auto-Posting
            </div>
            <div style={{ fontSize: 11, color: c.sidebarTextDim, marginTop: 2 }}>Channel roster</div>
          </div>
          <button
            onClick={toggle}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 20, border: 'none',
              background: mode === 'dark' ? '#FBBF24' : '#3730A3',
              color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15 }}>{mode === 'dark' ? '☀️' : '🌙'}</span>
            {mode === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {channels.map((ch) => {
            const active = ch.id === activeChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => router.push(`/channels/${ch.id}`)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  marginBottom: 2,
                  borderRadius: 8,
                  border: 'none',
                  background: active ? c.sidebarBgHover : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {(ch.custom_logo_url || ch.thumbnail_url) ? (
                    <img
                      src={ch.custom_logo_url || ch.thumbnail_url}
                      alt=""
                      width={32}
                      height={32}
                      style={{
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${active ? c.accent : 'transparent'}`,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.sidebarBgHover, border: `2px solid ${active ? c.accent : 'transparent'}` }} />
                  )}
                  {ch.pendingCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        background: c.accent,
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 8,
                        minWidth: 15,
                        height: 15,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `2px solid ${c.sidebarBg}`,
                        padding: '0 2px',
                      }}
                      title={`${ch.pendingCount} queued`}
                    >
                      {ch.pendingCount > 99 ? '99+' : ch.pendingCount}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#fff' : c.sidebarText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch.name}
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={() => router.push('/api/auth/connect')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              marginTop: 6,
              borderRadius: 8,
              border: `1px dashed ${c.sidebarTextDim}`,
              background: 'transparent',
              color: c.sidebarTextDim,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add channel
          </button>
        </nav>

        <div style={{ padding: 12, borderTop: `1px solid ${c.sidebarBgHover}` }}>
          <button
            onClick={() => setHowToOpen(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'rgba(251, 191, 36, 0.12)', color: '#FBBF24', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'left', marginBottom: 4 }}
          >
            <span style={{ fontSize: 16 }}>💡</span> How to add a channel
          </button>
          <button
            onClick={() => router.push(`/admin${activeChannelId ? `?from=${activeChannelId}` : ''}`)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: c.sidebarTextDim, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
          >
            ⚙ Admin panel
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px 0' }}>
          <NotificationBell />
        </div>
        {children}
      </main>

      {howToOpen && <HowToAddChannelModal onClose={() => setHowToOpen(false)} />}
    </div>
  );
}
