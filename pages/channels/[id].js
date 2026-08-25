import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '../../lib/supabase';
import { getChannelsWithCounts } from '../../lib/channelsWithCounts';
import { refreshAccessToken } from '../../lib/youtubeHelpers';
import { getYoutubeCategoryLabel } from '../../lib/youtubeCategoryMap';
import { google } from 'googleapis';
import AppShell from '../../components/AppShell';
import VideoModal from '../../components/VideoModal';
import UploadVideoModal from '../../components/UploadVideoModal';
import SafeThumbnail from '../../components/SafeThumbnail';
import { useTheme } from '../../lib/ThemeContext';

export async function getServerSideProps({ params }) {
  const { data: channel, error } = await supabaseAdmin.from('channels').select('*').eq('id', params.id).single();
  if (error || !channel) return { notFound: true };

  const { data: categories } = await supabaseAdmin.from('categories').select('id, name');
  const channels = await getChannelsWithCounts();

  // Which category (if any) is this channel linked to, and what YouTube
  // category does that map to — shown read-only in the upload popup.
  const { data: link } = await supabaseAdmin
    .from('channel_categories')
    .select('category_id, categories(name)')
    .eq('channel_id', channel.id)
    .limit(1)
    .maybeSingle();
  const linkedCategoryName = link?.categories?.name || null;
  const youtubeCategoryLabel = linkedCategoryName
    ? `${getYoutubeCategoryLabel(linkedCategoryName)} (from ${linkedCategoryName})`
    : 'Not set — link a category first';

  // Pull subscriber count live from YouTube — not something we store ourselves,
  // it changes constantly and isn't worth persisting/going stale.
  let subscriberCount = null;
  let subscribersHidden = false;
  try {
    const oauth2Client = await refreshAccessToken(channel);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const resp = await youtube.channels.list({ part: ['statistics'], id: [channel.youtube_channel_id] });
    const stats = resp.data.items?.[0]?.statistics;
    if (stats?.hiddenSubscriberCount) {
      subscribersHidden = true;
    } else if (stats?.subscriberCount != null) {
      subscriberCount = Number(stats.subscriberCount);
    }
  } catch (e) {
    // non-fatal — page still works without this, just shows a dash
  }

  return { props: { channel, categories: categories || [], channels, subscriberCount, subscribersHidden, youtubeCategoryLabel } };
}

function getStatusMeta(c) {
  return {
    public: { label: 'Public', color: c.statusPublic, bg: c.statusPublicBg },
    private: { label: 'Private', color: c.statusPrivate, bg: c.statusPrivateBg },
    scheduled: { label: 'Scheduled', color: c.statusScheduled, bg: c.statusScheduledBg },
    draft: { label: 'Draft', color: c.statusDraft, bg: c.statusDraftBg },
    failed: { label: 'Failed', color: c.statusFailed, bg: c.statusFailedBg },
    uploading: { label: 'Uploading', color: c.statusScheduled, bg: c.statusScheduledBg },
  };
}

