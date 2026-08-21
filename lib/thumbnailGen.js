import sharp from 'sharp';

// Generates an AI-illustrated thumbnail (via Gemini's image generation) with
// bold, high-contrast title text composited on top — NOT a real frame pulled
// from the actual video (that needs ffmpeg, which this server doesn't have).
// This is a from-scratch illustration inspired by the video's topic/title.
export async function generateAiThumbnail({ topic, title }) {
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-preview-image';
  const prompt = `Create a vibrant, eye-catching YouTube thumbnail illustration (16:9, no text) for a video about: ${topic}. Bold colors, high contrast, dramatic lighting, professional thumbnail style. Do not include any text or words in the image itself.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini image generation error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imagePart) throw new Error('Gemini did not return an image.');

  const baseImageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

  // Composite the title as bold text over a dark gradient bar at the bottom —
  // classic thumbnail treatment for legibility over any background.
  const displayText = escapeXml((title || topic || '').slice(0, 60));
  const overlaySvg = `
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0" />
          <stop offset="100%" stop-color="black" stop-opacity="0.85" />
        </linearGradient>
      </defs>
      <rect x="0" y="420" width="1280" height="300" fill="url(#fade)" />
      <text x="50%" y="640" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900"
            font-size="72" fill="white" stroke="black" stroke-width="4" paint-order="stroke">
        ${displayText}
      </text>
    </svg>`;

  const finalBuffer = await sharp(baseImageBuffer)
    .resize(1280, 720, { fit: 'cover' })
    .composite([{ input: Buffer.from(overlaySvg) }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return finalBuffer;
}

function escapeXml(str) {
  return str.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
