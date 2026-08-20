import { useState, useEffect } from 'react';

export default function VideoModal({ videoId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${videoId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [videoId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 560,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
            ×
          </button>
        </div>

        {loading && <p>Loading…</p>}

        {!loading && data && (
          <>
            {data.thumbnail_url ? (
              <img src={data.thumbnail_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#f2f2f2', borderRadius: 8, marginBottom: 16 }} />
            )}

            <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{data.display_title}</h2>

            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Status: <strong>{data.queue?.status || 'draft'}</strong>
              {data.queue?.publish_mode ? ` (${data.queue.publish_mode})` : ''}
            </div>

            <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 13 }}>
              <span>👁 {data.latest_stats?.views?.toLocaleString() ?? '—'} views</span>
              <span>👍 {data.latest_stats?.likes?.toLocaleString() ?? '—'} likes</span>
              <span>💬 {data.latest_stats?.comments?.toLocaleString() ?? '—'} comments</span>
            </div>

            <div style={{ fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', marginBottom: 20, maxHeight: 150, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
              {data.display_description || <span style={{ color: '#999' }}>No description yet.</span>}
            </div>

            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Analytics</h3>
            {data.snapshot_history && data.snapshot_history.length > 0 ? (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666' }}>
                    <th style={{ padding: '4px 0' }}>Date</th>
                    <th>Views</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Watch time (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.snapshot_history.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 0' }}>{s.snapshot_date}</td>
                      <td>{s.views ?? '—'}</td>
                      <td>{s.likes ?? '—'}</td>
                      <td>{s.comments ?? '—'}</td>
                      <td>{s.watch_time_minutes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#999', fontSize: 12 }}>
                No analytics snapshots yet — run the analytics refresh script to populate this.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
