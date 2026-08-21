import { generateSeoFromTopic } from '../../../../lib/geminiSeo';

// Generates SEO metadata from the Topic (and any other fields already typed)
// WITHOUT publishing anything — the popup shows the result in the form fields
// so you can review/edit before actually posting.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { topic, title, description, tags } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic is required.' });

  try {
    const generated = await generateSeoFromTopic({ topic, title, description, tags });
    res.status(200).json(generated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
