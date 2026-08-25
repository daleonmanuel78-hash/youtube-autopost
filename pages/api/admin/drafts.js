import { supabaseAdmin } from '../../../lib/supabase';
import { checkAdminAuth } from '../../../lib/adminAuth';

// Paginated, searchable list of pending (not-yet-posted) library videos, for
// the "Drafts" monitoring view in the Admin Panel — shows title, caption,
// tags, category, and whether Gemini SEO has already been generated for it.
export default async function handler(req, res) {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const search = (req.query.search || '').trim();
  const categoryId = req.query.categoryId || '';

  try {
    let query = supabaseAdmin
      .from('videos')
      .select('id, original_title, original_caption, original_tags, category_id, created_at', { count: 'exact' })
      .eq('status', 'pending')
      .is('trashed_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (categoryId) query = query.eq('category_id', categoryId);
    if (search) query = query.ilike('original_title', `%${search}%`);

    const { data: videos, count, error } = await query;
    if (error) throw error;

    const { data: categories } = await supabaseAdmin.from('categories').select('id, name');
    const categoryNameById = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));

    const videoIds = (videos || []).map((v) => v.id);
    let seoReadyIds = new Set();
    if (videoIds.length > 0) {
      const { data: seoRows } = await supabaseAdmin.from('video_seo').select('video_id').in('video_id', videoIds);
      seoReadyIds = new Set((seoRows || []).map((r) => r.video_id));
    }

    const enriched = (videos || []).map((v) => ({
      id: v.id,
      title: v.original_title,
      caption: v.original_caption,
      tags: v.original_tags || [],
      category: categoryNameById[v.category_id] || 'Unknown',
      seoReady: seoReadyIds.has(v.id),
      createdAt: v.created_at,
    }));

    res.status(200).json({
      videos: enriched,
      totalCount: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
      categories: categories || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
