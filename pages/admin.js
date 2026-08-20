import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [secret, setSecret] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(null); // which button is currently running

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
      <div style={{ fontFamily: 'sans-serif', maxWidth: 400, margin: '80px auto', padding: 24 }}>
        <h2>Admin Panel</h2>
        <input
          type="password"
          placeholder="Admin password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && unlock()}
          style={{ width: '100%', padding: 10, marginBottom: 12, border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button onClick={unlock} style={{ width: '100%', padding: 10, background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Unlock
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 700, margin: '0 auto', padding: 32 }}>
      <h1>Admin Panel</h1>
      <p style={{ color: '#666', fontSize: 13 }}>Manual controls for testing and running jobs on demand.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <ActionButton label="Post today's video (private test)" running={running === 'post-private'}
          onClick={() => runAction('post-private', '/api/admin/daily-post', { privacyStatus: 'private' })} />
        <ActionButton label="Post today's video (PUBLIC)" running={running === 'post-public'} danger
          onClick={() => runAction('post-public', '/api/admin/daily-post', { privacyStatus: 'public' })} />
        <ActionButton label="Generate SEO (next 10)" running={running === 'seo'}
          onClick={() => runAction('seo', '/api/admin/generate-seo', { count: 10 })} />
        <ActionButton label="Refresh analytics" running={running === 'analytics'}
          onClick={() => runAction('analytics', '/api/admin/refresh-analytics', {})} />
      </div>

      <div style={{ background: '#111', color: '#0f0', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 8, minHeight: 200, whiteSpace: 'pre-wrap' }}>
        {log.length === 0 ? 'No output yet. Click a button above.' : log.join('\n')}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, running, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={!!running}
      style={{
        padding: '10px 16px',
        background: danger ? '#b91c1c' : '#111',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: running ? 'default' : 'pointer',
        opacity: running ? 0.6 : 1,
        fontSize: 13,
      }}
    >
      {running ? 'Running…' : label}
    </button>
  );
}
