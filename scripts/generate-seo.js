// Phase 4: Gemini SEO enrichment
//
// For each video that doesn't have SEO metadata yet, sends the existing
// original_title / original_idea / original_caption / original_tags to Gemini
// and asks it to POLISH/ENRICH them for YouTube search — not invent new content
// from scratch. Saves the result into video_seo.
//
// Setup (in your project folder):
//   npm install node-fetch@2 ws
//
// Run:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SECRET_KEY="your_secret_key"
//   $env:GEMINI_API_KEY="your_gemini_key"
//   node generate-seo.js
//
// Optional: node generate-seo.js 50   -> only process 50 videos this run (default 20)

const ws = require('ws');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws;
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const BATCH_LIMIT = parseInt(process.argv[2] || '20', 10);

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !GEMINI_API_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SECRET_KEY, or GEMINI_API_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: { transport: ws },
});

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

async function callGemini(video) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(video) }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
  };

  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini response wasn't valid JSON: ${text.slice(0, 200)}`);
  }
  return parsed;
}

function validateAndClean(result) {
  let title = String(result.title || '').trim().slice(0, 100);
  let description = String(result.description || '').trim().slice(0, 4900);
  let tags = Array.isArray(result.tags) ? result.tags.map(String) : [];

  // enforce YouTube's combined tag character limit (~500, we cap at 480 for safety)
  let totalLen = 0;
  const cleanTags = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    totalLen += trimmed.length + 1; // +1 for comma separator
    if (totalLen > 480) break;
    cleanTags.push(trimmed);
  }

  return { title, description, tags: cleanTags };
}

async function main() {
  // find videos that don't have SEO metadata yet
  const { data: existingSeoRows, error: seoErr } = await supabase
    .from('video_seo')
    .select('video_id');
  if (seoErr) throw seoErr;
  const alreadyDone = new Set((existingSeoRows || []).map((r) => r.video_id));

  const { data: videos, error: vidErr } = await supabase
    .from('videos')
    .select('id, original_title, original_idea, original_caption, original_tags')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT * 3); // pull extra since we'll filter out already-done ones client side
  if (vidErr) throw vidErr;

  const toProcess = videos.filter((v) => !alreadyDone.has(v.id)).slice(0, BATCH_LIMIT);

  console.log(`Processing ${toProcess.length} videos (batch limit ${BATCH_LIMIT})...`);

  let succeeded = 0;
  let failed = 0;

  for (const video of toProcess) {
    try {
      const raw = await callGemini(video);
      const clean = validateAndClean(raw);

      const { error: insertErr } = await supabase.from('video_seo').insert({
        video_id: video.id,
        generated_title: clean.title,
        generated_description: clean.description,
        generated_tags: clean.tags,
        gemini_model: GEMINI_MODEL,
      });

      if (insertErr) throw insertErr;

      succeeded++;
      console.log(`✓ ${video.original_title || video.id} -> "${clean.title}"`);
    } catch (err) {
      failed++;
      console.error(`✗ Failed for video ${video.id} (${video.original_title}): ${err.message}`);
    }
    // small delay to be gentle on rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
