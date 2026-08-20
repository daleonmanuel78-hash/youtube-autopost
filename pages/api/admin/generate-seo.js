import { supabaseAdmin } from '../../../lib/supabase';
import { checkAdminAuth } from '../../../lib/adminAuth';

function buildPrompt(video) {
  return `You are optimizing metadata for a YouTube video. You are given the creator's
existing title, idea/hook, caption, and tags. POLISH and ENRICH this content for
YouTube search and discovery — do not invent a different concept, keep the same
subject and tone, just make it more SEO-effective.

Existing title: ${video.original_title || '(none)'}
Existing idea/hook: ${video.original_idea || '(none)'}
Existing caption: ${video.original_caption || '(none)'}
Existing tags: ${(video.original_tags || []).join(', ') || '(none)'}

Respond with ONLY a raw JSON object, no markdown fences, no preamble, no explanation.
Exact shape:
{"title": "string, max 100 characters", "description": "string, max 4500 characters, engaging, includes relevant keywords naturally", "tags": ["array", "of", "strings", "max 15 tags total", "combined max 480 characters"]}`;
}

function validateAndClean(result) {
  const title = String(result.title || '').trim().slice(0, 100);
  const description = String(result.description || '').trim().slice(0, 4900);
  const tags = Array.isArray(result.tags) ? result.tags.map(String) : [];
  let totalLen = 0;
  const cleanTags = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    totalLen += trimmed.length + 1;
    if (totalLen > 480) break;
    cleanTags.push(trimmed);
  }
  return { title, description, tags: cleanTags };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const count = Math.min(parseInt(req.body?.count || '10', 10), 50); // cap per request to keep it fast
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const log = [];
  const add = (line) => log.push(line);

  try {
    const { data: existingSeoRows } = await supabaseAdmin.from('video_seo').select('video_id');
    const alreadyDone = new Set((existingSeoRows || []).map((r) => r.video_id));

    // Pull a generous window of videos (cheap — just id + text fields, no huge
    // filter arrays that could hit URL/header size limits) so we reliably find
    // enough NOT-yet-processed ones even after thousands are already done.
    const { data: videos } = await supabaseAdmin
      .from('videos')
      .select('id, original_title, original_idea, original_caption, original_tags')
      .order('created_at', { ascending: true })
      .limit(2000);

    const toProcess = (videos || []).filter((v) => !alreadyDone.has(v.id)).slice(0, count);
    add(`Processing ${toProcess.length} videos...`);

    let succeeded = 0;
    for (const video of toProcess) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(video) }] }],
            generationConfig: { temperature: 0.7, responseMimeType: 'application/json', maxOutputTokens: 1024 },
          }),
        });
        if (!resp.ok) throw new Error(`Gemini API error ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini returned no content.');

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) throw new Error(`Invalid JSON: ${text.slice(0, 150)}`);
          parsed = JSON.parse(match[0]);
        }
        const clean = validateAndClean(parsed);

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
    res.status(200).json({ log });
  } catch (err) {
    add(`Fatal error: ${err.message}`);
    res.status(500).json({ log, error: err.message });
  }
}
