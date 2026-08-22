import { supabaseAdmin } from '../../../../lib/supabase';
import formidable from 'formidable';
import fs from 'fs';

// Uploads a custom display photo shown ONLY in this dashboard's sidebar and
// channel header — it never touches or overrides the real YouTube channel
// avatar, which the public YouTube API doesn't allow changing at all.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { id: channelId } = req.query;

  try {
    const form = formidable({ maxFileSize: 5 * 1024 * 1024 }); // 5MB is plenty for a logo image
    const [, files] = await form.parse(req);
    const file = Array.isArray(files.logo) ? files.logo[0] : files.logo;
    if (!file) return res.status(400).json({ error: 'No image uploaded.' });

    const buffer = fs.readFileSync(file.filepath);
    const storagePath = `logos/${channelId}-${Date.now()}.jpg`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('channel-uploads')
      .upload(storagePath, buffer, { contentType: file.mimetype || 'image/jpeg', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage.from('channel-uploads').getPublicUrl(storagePath);

    const { error: updateErr } = await supabaseAdmin
      .from('channels')
      .update({ custom_logo_url: publicUrlData.publicUrl })
      .eq('id', channelId);
    if (updateErr) throw updateErr;

    fs.unlink(file.filepath, () => {});
    res.status(200).json({ ok: true, url: publicUrlData.publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
