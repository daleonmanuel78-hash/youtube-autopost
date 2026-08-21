// Shared Gemini SEO generation, used both by the "Generate SEO" button in the
// upload popup and (in future) any other place that needs the same behavior.
export async function generateSeoFromTopic({ topic, title, description, tags }) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const prompt = `You are optimizing metadata for a YouTube video about to be published.
Topic: ${topic}
${title ? `Working title: ${title}` : ''}
${description ? `Notes/description: ${description}` : ''}
${tags?.length ? `Existing tags: ${tags.join(', ')}` : ''}

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
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini response was not valid JSON.');
    parsed = JSON.parse(match[0]);
  }
  return {
    title: String(parsed.title || '').slice(0, 100),
    description: String(parsed.description || '').slice(0, 4900),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 15) : [],
  };
}
