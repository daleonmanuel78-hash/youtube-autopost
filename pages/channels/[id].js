import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '../../lib/supabase';
import { getChannelsWithCounts } from '../../lib/channelsWithCounts';
import AppShell from '../../components/AppShell';
import VideoModal from '../../components/VideoModal';
import { theme } from '../../styles/theme';

export async function getServerSideProps({ params }) {
  const { data: channel, error } = await supabaseAdmin.from('channels').select('*').eq('id', params.id).single();
  if (error || !channel) return { notFound: true };

  const { data: categories } = await supabaseAdmin.from('categories').select('id, name');
  const channels = await getChannelsWithCounts();

  return { props: { channel, categories: categories || [], channels } };
}

const STATUS_META = {
  public: { label: 'Public', color: theme.colors.statusPublic, bg: theme.colors.statusPublicBg },
  private: { label: 'Private', color: theme.colors.statusPrivate, bg: theme.colors.statusPrivateBg },
  scheduled: { label: 'Scheduled', color: theme.colors.statusScheduled, bg: theme.colors.statusScheduledBg },
  draft: { label: 'Draft', color: theme.colors.statusDraft, bg: theme.colors.statusDraftBg },
  failed: { label: 'Failed', color: theme.colors.statusFailed, bg: theme.colors.statusFailedBg },
  uploading: { label: 'Uploading', color: theme.colors.statusScheduled, bg: theme.colors.statusScheduledBg },
};

