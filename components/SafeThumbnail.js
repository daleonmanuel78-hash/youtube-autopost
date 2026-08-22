import { useState, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';

// Loads a YouTube thumbnail via a background JS Image() check first, and
// only ever renders a real <img> once we know it actually loads. This avoids
// the browser's native "broken image" icon flashing on screen — private,
// scheduled, or very-freshly-uploaded videos can 404 on their thumbnail URL,
// and previously that showed as a jarring broken icon instead of a clean
// placeholder.
//
// A manually-uploaded video with its own saved thumbnail (customThumbnailUrl)
// always wins over the YouTube-derived one — it's hosted on our own reliable
// storage, and it's the real answer to "what featured image should show"
// even when YouTube itself rejected the thumbnail for lacking channel
// verification.
export default function SafeThumbnail({ youtubeVideoId, customThumbnailUrl, style }) {
  const { colors: c } = useTheme();
  const [status, setStatus] = useState(youtubeVideoId ? 'loading' : 'none');

  useEffect(() => {
    if (customThumbnailUrl || !youtubeVideoId) {
      // Nothing to background-check — either we already have a reliable
      // custom image, or there's no video posted yet at all.
      return;
    }
    setStatus('loading');
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setStatus('loaded');
    img.onerror = () => !cancelled && setStatus('error');
    img.src = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    return () => {
      cancelled = true;
    };
  }, [youtubeVideoId, customThumbnailUrl]);

  if (customThumbnailUrl) {
    return <img src={customThumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />;
  }

  if (status === 'loaded') {
    return (
      <img
        src={`https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
      />
    );
  }

  const label = status === 'none' ? 'Not uploaded yet' : status === 'loading' ? '' : 'No preview available';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: c.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10.5,
        color: c.textDim,
        textAlign: 'center',
        padding: 4,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {label}
    </div>
  );
}
