import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '../lib/ThemeContext';

const TIMEZONE_OPTIONS = [
  { label: 'United States — Eastern', value: 'America/New_York' },
  { label: 'United States — Central', value: 'America/Chicago' },
  { label: 'United States — Mountain', value: 'America/Denver' },
  { label: 'United States — Pacific', value: 'America/Los_Angeles' },
  { label: 'Philippines', value: 'Asia/Manila' },
  { label: 'United Kingdom', value: 'Europe/London' },
  { label: 'Australia — Sydney', value: 'Australia/Sydney' },
  { label: 'India', value: 'Asia/Kolkata' },
  { label: 'Japan', value: 'Asia/Tokyo' },
  { label: 'Canada — Eastern', value: 'America/Toronto' },
  { label: 'Germany', value: 'Europe/Berlin' },
  { label: 'Singapore', value: 'Asia/Singapore' },
];

export default function AdminPanel() {
  const router = useRouter();
  const { from } = router.query;
  const { colors: c, font } = useTheme();
  const [secret, setSecret] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(null);

  const [liveMode, setLiveMode] = useState(null);
  const [liveModeBusy, setLiveModeBusy] = useState(false);
  const [liveModeError, setLiveModeError] = useState(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York');
  const [scheduleTimes, setScheduleTimes] = useState(['18:00']);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState(null);

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsPage, setDraftsPage] = useState(1);
  const [draftsTotalPages, setDraftsTotalPages] = useState(1);
  const [draftsTotalCount, setDraftsTotalCount] = useState(0);
  const [draftsSearch, setDraftsSearch] = useState('');
  const [draftsCategory, setDraftsCategory] = useState('');
  const [draftsCategories, setDraftsCategories] = useState([]);
  const [expandedDraftId, setExpandedDraftId] = useState(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('admin_secret') : null;
    if (saved) {
      setSecret(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) {
      loadLiveModeStatus();
      loadSchedule();
    }
  }, [unlocked]);

  async function unlock() {
    setUnlockError(null);
    if (!secret.trim()) {
      setUnlockError('Please enter a password.');
      return;
    }
    setUnlocking(true);
    try {
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

  async function loadLiveModeStatus() {
    setLiveModeError(null);
    try {
      const resp = await fetch('/api/admin/live-mode/status', { headers: { 'x-admin-secret': secret } });
      const data = await resp.json();
      if (resp.ok) {
        setLiveMode(data.enabled);
      } else {
        setLiveModeError(data.error || 'Failed to check Live Mode status.');
        setLiveMode(false);
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
      } else {
        setLog([data.error || 'Failed to toggle Live Mode.']);
      }
    } catch (err) {
      setLog([`Request failed: ${err.message}`]);
    } finally {
      setLiveModeBusy(false);
    }
  }

  async function loadSchedule() {
    try {
      const resp = await fetch('/api/admin/live-mode/schedule', { headers: { 'x-admin-secret': secret } });
      const data = await resp.json();
      if (resp.ok) {
        setScheduleTimezone(data.timezone);
        setScheduleTimes(data.post_times || ['18:00']);
      }
    } catch (err) {
      console.error('Failed to load schedule:', err.message);
    }
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleMessage(null);
    try {
      const resp = await fetch('/api/admin/live-mode/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ timezone: scheduleTimezone, postTimes: scheduleTimes }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setScheduleMessage('✓ Saved. New times take effect on the next scheduled check.');
      } else {
        setScheduleMessage(`✗ ${data.error || 'Failed to save.'}`);
      }
    } catch (err) {
      setScheduleMessage(`✗ ${err.message}`);
    } finally {
      setScheduleSaving(false);
    }
  }

  function addTimeSlot() {
    setScheduleTimes([...scheduleTimes, '18:00']);
  }

  function updateTimeSlot(index, value) {
    const next = [...scheduleTimes];
    next[index] = value;
    setScheduleTimes(next);
  }

  function removeTimeSlot(index) {
    setScheduleTimes(scheduleTimes.filter((_, i) => i !== index));
  }

  async function loadDrafts(page = draftsPage) {
    setDraftsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (draftsSearch) params.set('search', draftsSearch);
      if (draftsCategory) params.set('categoryId', draftsCategory);
      const resp = await fetch(`/api/admin/drafts?${params}`, { headers: { 'x-admin-secret': secret } });
      const data = await resp.json();
      if (resp.status === 401) {
        setUnlocked(false);
        sessionStorage.removeItem('admin_secret');
        return;
      }
      setDrafts(data.videos || []);
      setDraftsTotalPages(data.totalPages || 1);
      setDraftsTotalCount(data.totalCount || 0);
      setDraftsCategories(data.categories || []);
      setDraftsPage(page);
    } catch (err) {
      console.error('Failed to load drafts:', err.message);
    } finally {
      setDraftsLoading(false);
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

  async function testEmail() {
    setRunning('test-email');
    setLog(['Sending a test email...']);
    try {
      const resp = await fetch('/api/admin/test-email', { headers: { 'x-admin-secret': secret } });
      const data = await resp.json();
      if (resp.status === 401) {
        setLog(['Unauthorized — check your admin password.']);
        setUnlocked(false);
        sessionStorage.removeItem('admin_secret');
        return;
      }
      if (data.success) {
        setLog([`✓ Test email sent successfully to ${data.sentTo}.`, `Message ID: ${data.messageId}`, 'Check that inbox (and spam folder) now.']);
      } else {
        setLog([
          '✗ Test email failed.',
          data.reason || `Error: ${data.errorMessage}`,
          data.errorCode ? `Error code: ${data.errorCode}` : '',
          data.sentFrom ? `Sending from: ${data.sentFrom}` : '',
          data.sentTo ? `Sending to: ${data.sentTo}` : '',
        ].filter(Boolean));
      }
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
        border: `1px solid ${liveMode ? c.statusPublic : c.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12,
        background: liveMode ? c.statusPublicBg : c.cardBg,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {liveMode && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.statusPublic, display: 'inline-block' }} />}
            Live Mode {liveMode === null ? '' : liveMode ? '— ON' : '— OFF'}
          </div>
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
            When on, videos upload automatically once a day and are scheduled to actually go live at your configured target times below — using YouTube's own scheduling, so the exact upload moment doesn't matter.
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
        <div style={{ fontSize: 12.5, color: c.statusFailed, background: c.statusFailedBg, borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          ⚠ Couldn't check Live Mode status: {liveModeError}. This usually means GITHUB_TOKEN is missing or invalid on this server.
          <button onClick={loadLiveModeStatus} style={{ marginLeft: 10, fontSize: 11.5, textDecoration: 'underline', background: 'none', border: 'none', color: c.statusFailed, cursor: 'pointer', padding: 0 }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setScheduleOpen(!scheduleOpen)}
          style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, cursor: 'pointer' }}
        >
          {scheduleOpen ? '▾' : '▸'} 🌐 Posting country & time
        </button>

        {scheduleOpen && (
          <div style={{ marginTop: 10, border: `1px solid ${c.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: c.textDim, marginBottom: 4 }}>Target country / timezone (where you want videos to go live)</label>
              <select
                value={scheduleTimezone}
                onChange={(e) => setScheduleTimezone(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: c.textDim, marginBottom: 6 }}>
                Target publish times (24-hour, in the timezone above)
              </label>
              {scheduleTimes.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => updateTimeSlot(i, e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 13 }}
                  />
                  {scheduleTimes.length > 1 && (
                    <button onClick={() => removeTimeSlot(i)} style={{ fontSize: 12, color: c.statusFailed, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addTimeSlot} style={{ fontSize: 12, color: c.statusScheduled, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
                + Add another time
              </button>
              <div style={{ fontSize: 11, color: c.textDim, marginTop: 8 }}>
                Each video is uploaded once (whenever this runs) but scheduled to go live at exactly this time in the timezone above — powered by YouTube's own scheduled-publish feature. More times per day means more videos uploaded per run.
              </div>
            </div>

            <button
              onClick={saveSchedule}
              disabled={scheduleSaving}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: c.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: scheduleSaving ? 'default' : 'pointer' }}
            >
              {scheduleSaving ? 'Saving…' : 'Save schedule'}
            </button>

            {scheduleMessage && (
              <div style={{ fontSize: 12.5, marginTop: 10, color: scheduleMessage.startsWith('✓') ? c.statusPublic : c.statusFailed }}>
                {scheduleMessage}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <ActionButton label="Post today's video (private test)" running={running === 'post-private'} c={c} bg={c.statusScheduled}
          onClick={() => runAction('post-private', '/api/admin/daily-post', { privacyStatus: 'private' })} />
        <ActionButton label="Post today's video (PUBLIC)" running={running === 'post-public'} c={c} bg={c.accent}
          onClick={() => runAction('post-public', '/api/admin/daily-post', { privacyStatus: 'public' })} />
        <ActionButton label="Generate SEO (next 10)" running={running === 'seo'} c={c} bg={c.statusScheduled}
          onClick={() => runAction('seo', '/api/admin/generate-seo', { count: 10 })} />
        <ActionButton label="Refresh analytics" running={running === 'analytics'} c={c} bg={c.statusPublic}
          onClick={() => runAction('analytics', '/api/admin/refresh-analytics', {})} />
        <ActionButton label="✉ Test email" running={running === 'test-email'} c={c} bg={c.statusDraft}
          onClick={testEmail} />
      </div>

      <div style={{ background: '#15161B', color: '#4ADE80', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 10, minHeight: 200, whiteSpace: 'pre-wrap' }}>
        {log.length === 0 ? 'No output yet. Click a button above.' : log.join('\n')}
      </div>

      <div style={{ marginTop: 28 }}>
        <button
          onClick={() => { const next = !draftsOpen; setDraftsOpen(next); if (next && drafts.length === 0) loadDrafts(1); }}
          style={{ fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, cursor: 'pointer' }}
        >
          {draftsOpen ? '▾' : '▸'} View Drafts (not-yet-posted videos)
        </button>

        {draftsOpen && (
          <div style={{ marginTop: 12, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: `1px solid ${c.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search by title..."
                value={draftsSearch}
                onChange={(e) => setDraftsSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadDrafts(1)}
                style={{ flex: 1, minWidth: 160, padding: '7px 10px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, fontSize: 12.5 }}
              />
              <select
                value={draftsCategory}
                onChange={(e) => setDraftsCategory(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, fontSize: 12.5 }}
              >
                <option value="">All categories</option>
                {draftsCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <button onClick={() => loadDrafts(1)} style={{ fontSize: 12.5, padding: '7px 14px', borderRadius: 6, border: 'none', background: c.statusScheduled, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                Search
              </button>
              <span style={{ fontSize: 11.5, color: c.textDim, marginLeft: 'auto' }}>
                {draftsTotalCount.toLocaleString()} pending video(s) total
              </span>
            </div>

            {draftsLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: c.textDim, fontSize: 13 }}>Loading…</div>
            ) : drafts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: c.textDim, fontSize: 13 }}>No drafts match this filter.</div>
            ) : (
              <div>
                {drafts.map((d) => (
                  <div key={d.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <button
                      onClick={() => setExpandedDraftId(expandedDraftId === d.id ? null : d.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.title}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.statusScheduledBg, color: c.statusScheduled }}>
                          {d.category}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: d.seoReady ? c.statusPublicBg : c.statusDraftBg, color: d.seoReady ? c.statusPublic : c.statusDraft }}>
                          {d.seoReady ? 'SEO ready' : 'No SEO yet'}
                        </span>
                      </div>
                    </button>
                    {expandedDraftId === d.id && (
                      <div style={{ padding: '0 14px 14px', fontSize: 12.5, color: c.textDim }}>
                        <div style={{ marginBottom: 6 }}><strong style={{ color: c.text }}>Caption:</strong> {d.caption || '—'}</div>
                        <div><strong style={{ color: c.text }}>Tags:</strong> {d.tags.length > 0 ? d.tags.join(', ') : '—'}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
              <button onClick={() => draftsPage > 1 && loadDrafts(draftsPage - 1)} disabled={draftsPage <= 1}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, cursor: draftsPage <= 1 ? 'default' : 'pointer', opacity: draftsPage <= 1 ? 0.5 : 1 }}>
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: c.textDim }}>Page {draftsPage} of {draftsTotalPages}</span>
              <button onClick={() => draftsPage < draftsTotalPages && loadDrafts(draftsPage + 1)} disabled={draftsPage >= draftsTotalPages}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, cursor: draftsPage >= draftsTotalPages ? 'default' : 'pointer', opacity: draftsPage >= draftsTotalPages ? 0.5 : 1 }}>
                Next →
              </button>
            </div>
          </div>
        )}
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
