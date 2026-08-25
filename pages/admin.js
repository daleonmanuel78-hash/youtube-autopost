import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '../lib/ThemeContext';

export default function AdminPanel() {
  const router = useRouter();
  const { from } = router.query; // channel id to return to, if opened from a channel dashboard
  const { colors: c, font } = useTheme();
  const [secret, setSecret] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(null);
  const [liveMode, setLiveMode] = useState(null); // null = unknown yet, true/false once loaded
  const [liveModeBusy, setLiveModeBusy] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('admin_secret') : null;
    if (saved) {
      setSecret(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) loadLiveModeStatus();
  }, [unlocked]);

  async function unlock() {
    setUnlockError(null);
    if (!secret.trim()) {
      setUnlockError('Please enter a password.');
      return;
    }
    setUnlocking(true);
    try {
      // Verify against the server before ever showing the panel — this used
      // to just accept whatever was typed and only fail later on some other
      // action, which was confusing. Reusing live-mode/status here since
      // it's already admin-gated and side-effect-free; a 401 specifically
      // means the password itself was wrong, any other response means the
      // password is correct even if something else (like GitHub) has its
      // own separate problem.
      const resp = await fetch('/api/admin/live-mode/status', { headers: { 'x-admin-secret': secret } });
      if (resp.status === 401) {
        setUnlockError('Incorrect password.');
        setUnlocking(false);
        return;
      }
      sessionStorage.setItem('admin_secret', secret);
      setUnlocked(true);
    } catch (err) {
      setUnlockError(`Couldn't verify password: ${err.message}`);
    } finally {
      setUnlocking(false);
    }
  }

  const [liveModeError, setLiveModeError] = useState(null);

  async function loadLiveModeStatus() {
    setLiveModeError(null);
    try {
      const resp = await fetch('/api/admin/live-mode/status', { headers: { 'x-admin-secret': secret } });
      const data = await resp.json();
      if (resp.ok) {
        setLiveMode(data.enabled);
      } else {
        setLiveModeError(data.error || 'Failed to check Live Mode status.');
        setLiveMode(false); // don't leave the button stuck disabled forever — assume off, let them retry
      }
    } catch (err) {
      setLiveModeError(err.message);
      setLiveMode(false);
    }
  }

  async function toggleLiveMode() {
    setLiveModeBusy(true);
    try {
      const resp = await fetch('/api/admin/live-mode/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ enable: !liveMode }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setLiveMode(data.enabled);
        // No instant post here anymore — with a real 12-hour schedule now
        // in place, an extra post-on-toggle would just make the timing
        // unpredictable depending on which day you happen to flip this.
        // The next post happens automatically at the next scheduled slot.
      } else {
        setLog([data.error || 'Failed to toggle Live Mode.']);
      }
    } catch (err) {
      setLog([`Request failed: ${err.message}`]);
    } finally {
      setLiveModeBusy(false);
    }
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
      <div style={{ fontFamily: font.body, maxWidth: 400, margin: '80px auto', padding: 24 }}>
        <h2 style={{ fontFamily: font.display }}>Admin Panel</h2>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Admin password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            style={{ width: '100%', padding: '10px 40px 10px 10px', border: `1px solid ${c.border}`, borderRadius: 6, background: c.cardBg, color: c.text, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => setShowPassword((s) => !s)}
            type="button"
            title={showPassword ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: c.textDim, padding: 4 }}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {unlockError && (
          <div style={{ fontSize: 12.5, color: c.statusFailed, background: c.statusFailedBg, borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
            {unlockError}
          </div>
        )}
        <button
          onClick={unlock}
          disabled={unlocking}
          style={{ width: '100%', padding: 10, background: c.statusScheduled, color: '#fff', border: 'none', borderRadius: 6, cursor: unlocking ? 'default' : 'pointer', fontWeight: 600, opacity: unlocking ? 0.7 : 1 }}
        >
          {unlocking ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: font.body, maxWidth: 700, margin: '0 auto', padding: 32, background: c.bg, minHeight: '100vh', color: c.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontFamily: font.display, margin: 0 }}>Admin Panel</h1>
        <button
          onClick={() => router.push(from ? `/channels/${from}` : '/')}
          style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: c.statusScheduled, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          ← Back {from ? 'to channel' : 'to channels'}
        </button>
      </div>
      <p style={{ color: c.textDim, fontSize: 13 }}>Manual controls for testing and running jobs on demand.</p>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        border: `1px solid ${liveMode ? c.statusPublic : c.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20,
        background: liveMode ? c.statusPublicBg : c.cardBg,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {liveMode && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.statusPublic, display: 'inline-block' }} />}
            Live Mode {liveMode === null ? '' : liveMode ? '— ON' : '— OFF'}
          </div>
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
            When on, one video per category posts automatically twice a day, 12 hours apart (around 6:00 AM and 6:00 PM US Eastern).
          </div>
        </div>
        <button
          onClick={toggleLiveMode}
          disabled={liveMode === null || liveModeBusy}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: liveModeBusy ? 'default' : 'pointer',
            background: liveMode ? c.statusFailed : c.statusPublic, color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}
        >
          {liveModeBusy ? 'Working…' : liveMode ? 'Stop' : 'Go Live'}
        </button>
      </div>

      {liveModeError && (
        <div style={{ fontSize: 12.5, color: c.statusFailed, background: c.statusFailedBg, borderRadius: 8, padding: '10px 14px', marginTop: -12, marginBottom: 20 }}>
          ⚠ Couldn't check Live Mode status: {liveModeError}. This usually means GITHUB_TOKEN is missing or invalid on this server.
          <button onClick={loadLiveModeStatus} style={{ marginLeft: 10, fontSize: 11.5, textDecoration: 'underline', background: 'none', border: 'none', color: c.statusFailed, cursor: 'pointer', padding: 0 }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <ActionButton label="Post today's video (private test)" running={running === 'post-private'} c={c} bg={c.statusScheduled}
          onClick={() => runAction('post-private', '/api/admin/daily-post', { privacyStatus: 'private' })} />
        <ActionButton label="Post today's video (PUBLIC)" running={running === 'post-public'} c={c} bg={c.accent}
          onClick={() => runAction('post-public', '/api/admin/daily-post', { privacyStatus: 'public' })} />
        <ActionButton label="Generate SEO (next 10)" running={running === 'seo'} c={c} bg={c.statusScheduled}
          onClick={() => runAction('seo', '/api/admin/generate-seo', { count: 10 })} />
        <ActionButton label="Refresh analytics" running={running === 'analytics'} c={c} bg={c.statusPublic}
          onClick={() => runAction('analytics', '/api/admin/refresh-analytics', {})} />
      </div>

      <div style={{ background: '#15161B', color: '#4ADE80', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 10, minHeight: 200, whiteSpace: 'pre-wrap' }}>
        {log.length === 0 ? 'No output yet. Click a button above.' : log.join('\n')}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, running, c, bg }) {
  return (
    <button
      onClick={onClick}
      disabled={!!running}
      style={{
        padding: '10px 16px',
        background: bg,
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
