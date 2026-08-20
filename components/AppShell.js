import { useState } from 'react';
import { useRouter } from 'next/router';
import { theme } from '../styles/theme';
import HowToAddChannelModal from './HowToAddChannelModal';

export default function AppShell({ channels = [], activeChannelId, children }) {
  const router = useRouter();
  const c = theme.colors;
  const [howToOpen, setHowToOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg }}>
      <aside style={{ width: 240, flexShrink: 0, background: c.sidebarBg, color: c.sidebarText, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px 12px' }}>
          <div style={{ fontFamily: theme.font.display, fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: -0.3 }}>
            YT Auto-Posting
          </div>
          <div style={{ fontSize: 11, color: c.sidebarTextDim, marginTop: 2 }}>Channel roster</div>
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
                  {ch.thumbnail_url ? (
                    <img
                      src={ch.thumbnail_url}
                      alt=""
                      width={32}
                      height={32}
                      style={{
                        borderRadius: '50%',
                        border: `2px solid ${active ? theme.colors.accent : 'transparent'}`,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.sidebarBgHover, border: `2px solid ${active ? theme.colors.accent : 'transparent'}` }} />
                  )}
                  {ch.pendingCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        background: theme.colors.accent,
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
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: c.sidebarTextDim, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
          >
            ? How to add a channel
          </button>
          <button
            onClick={() => router.push(`/admin${activeChannelId ? `?from=${activeChannelId}` : ''}`)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: c.sidebarTextDim, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
          >
            ⚙ Admin panel
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {howToOpen && <HowToAddChannelModal onClose={() => setHowToOpen(false)} />}
    </div>
  );
}
