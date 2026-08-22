import { useState, useRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTheme } from '../lib/ThemeContext';

export default function UploadVideoModal({ channelId, categoryLabel, onClose, onUploaded }) {
  const { colors: c, font } = useTheme();
  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isShort, setIsShort] = useState(false);
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [madeForKids, setMadeForKids] = useState(false);
  const [visibility, setVisibility] = useState('private');
  const [scheduledAt, setScheduledAt] = useState(null); // Date object or null
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState(null);
  const [thumbnailSource, setThumbnailSource] = useState(null); // 'ai' | 'manual' | null
  const [thumbnailError, setThumbnailError] = useState(null);
  const [error, setError] = useState(null);
  const [progressNote, setProgressNote] = useState(null);

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setIsShort(false); // reset until real metadata comes in below
  }

  // Reads the actual video's duration and orientation directly from the file
  // in the browser — more reliable than waiting on YouTube's own processing,
  // which can lag right after upload. Same rule used elsewhere in the app:
  // a real Short is both short (<=180s) AND vertical (taller than wide).
  function handlePreviewMetadata(e) {
    const video = e.target;
    const duration = video.duration || 0;
    const vertical = video.videoHeight > video.videoWidth;
    setIsShort(duration > 0 && duration <= 180 && vertical);
  }

  async function handleGenerateSeo() {
    setError(null);
    if (!topic.trim()) {
      setError('Topic is required before generating SEO.');
      return;
    }
    setGenerating(true);
    try {
      const resp = await fetch(`/api/channels/${channelId}/generate-seo-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title, description, tags }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setError(result.error || 'SEO generation failed.');
        return;
      }
      setTitle(result.title);
      setDescription(result.description);
      setTags(result.tags.join(', '));
      setAiGenerated(true);

      // Also generate a matching AI thumbnail — non-blocking relative to the
      // SEO fields above; if it fails, you still have your title/description/tags.
      setThumbnailError(null);
      try {
        const thumbResp = await fetch(`/api/channels/${channelId}/generate-thumbnail-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, title: result.title }),
        });
        const thumbResult = await thumbResp.json();
        if (thumbResp.ok) {
          setThumbnailDataUrl(thumbResult.thumbnailDataUrl);
          setThumbnailSource('ai');
        } else {
          setThumbnailError(thumbResult.error || 'Thumbnail generation failed.');
        }
      } catch (err) {
        setThumbnailError(err.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleManualThumbnail(e) {
    const f = e.target.files[0];
    if (!f) return;
    setThumbnailError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setThumbnailDataUrl(reader.result);
      setThumbnailSource('manual');
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    setError(null);
    if (!topic.trim()) {
      setError('Topic is required.');
      return;
    }
    if (!file) {
      setError('Please select a video file.');
      return;
    }

    setSubmitting(true);
    setProgressNote('Uploading to YouTube…');

    const formData = new FormData();
    formData.append('video', file);
    formData.append('topic', topic);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('tags', tags);
    formData.append('madeForKids', String(madeForKids));
    formData.append('visibility', visibility);
    formData.append('scheduledAt', scheduledAt ? scheduledAt.toISOString() : '');
    formData.append('aiGenerated', String(aiGenerated));
    formData.append('isShort', String(isShort));
    if (thumbnailDataUrl) formData.append('thumbnailDataUrl', thumbnailDataUrl);

    try {
      const resp = await fetch(`/api/channels/${channelId}/upload-video`, { method: 'POST', body: formData });
      const result = await resp.json();
      if (!resp.ok) {
        setError(result.error || 'Upload failed.');
        setSubmitting(false);
        return;
      }
      onUploaded?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const busy = submitting || generating;

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cardBg, borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 26, fontFamily: font.body }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 19 }}>Upload a video</h2>
          <button onClick={() => !busy && onClose()} style={{ border: 'none', background: 'none', fontSize: 20, cursor: busy ? 'default' : 'pointer', color: c.textDim }}>×</button>
        </div>

        {!previewUrl ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${c.border}`, borderRadius: 10, padding: 40, textAlign: 'center', cursor: 'pointer', marginBottom: 10, color: c.textDim }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>⬆</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Click to select a video file</div>
            <div style={{ fontSize: 11.5 }}>MP4, MOV, or similar</div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <video src={previewUrl} controls onLoadedMetadata={handlePreviewMetadata} style={{ width: '100%', maxHeight: 260, borderRadius: 10, background: '#000' }} />
            <div style={{ fontSize: 11, color: c.textDim, marginTop: 6 }}>
              Detected as: <strong style={{ color: c.text }}>{isShort ? 'Short' : 'Long-form'}</strong>
            </div>

            {thumbnailDataUrl && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: c.textDim, marginBottom: 4, fontWeight: 600 }}>
                  {thumbnailSource === 'ai' ? 'AI-generated thumbnail' : 'Custom thumbnail'} (will be set on YouTube)
                </div>
                <img src={thumbnailDataUrl} alt="Thumbnail preview" style={{ width: '100%', maxWidth: 280, borderRadius: 8, border: `1px solid ${c.border}` }} />
              </div>
            )}
            {thumbnailError && (
              <div style={{ fontSize: 11, color: c.statusDraft, marginTop: 6 }}>
                Thumbnail couldn't be generated ({thumbnailError}) — the video will still publish with YouTube's default thumbnail.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => fileInputRef.current?.click()} disabled={busy} style={{ fontSize: 12, color: c.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Choose a different file
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={busy}
                  style={{ padding: '8px 14px', background: c.cardBg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600 }}
                >
                  🖼 Upload thumbnail
                </button>
                <button
                  onClick={handleGenerateSeo}
                  disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8,
                    cursor: busy ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 700, opacity: busy && !generating ? 0.6 : 1,
                  }}
                >
                  {generating ? 'Generating…' : <>✨ Generate SEO</>}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} style={{ display: 'none' }} />
            <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleManualThumbnail} style={{ display: 'none' }} />
          </div>
        )}

        <Field label="Topic (required)">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this video about?" style={inputStyle(c, font)} />
        </Field>

        <Field label={`Title ${aiGenerated ? '(AI-generated — feel free to edit)' : '(optional — leave blank to use Topic)'}`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional manual title" style={inputStyle(c, font)} />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle(c, font), resize: 'vertical' }} />
        </Field>

        <Field label="Tags (comma separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tag one, tag two, tag three" style={inputStyle(c, font)} />
        </Field>

        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <Field label="Made for kids" style={{ flex: '0 0 130px' }}>
            <select value={madeForKids ? 'true' : 'false'} onChange={(e) => setMadeForKids(e.target.value === 'true')} style={inputStyle(c, font)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Visibility" style={{ flex: '0 0 130px' }}>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={inputStyle(c, font)}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </Field>
          <Field label="YouTube category" style={{ flex: '0 0 160px' }}>
            <div style={{ ...inputStyle(c, font), background: '#F7F6F3', color: c.textDim, display: 'flex', alignItems: 'center' }}>
              {categoryLabel}
            </div>
          </Field>
        </div>

        <Field label="Schedule (optional — leave blank to publish right away)">
          <DatePicker
            selected={scheduledAt}
            onChange={setScheduledAt}
            showTimeSelect
            timeIntervals={15}
            dateFormat="MMM d, yyyy — h:mm aa"
            placeholderText="Pick a date and time"
            isClearable
            minDate={new Date()}
            className="upload-modal-datepicker"
            popperPlacement="bottom-start"
          />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: c.statusFailed, background: c.statusFailedBg, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{error}</div>}
        {busy && progressNote && submitting && <div style={{ fontSize: 12.5, color: c.textDim, marginBottom: 12 }}>{progressNote}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={() => !busy && onClose()} disabled={busy} style={btnStyle(c.cardBg, c.text, c.border)}>Exit</button>
          <button onClick={submit} disabled={busy} style={btnStyle(c.accent, '#fff')}>
            {submitting ? 'Working…' : scheduledAt ? 'Schedule' : 'Publish'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .upload-modal-datepicker {
          width: 100%;
          padding: 9px 10px;
          border: 1px solid ${c.border};
          border-radius: 8px;
          font-size: 13px;
          font-family: ${font.body};
          box-sizing: border-box;
          background: ${c.cardBg};
          color: ${c.text};
        }
        .upload-modal-datepicker::placeholder {
          color: ${c.textDim};
        }
        .react-datepicker {
          font-family: ${font.body} !important;
          border: 1px solid ${c.border} !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          background: ${c.cardBg} !important;
        }
        .react-datepicker__month-container,
        .react-datepicker__time-container,
        .react-datepicker__time,
        .react-datepicker__time-box {
          background: ${c.cardBg} !important;
        }
        .react-datepicker__header {
          background: #15161B !important;
          border-bottom: none !important;
          padding-top: 12px;
        }
        .react-datepicker__current-month,
        .react-datepicker-time__header,
        .react-datepicker__day-name,
        .react-datepicker__navigation-icon::before {
          color: #fff !important;
        }
        .react-datepicker__day {
          color: ${c.text} !important;
        }
        .react-datepicker__day--outside-month,
        .react-datepicker__day--disabled {
          color: ${c.textDim} !important;
        }
        .react-datepicker__day--selected,
        .react-datepicker__day--keyboard-selected {
          background: ${c.accent} !important;
          color: #fff !important;
          border-radius: 8px !important;
        }
        .react-datepicker__day:hover {
          border-radius: 8px !important;
          background: ${c.accentDim} !important;
        }
        .react-datepicker__time-list-item {
          color: ${c.text} !important;
        }
        .react-datepicker__time-list-item--selected {
          background: ${c.accent} !important;
          color: #fff !important;
        }
        .react-datepicker__triangle {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, style }) {
  const { colors: c } = useTheme();
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: 'block', fontSize: 11.5, color: c.textDim, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function inputStyle(c, font) {
  return { width: '100%', padding: '9px 10px', border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13, fontFamily: font.body, boxSizing: 'border-box' };
}

function btnStyle(bg, color, border) {
  return { padding: '10px 18px', background: bg, color, border: border ? `1px solid ${border}` : 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
}
