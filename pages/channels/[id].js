import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '../../lib/supabase';
import VideoModal from '../../components/VideoModal';

export async function getServerSideProps({ params }) {
  const { data: channel, error } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !channel) {
    return { notFound: true };
  }

  return { props: { channel } };
}

const STATUS_LABELS = {
  posted: 'Public', // simplification: assumes publish_mode public by default; refined below
  uploading: 'Uploading',
  failed: 'Failed',
  draft: 'Draft',
};

function resolveStatusLabel(v) {
  if (v.post_status === 'draft') return 'Draft';
  if (v.post_status === 'failed') return 'Failed';
  if (v.post_status === 'uploading') return 'Uploading';
  if (v.post_status === 'posted') {
    if (v.publish_mode === 'private') return 'Private';
    if (v.publish_mode === 'scheduled') return 'Scheduled';
    return 'Public';
  }
  return 'Draft';
}

export default function ChannelDetail({ channel }) {
  const router = useRouter();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('long'); // 'long' | 'short'
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  useEffect(() => {
    fetch(`/api/channels/${channel.id}/videos`)
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setLoading(false);
      });
  }, [channel.id]);

  const shorts = videos.filter((v) => v.is_short === true);
  const longform = videos.filter((v) => v.is_short !== true); // includes null/unknown for now
  const activeList = tab === 'short' ? shorts : longform;

  const statusCounts = { Public: 0, Private: 0, Scheduled: 0, Draft: 0, Failed: 0, Uploading: 0 };
  for (const v of videos) {
    const label = resolveStatusLabel(v);
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  }

  const filtered = statusFilter === 'all' ? activeList : activeList.filter((v) => resolveStatusLabel(v) === statusFilter);

  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes || 0), 0);

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 1000, margin: '0 auto', padding: 32 }}>
      <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← All channels
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {channel.thumbnail_url && (
          <img src={channel.thumbnail_url} alt="" width={56} height={56} style={{ borderRadius: '50%' }} />
        )}
        <div>
          <h1 style={{ margin: 0 }}>{channel.name}</h1>
          <div style={{ color: '#666', fontSize: 13 }}>{channel.youtube_channel_id}</div>
        </div>
      </div>

      {/* Overview */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total videos tracked" value={videos.length} />
        <StatCard label="Total views" value={totalViews.toLocaleString()} />
        <StatCard label="Total likes" value={totalLikes.toLocaleString()} />
      </div>

      {/* Status counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {Object.entries(statusCounts).map(([label, count]) => (
          <button
            key={label}
            onClick={() => setStatusFilter(statusFilter === label ? 'all' : label)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: statusFilter === label ? '2px solid #111' : '1px solid #ddd',
              background: statusFilter === label ? '#111' : '#fff',
              color: statusFilter === label ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {label}: {count}
          </button>
        ))}
      </div>

      {/* Shorts / Long-form tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, borderBottom: '1px solid #eee' }}>
        <TabButton active={tab === 'long'} onClick={() => setTab('long')}>
          Long-form ({longform.length})
        </TabButton>
        <TabButton active={tab === 'short'} onClick={() => setTab('short')}>
          Shorts ({shorts.length})
        </TabButton>
      </div>
      {tab === 'long' && shorts.length === 0 && (
        <p style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
          Note: Shorts detection isn't wired up yet, so everything currently shows here until that's built.
        </p>
      )}

      {/* Video grid */}
      {loading ? (
        <p>Loading videos…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#999' }}>No videos match this filter.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
          {filtered.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelectedVideoId(v.id)}
              style={{
                border: '1px solid #eee',
                borderRadius: 8,
                padding: 12,
                cursor: 'pointer',
              }}
            >
              {v.youtube_video_id ? (
                <img
                  src={`https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`}
                  alt=""
                  style={{ width: '100%', borderRadius: 4, marginBottom: 8, aspectRatio: '16/9', objectFit: 'cover', background: '#eee' }}
                />
              ) : (
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#f2f2f2', borderRadius: 4, marginBottom: 8 }} />
              )}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.title}
              </div>
              <div style={{ fontSize: 11, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                <span>{resolveStatusLabel(v)}</span>
                <span>{v.views != null ? `${v.views.toLocaleString()} views` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedVideoId && <VideoModal videoId={selectedVideoId} onClose={() => setSelectedVideoId(null)} />}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 4px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #111' : '2px solid transparent',
        fontWeight: active ? 600 : 400,
        color: active ? '#111' : '#666',
        cursor: 'pointer',
        marginRight: 16,
      }}
    >
      {children}
    </button>
  );
}
