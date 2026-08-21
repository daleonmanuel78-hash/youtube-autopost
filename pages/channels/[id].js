import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '../../lib/supabase';
import { getChannelsWithCounts } from '../../lib/channelsWithCounts';
import { refreshAccessToken } from '../../lib/youtubeHelpers';
import { getYoutubeCategoryLabel } from '../../lib/youtubeCategoryMap';
import { google } from 'googleapis';
import AppShell from '../../components/AppShell';
import VideoModal from '../../components/VideoModal';
import UploadVideoModal from '../../components/UploadVideoModal';
import { theme } from '../../styles/theme';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

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

const STATUS_META = {
  public: { label: 'Public', color: theme.colors.statusPublic, bg: theme.colors.statusPublicBg },
  private: { label: 'Private', color: theme.colors.statusPrivate, bg: theme.colors.statusPrivateBg },
  scheduled: { label: 'Scheduled', color: theme.colors.statusScheduled, bg: theme.colors.statusScheduledBg },
  draft: { label: 'Draft', color: theme.colors.statusDraft, bg: theme.colors.statusDraftBg },
  failed: { label: 'Failed', color: theme.colors.statusFailed, bg: theme.colors.statusFailedBg },
  uploading: { label: 'Uploading', color: theme.colors.statusScheduled, bg: theme.colors.statusScheduledBg },
};

export default function ChannelDetail({ channel, categories, channels, subscriberCount, subscribersHidden, youtubeCategoryLabel }) {
  const router = useRouter();
  const c = theme.colors;
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('long');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
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

  const shorts = postedVideos.filter((v) => v.is_short === true);
  const longform = postedVideos.filter((v) => v.is_short !== true);
  const activeList = tab === 'short' ? shorts : tab === 'long' ? longform : tab === 'draft' ? draftVideos : failedVideos;

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
    if (!confirm(`Delete ${selectedIds.size} video(s)? This removes them from YouTube and from this dashboard.`)) return;
    setBusy(true);
    await fetch('/api/videos/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: [...selectedIds] }) });
    setBusy(false);
    load();
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
          <StatCard label="Subscribers" value={subscribersHidden ? 'Hidden' : subscriberCount != null ? subscriberCount.toLocaleString() : '—'} c={c} />
          <StatCard label="Uploaded videos" value={postedVideos.length} c={c} />
          <StatCard label="Total views" value={totalViews.toLocaleString()} c={c} />
          <StatCard label="Total likes" value={totalLikes.toLocaleString()} c={c} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: refreshMessage ? 8 : 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {['public', 'private', 'scheduled', 'draft', 'failed'].map((key) => (
            <StatusChip key={key} active={statusFilter === key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)} count={statusCounts[key]} meta={STATUS_META[key]} />
          ))}
          <button onClick={() => setUploadOpen(true)}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 20, border: 'none', background: theme.colors.accent, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            + Upload a Video
          </button>
          <button onClick={handleRefreshAnalytics} disabled={refreshingAnalytics}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20, border: `1px solid ${c.border}`, background: '#fff', color: c.textDim, cursor: refreshingAnalytics ? 'default' : 'pointer' }}>
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
          <TabButton active={tab === 'draft'} onClick={() => setTab('draft')} c={c}>Drafts ({draftVideos.length})</TabButton>
          <TabButton active={tab === 'failed'} onClick={() => setTab('failed')} c={c}>Failed ({failedVideos.length})</TabButton>
        </div>

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.text, color: '#fff', borderRadius: 8, padding: '8px 14px', margin: '12px 0', fontSize: 13 }}>
            <span>{selectedIds.size} selected</span>
            <button disabled={busy} onClick={handleDeleteSelected} style={{ marginLeft: 'auto', background: c.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Delete</button>
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
                    <img
                      src={`https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`}
                      alt=""
                      onError={(e) => {
                        // Thumbnails can take a moment to generate on YouTube's
                        // side, especially right after upload — retry a lower-res
                        // variant once, then fall back to a clean placeholder
                        // instead of the browser's broken-image icon.
                        if (!e.target.dataset.fallback) {
                          e.target.dataset.fallback = '1';
                          e.target.src = `https://i.ytimg.com/vi/${v.youtube_video_id}/mqdefault.jpg`;
                        } else {
                          e.target.onerror = null;
                          e.target.src = TRANSPARENT_PIXEL;
                          e.target.style.background = '#EFEDE7';
                        }
                      }}
                      style={{ width: '100%', borderRadius: 6, marginBottom: 8, aspectRatio: '16/9', objectFit: 'cover', background: '#eee' }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#EFEDE7', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textDim, fontSize: 11 }}>
                      Not uploaded yet
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={v.resolved_status} />
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
          onUploaded={() => load()}
        />
      )}
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