export default function ChannelDetail({ channel, categories, channels, subscriberCount, subscribersHidden, youtubeCategoryLabel }) {
  const router = useRouter();
  const { colors: c, font } = useTheme();
  const STATUS_META = getStatusMeta(c);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('long');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'az' | 'za' | 'views'
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [needsCategory, setNeedsCategory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(channel.name);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/channels/${channel.id}/videos`)
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setNeedsCategory(!!data.needsCategory);
        setLoading(false);
        setSelectedIds(new Set());
      });
  }

  useEffect(() => { load(); }, [channel.id]);

  const postedVideos = videos.filter((v) => v.is_posted);
  const draftVideos = videos.filter((v) => v.resolved_status === 'draft');
  const failedVideos = videos.filter((v) => v.resolved_status === 'failed');

  const statusCounts = {
    public: postedVideos.filter((v) => v.resolved_status === 'public').length,
    private: postedVideos.filter((v) => v.resolved_status === 'private').length,
    scheduled: postedVideos.filter((v) => v.resolved_status === 'scheduled').length,
    draft: draftVideos.length,
    failed: failedVideos.length,
  };

  // Status chip narrows the list first; Long-form/Shorts tabs then split
  // whatever that narrowed set is — e.g. clicking "Draft" then "Shorts"
  // shows only draft videos that are Shorts, nothing redundant like a
  // separate "Drafts" tab inside an already-Draft-filtered view.
  // Default view (no chip selected) shows only Public/Private/Scheduled —
  // Draft and Failed each have their own dedicated chip to view them
  // explicitly, so they don't clutter the main list by default.
  const statusFilteredVideos =
    statusFilter === 'all'
      ? postedVideos
      : videos.filter((v) => v.resolved_status === statusFilter);
  const shorts = statusFilteredVideos.filter((v) => v.is_short === true);
  const longform = statusFilteredVideos.filter((v) => v.is_short !== true);
  const activeList = tab === 'short' ? shorts : longform;

  const sorted = [...activeList].sort((a, b) => {
    if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'za') return (b.title || '').localeCompare(a.title || '');
    if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (sortBy === 'views') return (b.views || 0) - (a.views || 0);
    return new Date(b.created_at) - new Date(a.created_at); // 'newest' default
  });
  const totalViews = postedVideos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalLikes = postedVideos.reduce((sum, v) => sum + (v.likes || 0), 0);

  function toggleSelect(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} video(s)? This removes them from YouTube and from this dashboard.`)) return;
    setBusy(true);
    await fetch('/api/videos/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: [...selectedIds] }) });
    setBusy(false);
    load();
    router.replace(router.asPath); // belt-and-suspenders refresh, same fix as manual upload
  }

  async function handleRefreshAnalytics() {
    setRefreshingAnalytics(true);
    setRefreshMessage(null);
    try {
      const resp = await fetch(`/api/channels/${channel.id}/refresh-analytics`, { method: 'POST' });
      const result = await resp.json();
      if (resp.ok) {
        setRefreshMessage(
          result.autoTrashed > 0
            ? `Updated ${result.updated} video(s). ${result.autoTrashed} were no longer on YouTube and were removed here too.`
            : `Updated ${result.updated} video(s).`
        );
      } else {
        setRefreshMessage(result.error || 'Refresh failed.');
      }
      load();
    } catch (err) {
      setRefreshMessage(err.message);
    } finally {
      setRefreshingAnalytics(false);
    }
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

  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      await fetch(`/api/channels/${channel.id}/upload-logo`, { method: 'POST', body: formData });
      router.replace(router.asPath); // reload to pick up the new logo everywhere (header + sidebar)
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <AppShell channels={channels} activeChannelId={channel.id}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {(channel.custom_logo_url || channel.thumbnail_url) && (
                <img src={channel.custom_logo_url || channel.thumbnail_url} alt="" width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover' }} />
              )}
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                title="Upload a custom photo (dashboard display only — doesn't change your real YouTube avatar)"
                style={{
                  position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%',
                  background: c.accent, border: `2px solid ${c.bg}`, color: '#fff', fontSize: 10, cursor: logoUploading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                {logoUploading ? '…' : '📷'}
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            </div>
            <div>
              {renaming ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    style={{ fontFamily: font.display, fontSize: 20, fontWeight: 700, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 8px' }} autoFocus />
                  <button onClick={handleRename} style={{ fontSize: 12, padding: '0 10px', borderRadius: 6, border: 'none', background: c.statusScheduled, color: '#fff', cursor: 'pointer' }}>Save</button>
                </div>
              ) : (
                <h1 style={{ fontFamily: font.display, fontSize: 22, margin: 0, cursor: 'pointer' }} onClick={() => setRenaming(true)} title="Click to rename">
                  {channel.name}
                </h1>
              )}
              <div style={{ color: c.textDim, fontSize: 12 }}>{channel.youtube_channel_id}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleArchive} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: c.statusFailed, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Remove channel
            </button>
            <button onClick={() => router.push(`/admin?from=${channel.id}`)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: c.statusScheduled, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
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
          <StatCard label="Subscribers" value={subscribersHidden ? 'Hidden' : subscriberCount != null ? subscriberCount.toLocaleString() : '—'} c={c} font={font} />
          <StatCard label="Uploaded videos" value={postedVideos.length} c={c} font={font} />
          <StatCard label="Total views" value={totalViews.toLocaleString()} c={c} font={font} />
          <StatCard label="Total likes" value={totalLikes.toLocaleString()} c={c} font={font} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: refreshMessage ? 8 : 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {['public', 'private', 'scheduled', 'draft', 'failed'].map((key) => (
            <StatusChip key={key} active={statusFilter === key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} count={statusCounts[key]} meta={STATUS_META[key]} />
          ))}
          <button onClick={() => setUploadOpen(true)}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 20, border: 'none', background: c.accent, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            + Upload a Video
          </button>
          <button onClick={handleRefreshAnalytics} disabled={refreshingAnalytics}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20, border: 'none', background: c.statusPublic, color: '#fff', cursor: refreshingAnalytics ? 'default' : 'pointer', fontWeight: 600 }}>
            {refreshingAnalytics ? 'Refreshing…' : '↻ Refresh Analytics'}
          </button>
        </div>

        {refreshMessage && (
          <div style={{ fontSize: 12, color: c.textDim, background: c.accentDim, borderRadius: 8, padding: '6px 12px', marginBottom: 20 }}>
            {refreshMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 4, borderBottom: `1px solid ${c.border}` }}>
          <TabButton active={tab === 'long'} onClick={() => setTab('long')} c={c}>Long-form ({longform.length})</TabButton>
          <TabButton active={tab === 'short'} onClick={() => setTab('short')} c={c}>Shorts ({shorts.length})</TabButton>
        </div>

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#15161B', color: '#fff', borderRadius: 8, padding: '8px 14px', margin: '12px 0', fontSize: 13 }}>
            <span>{selectedIds.size} selected</span>
            <button disabled={busy} onClick={handleDeleteSelected} style={{ marginLeft: 'auto', background: c.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Delete</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', border: `1px solid ${c.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('grid')}
              style={{ padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? c.text : c.cardBg, color: viewMode === 'grid' ? c.bg : c.textDim, fontWeight: 600 }}>
              ▦ Grid
            </button>
            <button onClick={() => setViewMode('list')}
              style={{ padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? c.text : c.cardBg, color: viewMode === 'list' ? c.bg : c.textDim, fontWeight: 600 }}>
              ☰ List
            </button>
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">Title A–Z</option>
            <option value="za">Title Z–A</option>
            <option value="views">Most viewed</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: c.textDim, marginTop: 20 }}>Loading videos…</p>
        ) : sorted.length === 0 ? (
          <p style={{ color: c.textDim, marginTop: 20 }}>Nothing here.</p>
        ) : viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {sorted.map((v) => (
              <div key={v.id} onClick={() => setSelectedVideoId(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 12px', background: c.cardBg, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedIds.has(v.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(v.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ width: 72, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <SafeThumbnail youtubeVideoId={v.youtube_video_id} customThumbnailUrl={v.custom_thumbnail_url} />
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                <StatusBadge status={v.resolved_status} statusMeta={STATUS_META} />
                <div style={{ fontSize: 11.5, color: c.textDim, display: 'flex', gap: 10, width: 130, flexShrink: 0, justifyContent: 'flex-end' }}>
                  {v.views != null && <span>👁 {v.views.toLocaleString()}</span>}
                  {v.comments != null && <span>💬 {v.comments.toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginTop: 16 }}>
            {sorted.map((v) => (
              <div key={v.id} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 10, background: c.cardBg, position: 'relative' }}>
                <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)}
                  style={{ position: 'absolute', top: 14, left: 14, width: 16, height: 16, zIndex: 2 }} />
                <div onClick={() => setSelectedVideoId(v.id)} style={{ cursor: 'pointer' }}>
                  {v.youtube_video_id ? (
                    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
                      <SafeThumbnail youtubeVideoId={v.youtube_video_id} customThumbnailUrl={v.custom_thumbnail_url} style={{ borderRadius: 0 }} />
                    </div>
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: c.border, borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textDim, fontSize: 11 }}>
                      Not uploaded yet
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={v.resolved_status} statusMeta={STATUS_META} />
                    <span style={{ fontSize: 11, color: c.textDim, display: 'flex', gap: 8 }}>
                      {v.views != null && <span>👁 {v.views.toLocaleString()}</span>}
                      {v.comments != null && <span>💬 {v.comments.toLocaleString()}</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedVideoId && (
        <VideoModal
          videoId={selectedVideoId}
          onClose={() => setSelectedVideoId(null)}
          onVideoTrashed={() => load()}
        />
      )}

      {uploadOpen && (
        <UploadVideoModal
          channelId={channel.id}
          categoryLabel={youtubeCategoryLabel}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { load(); router.replace(router.asPath); }}
        />
      )}
    </AppShell>
  );
}

function StatCard({ label, value, c, font }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', flex: 1, background: c.cardBg }}>
      <div style={{ fontSize: 11.5, color: c.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: font.display, fontSize: 24, fontWeight: 700 }}>{value}</div>
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

function StatusBadge({ status, statusMeta }) {
  const meta = statusMeta[status] || statusMeta.draft;
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 4, padding: '2px 7px' }}>{meta.label}</span>;
}
