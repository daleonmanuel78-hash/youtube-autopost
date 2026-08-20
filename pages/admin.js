import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { theme } from '../styles/theme';

export default function AdminPanel() {
  const router = useRouter();
  const { from } = router.query; // channel id to return to, if opened from a channel dashboard
  const c = theme.colors;
  const [secret, setSecret] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('admin_secret') : null;
    if (saved) {
      setSecret(saved);
      setUnlocked(true);
    }
  }, []);

  function unlock() {
    sessionStorage.setItem('admin_secret', secret);
    setUnlocked(true);
  }

  async function runAction(name, url, body) {
    setRunning(name);
    setLog([`Running ${name}...`]);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify(body || {}),
      });
      const data = await resp.json();
      if (resp.status === 401) {
        setLog(['Unauthorized — check your admin password.']);
        setUnlocked(false);
        sessionStorage.removeItem('admin_secret');
        return;
      }
      setLog(data.log || [data.error || 'No response']);
    } catch (err) {
      setLog([`Request failed: ${err.message}`]);
    } finally {
      setRunning(null);
    }
  }

  if (!unlocked) {
    return (
      <div style={{ fontFamily: theme.font.body, maxWidth: 400, margin: '80px auto', padding: 24 }}>
        <h2 style={{ fontFamily: theme.font.display }}>Admin Panel</h2>
        <input
          type="password"
          placeholder="Admin password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && unlock()}
          style={{ width: '100%', padding: 10, marginBottom: 12, border: `1px solid ${c.border}`, borderRadius: 6 }}
        />
        <button onClick={unlock} style={{ width: '100%', padding: 10, background: c.text, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Unlock
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: theme.font.body, maxWidth: 700, margin: '0 auto', padding: 32, background: c.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontFamily: theme.font.display, margin: 0 }}>Admin Panel</h1>
        <button
          onClick={() => router.push(from ? `/channels/${from}` : '/')}
          style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: '#fff', cursor: 'pointer' }}
        >
          ← Back {from ? 'to channel' : 'to channels'}
        </button>
      </div>
      <p style={{ color: c.textDim, fontSize: 13 }}>Manual controls for testing and running jobs on demand.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <ActionButton label="Post today's video (private test)" running={running === 'post-private'} c={c}
          onClick={() => runAction('post-private', '/api/admin/daily-post', { privacyStatus: 'private' })} />
        <ActionButton label="Post today's video (PUBLIC)" running={running === 'post-public'} danger c={c}
          onClick={() => runAction('post-public', '/api/admin/daily-post', { privacyStatus: 'public' })} />
        <ActionButton label="Generate SEO (next 10)" running={running === 'seo'} c={c}
          onClick={() => runAction('seo', '/api/admin/generate-seo', { count: 10 })} />
        <ActionButton label="Refresh analytics" running={running === 'analytics'} c={c}
          onClick={() => runAction('analytics', '/api/admin/refresh-analytics', {})} />
      </div>

      <div style={{ background: '#15161B', color: '#4ADE80', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 10, minHeight: 200, whiteSpace: 'pre-wrap' }}>
        {log.length === 0 ? 'No output yet. Click a button above.' : log.join('\n')}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, running, danger, c }) {
  return (
    <button
      onClick={onClick}
      disabled={!!running}
      style={{
        padding: '10px 16px',
        background: danger ? c.accent : c.text,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: running ? 'default' : 'pointer',
        opacity: running ? 0.6 : 1,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {running ? 'Running…' : label}
    </button>
  );
}
