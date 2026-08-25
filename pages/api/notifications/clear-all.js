import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    // Delete every notification row — this is just a monitoring convenience
    // log, not an audit trail, so a full clear is safe.
    const { error } = await supabaseAdmin.from('job_notifications').delete().not('id', 'is', null);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
