import { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

export default function VideoModal({ videoId, onClose }) {
  const c = theme.colors;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null); // commentId being replied to
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${videoId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });

    setCommentsLoading(true);
    fetch(`/api/videos/${videoId}/comments`)
      .then((r) => r.json())
      .then((d) => {
        setComments(d.comments || []);
        setCommentsLoading(false);
      });
  }, [videoId]);

  async function sendReply(parentId) {
    if (!replyText.trim()) return;
    setSending(true);
    setReplyError(null);
    try {
      const resp = await fetch(`/api/videos/${videoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, text: replyText }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setReplyError(result.error || 'Failed to send reply.');
      } else {
        setReplyText('');
        setReplyTo(null);
        // refresh comments to show the new reply
        const refreshed = await fetch(`/api/videos/${videoId}/comments`).then((r) => r.json());
        setComments(refreshed.comments || []);
      }
    } catch (err) {
      setReplyError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.cardBg,
          borderRadius: 14,
          width: 720,
          height: 680,
          minWidth: 420,
          minHeight: 400,
          maxWidth: '95vw',
          maxHeight: '92vh',
          resize: 'both',
          overflow: 'auto',
          padding: 24,
          fontFamily: theme.font.body,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: c.textDim }}>×</button>
        </div>

        {loading && <p>Loading…</p>}

        {!loading && data && (
          <>
            {data.youtube_video_id ? (
              <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', marginBottom: 16, background: '#000' }}>
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${data.youtube_video_id}`}
                  title={data.display_title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#EFEDE7', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textDim, fontSize: 13 }}>
                Not uploaded to YouTube yet
              </div>
            )}

            {data.queue?.publish_mode === 'private' && data.youtube_video_id && (
              <div style={{ fontSize: 11.5, color: c.statusDraft, background: c.statusDraftBg, borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
                This video is Private — playback here may not work unless you're signed into YouTube as the channel owner in this browser, since private videos generally can't be embedded elsewhere.
              </div>
            )}

            <h2 style={{ margin: '0 0 8px 0', fontFamily: theme.font.display, fontSize: 17 }}>{data.display_title}</h2>

            <div style={{ fontSize: 12, color: c.textDim, marginBottom: 14 }}>
              Status: <strong style={{ color: c.text }}>{data.queue?.status || 'draft'}</strong>
              {data.queue?.publish_mode ? ` (${data.queue.publish_mode})` : ''}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              <MiniStat label="Views" value={data.totals.views} c={c} />
              <MiniStat label="Likes" value={data.totals.likes} c={c} />
              <MiniStat label="Comments" value={data.totals.comments} c={c} />
              <MiniStat label="Watch time (min)" value={data.totals.watch_time_minutes} c={c} />
            </div>

            <div style={{ fontSize: 13, color: c.text, whiteSpace: 'pre-wrap', marginBottom: 20, maxHeight: 120, overflowY: 'auto', border: `1px solid ${c.border}`, borderRadius: 6, padding: 10 }}>
              {data.display_description || <span style={{ color: c.textDim }}>No description yet.</span>}
            </div>

            <h3 style={{ fontSize: 14, marginBottom: 10, fontFamily: theme.font.display }}>Comments</h3>

            {commentsLoading ? (
              <p style={{ fontSize: 12, color: c.textDim }}>Loading comments…</p>
            ) : comments.length === 0 ? (
              <p style={{ fontSize: 12, color: c.textDim }}>No comments yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {comments.map((cm) => (
                  <div key={cm.id}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {cm.authorImage && <img src={cm.authorImage} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5 }}>
                          <strong>{cm.author}</strong> <span style={{ color: c.textDim, fontWeight: 400 }}>· {cm.likeCount || 0} likes</span>
                        </div>
                        <div style={{ fontSize: 13, color: c.text }} dangerouslySetInnerHTML={{ __html: cm.text }} />
                        <button
                          onClick={() => { setReplyTo(replyTo === cm.id ? null : cm.id); setReplyError(null); }}
                          style={{ fontSize: 11, color: c.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
                        >
                          Reply
                        </button>

                        {cm.replies.map((r) => (
                          <div key={r.id} style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 16 }}>
                            {r.authorImage && <img src={r.authorImage} alt="" width={20} height={20} style={{ borderRadius: '50%' }} />}
                            <div>
                              <div style={{ fontSize: 11.5 }}><strong>{r.author}</strong></div>
                              <div style={{ fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: r.text }} />
                            </div>
                          </div>
                        ))}

                        {replyTo === cm.id && (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Write a reply…"
                              style={{ width: '100%', minHeight: 50, padding: 8, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12.5, fontFamily: theme.font.body }}
                            />
                            {replyError && <div style={{ fontSize: 11.5, color: c.accent, marginTop: 4 }}>{replyError}</div>}
                            <button
                              onClick={() => sendReply(cm.id)}
                              disabled={sending}
                              style={{ marginTop: 6, fontSize: 12, padding: '5px 14px', borderRadius: 6, border: 'none', background: c.text, color: '#fff', cursor: 'pointer' }}
                            >
                              {sending ? 'Sending…' : 'Send reply'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, c }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: theme.font.display }}>{value != null ? value.toLocaleString() : '—'}</div>
      <div style={{ fontSize: 10, color: c.textDim, marginTop: 2 }}>{label}</div>
    </div>
  );
}
