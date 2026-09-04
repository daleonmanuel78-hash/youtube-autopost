import { supabaseAdmin } from '../../../lib/supabase';
import { checkAdminAuth } from '../../../lib/adminAuth';
import { insertNotification } from '../../../lib/notifications';
import { sendNotificationEmail } from '../../../lib/email';

export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const count = Math.min(parseInt(req.body?.count) || 10, 50);
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const log = [];
  const add = (line) => log.push(line);

  try {
    const { data: pendingVideos } = await supabaseAdmin
      .from('videos')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(300);

    const videoIds = (pendingVideos || []).map((v) => v.id);
    const { data: existingSeo } = videoIds.length > 0
      ? await supabaseAdmin.from('video_seo').select('video_id').in('video_id', videoIds)
      : { data: [] };
    const alreadyHasSeo = new Set((existingSeo || []).map((r) => r.video_id));

    const toProcess = (pendingVideos || []).filter((v) => !alreadyHasSeo.has(v.id)).slice(0, count);
    add(`Processing ${toProcess.length} videos...`);

    let succeeded = 0;
    for (const video of toProcess) {
      try {
        const prompt = `You are optimizing metadata for a YouTube video.
Original title: ${video.original_title || ''}
Idea/topic: ${video.original_idea || ''}
Caption/notes: ${video.original_caption || ''}
Existing tags: ${(video.original_tags || []).join(', ')}

Respond with ONLY a raw JSON object, no markdown fences, no preamble.
Exact shape:
{"title": "string, max 100 characters", "description": "string, max 4500 characters", "tags": ["array", "max 15 tags", "combined max 480 characters"]}`;

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, responseMimeType: 'application/json', maxOutputTokens: 1024 },
            }),
          }
        );
        if (!resp.ok) throw new Error(`Gemini API error ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini returned no content.');

        let clean;
        try {
          clean = JSON.parse(text);
        } catch {
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('Gemini response was not valid JSON.');
          clean = JSON.parse(match[0]);
        }

        await supabaseAdmin.from('video_seo').insert({
          video_id: video.id,
          generated_title: clean.title,
          generated_description: clean.description,
          generated_tags: clean.tags,
          gemini_model: model,
        });
        succeeded++;
        add(`✓ ${video.original_title} -> "${clean.title}"`);
      } catch (err) {
        add(`✗ ${video.original_title}: ${err.message}`);
      }
    }
    add(`Done. ${succeeded}/${toProcess.length} succeeded.`);
    const title = `${succeeded}/${toProcess.length} SEO generated`;
    await insertNotification('generate-seo', succeeded === toProcess.length || toProcess.length === 0 ? 'success' : 'failed', title, log);
    await sendNotificationEmail(`YT AutoPosting: ${title}`, log);
    res.status(200).json({ log });
  } catch (err) {
    add(`Fatal error: ${err.message}`);
    await insertNotification('generate-seo', 'failed', `Fatal error: ${err.message}`, log);
    await sendNotificationEmail('YT AutoPosting: SEO generation FAILED', log);
    res.status(500).json({ log, error: err.message });
  }
}
