import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../lib/ThemeContext';

const TYPE_LABELS = {
  'daily-post': 'Daily Post',
  'generate-seo': 'SEO Generation',
  'refresh-analytics': 'Analytics Refresh',
  'manual-upload': 'Manual Upload',
};

export default function NotificationBell() {
  const { colors: c, font } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const wrapperRef = useRef(null);

  function load() {
    fetch('/api/notifications/list')
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications || []);
        setUnreadCount(d.unreadCount || 0);
      })
      .catch((err) => {
        // A transient failure (e.g. the dev server recompiling mid-request)
        // shouldn't crash the whole page — just skip this poll and try
        // again on the next interval.
        console.warn('Notification poll failed, will retry:', err.message);
      });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // poll every 15s for a near-real-time feel
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      try {
        await fetch('/api/notifications/mark-read', { method: 'POST' });
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch (err) {
        console.warn('Failed to mark notifications read:', err.message);
      }
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={toggleOpen}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${c.border}`,
          background: c.cardBg, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: c.statusFailed, color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${c.bg}`, padding: '0 2px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 420, overflowY: 'auto',
          background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', zIndex: 100,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: font.display }}>Recent activity</span>
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (!confirm('Clear all notifications? This cannot be undone.')) return;
                  await fetch('/api/notifications/clear-all', { method: 'POST' });
                  setNotifications([]);
                  setUnreadCount(0);
                }}
                style={{ fontSize: 11, color: c.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: c.textDim, textAlign: 'center' }}>Nothing yet.</div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                <button
                  onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 8 }}>{n.status === 'success' ? '🟢' : '🔴'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.textDim, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    <span style={{ fontSize: 10.5, color: c.textDim, marginLeft: 'auto' }}>
                      {new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 3, color: c.text }}>{n.title}</div>
                </button>
                {expandedId === n.id && n.summary?.length > 0 && (
                  <div style={{ padding: '0 16px 12px', fontSize: 11, color: c.textDim, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {n.summary.join('\n')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