export default function ChannelDetail({ channel, categories, channels }) {
  const router = useRouter();
  const c = theme.colors;
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('long');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTrash, setShowTrash] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [needsCategory, setNeedsCategory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(channel.name);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/channels/${channel.id}/videos${showTrash ? '?includeTrashed=true' : ''}`)
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setNeedsCategory(!!data.needsCategory);
        setLoading(false);
        setSelectedIds(new Set());
      });
  }

  useEffect(() => { load(); }, [channel.id, showTrash]);

  const postedVideos = videos.filter((v) => v.is_posted);
  const draftVideos = videos.filter((v) => v.resolved_status === 'draft');
  const failedVideos = videos.filter((v) => v.resolved_status === 'failed');

  const shorts = postedVideos.filter((v) => v.is_short === true);
  const longform = postedVideos.filter((v) => v.is_short !== true);
  const activeList = showTrash ? videos : tab === 'short' ? shorts : tab === 'long' ? longform : tab === 'draft' ? draftVideos : failedVideos;

  const statusCounts = {
    public: postedVideos.filter((v) => v.resolved_status === 'public').length,
    private: postedVideos.filter((v) => v.resolved_status === 'private').length,
    scheduled: postedVideos.filter((v) => v.resolved_status === 'scheduled').length,
    draft: draftVideos.length,
    failed: failedVideos.length,
  };

  const filtered = statusFilter === 'all' ? activeList : activeList.filter((v) => v.resolved_status === statusFilter);
  const totalViews = postedVideos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalLikes = postedVideos.reduce((sum, v) => sum + (v.likes || 0), 0);

  function toggleSelect(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} video(s)? Posted videos will also be removed from YouTube. This moves them to Trash — they can be restored later, but as brand-new uploads.`)) return;
    setBusy(true);
    await fetch('/api/videos/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: [...selectedIds] }) });
    setBusy(false);
    load();
  }

  async function handleRestoreSelected() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    await fetch('/api/videos/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: [...selectedIds] }) });
    setBusy(false);
    load();
  }

  async function handleSetCategory(categoryId) {
    setBusy(true);
    await fetch(`/api/channels/${channel.id}/set-category`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId }) });
    setBusy(false);
    load();
  }

  async function handleRename() {
    if (!nameInput.trim()) return;
    await fetch(`/api/channels/${channel.id}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameInput }) });
    setRenaming(false);
    router.replace(router.asPath);
  }

  async function handleArchive() {
    if (!confirm(`Remove "${channel.name}" from the roster? Its post history stays intact — this just hides it going forward.`)) return;
    await fetch(`/api/channels/${channel.id}/archive`, { method: 'POST' });
    router.push('/');
  }

  return (
    <AppShell channels={channels} activeChannelId={channel.id}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {channel.thumbnail_url && <img src={channel.thumbnail_url} alt="" width={48} height={48} style={{ borderRadius: '50%' }} />}
            <div>
              {renaming ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    style={{ fontFamily: theme.font.display, fontSize: 20, fontWeight: 700, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 8px' }} autoFocus />
                  <button onClick={handleRename} style={{ fontSize: 12, padding: '0 10px', borderRadius: 6, border: 'none', background: c.text, color: '#fff', cursor: 'pointer' }}>Save</button>
                </div>
              ) : (
                <h1 style={{ fontFamily: theme.font.display, fontSize: 22, margin: 0, cursor: 'pointer' }} onClick={() => setRenaming(true)} title="Click to rename">
                  {channel.name}
                </h1>
              )}
              <div style={{ color: c.textDim, fontSize: 12 }}>{channel.youtube_channel_id}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleArchive} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: '#fff', color: c.textDim, cursor: 'pointer' }}>
              Remove channel
            </button>
            <button onClick={() => router.push(`/admin?from=${channel.id}`)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: c.text, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Go to Admin Panel
            </button>
          </div>
        </div>

        {needsCategory && (
          <div style={{ background: c.accentDim, border: `1px solid ${c.accent}33`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>This channel isn't connected to a category yet</div>
            <div style={{ fontSize: 13, color: c.textDim, marginBottom: 10 }}>Pick which video category feeds this channel:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.map((cat) => (
                <button key={cat.id} disabled={busy} onClick={() => handleSetCategory(cat.id)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: c.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <StatCard label="Uploaded videos" value={postedVideos.length} c={c} />
          <StatCard label="Total views" value={totalViews.toLocaleString()} c={c} />
          <StatCard label="Total likes" value={totalLikes.toLocaleString()} c={c} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {['public', 'private', 'scheduled', 'draft', 'failed'].map((key) => (
            <StatusChip key={key} active={statusFilter === key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} count={statusCounts[key]} meta={STATUS_META[key]} />
          ))}
          <button onClick={() => { setShowTrash(!showTrash); setStatusFilter('all'); }}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 20, border: `1px solid ${c.border}`, background: showTrash ? c.text : '#fff', color: showTrash ? '#fff' : c.textDim, cursor: 'pointer' }}>
            {showTrash ? '← Back to library' : '🗑 Trash'}
          </button>
        </div>

        {!showTrash && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, borderBottom: `1px solid ${c.border}` }}>
            <TabButton active={tab === 'long'} onClick={() => setTab('long')} c={c}>Long-form ({longform.length})</TabButton>
            <TabButton active={tab === 'short'} onClick={() => setTab('short')} c={c}>Shorts ({shorts.length})</TabButton>
            <TabButton active={tab === 'draft'} onClick={() => setTab('draft')} c={c}>Drafts ({draftVideos.length})</TabButton>
            <TabButton active={tab === 'failed'} onClick={() => setTab('failed')} c={c}>Failed ({failedVideos.length})</TabButton>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.text, color: '#fff', borderRadius: 8, padding: '8px 14px', margin: '12px 0', fontSize: 13 }}>
            <span>{selectedIds.size} selected</span>
            {showTrash ? (
              <button disabled={busy} onClick={handleRestoreSelected} style={{ marginLeft: 'auto', background: '#fff', color: c.text, border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Restore</button>
            ) : (
              <button disabled={busy} onClick={handleDeleteSelected} style={{ marginLeft: 'auto', background: c.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Delete</button>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ color: c.textDim, marginTop: 20 }}>Loading videos…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: c.textDim, marginTop: 20 }}>Nothing here.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginTop: 16 }}>
            {filtered.map((v) => (
              <div key={v.id} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 10, background: c.cardBg, position: 'relative' }}>
                <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)}
                  style={{ position: 'absolute', top: 14, left: 14, width: 16, height: 16, zIndex: 2 }} />
                <div onClick={() => setSelectedVideoId(v.id)} style={{ cursor: 'pointer' }}>
                  {v.youtube_video_id ? (
                    <img src={`https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 8, aspectRatio: '16/9', objectFit: 'cover', background: '#eee' }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#EFEDE7', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textDim, fontSize: 11 }}>
                      Not uploaded yet
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={v.resolved_status} />
                    {v.views != null && <span style={{ fontSize: 11, color: c.textDim }}>{v.views.toLocaleString()} views</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedVideoId && <VideoModal videoId={selectedVideoId} onClose={() => setSelectedVideoId(null)} />}
    </AppShell>
  );
}

function StatCard({ label, value, c }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', flex: 1, background: c.cardBg }}>
      <div style={{ fontSize: 11.5, color: c.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: theme.font.display, fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children, c }) {
  return (
    <button onClick={onClick} style={{ padding: '9px 4px', marginRight: 18, background: 'none', border: 'none', borderBottom: active ? `2px solid ${c.text}` : '2px solid transparent', fontWeight: active ? 700 : 500, color: active ? c.text : c.textDim, cursor: 'pointer', fontSize: 13 }}>
      {children}
    </button>
  );
}

function StatusChip({ active, onClick, count, meta }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 20, border: active ? `1.5px solid ${meta.color}` : '1px solid transparent', background: meta.bg, color: meta.color, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
      {meta.label}: {count}
    </button>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 4, padding: '2px 7px' }}>{meta.label}</span>;
}
