import { supabaseAdmin } from '../../../lib/supabase';

// No admin-secret gate here, consistent with the rest of the regular
// dashboard (only /admin itself is password-protected) — this just reads
// recent job history for the bell icon.
export default async function handler(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const unreadCount = (data || []).filter((n) => !n.read).length;
    res.status(200).json({ notifications: data || [], unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
