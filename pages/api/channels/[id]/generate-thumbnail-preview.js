import { generateAiThumbnail } from '../../../../lib/thumbnailGen';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { topic, title } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic is required.' });

  try {
    const buffer = await generateAiThumbnail({ topic, title });
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    res.status(200).json({ thumbnailDataUrl: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
