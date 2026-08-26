// Asks YouTube itself whether a video is a real Short, rather than guessing
// from thumbnail dimensions (which we tried before and found unreliable —
// YouTube often serves landscape-shaped thumbnails even for genuine vertical
// Shorts). Visiting a video's /shorts/{id} URL stays put (200) if YouTube
// classifies it as a Short, and redirects away (30x) if it doesn't.
//
// Only reliable for PUBLIC videos — private/unlisted videos aren't
// accessible this way from an unauthenticated request, so this returns
// `null` (unknown) rather than a wrong guess in that case.
export async function isYoutubeShort(youtubeVideoId) {
  try {
    const resp = await fetch(`https://www.youtube.com/shorts/${youtubeVideoId}`, {
      method: 'GET',
      redirect: 'manual',
    });
    if (resp.status >= 300 && resp.status < 400) return false; // redirected away — not a Short
    if (resp.status === 200) return true;
    return null; // unexpected status — don't guess
  } catch (err) {
    return null;
  }
}
