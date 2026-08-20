import { supabaseAdmin } from './supabase';

// Shared by every page that renders the sidebar — one channel list, each with
// a "pendingCount" (videos still waiting to be posted in its linked category).
export async function getChannelsWithCounts() {
  const { data: channels } = await supabaseAdmin
    .from('channels')
    .select('id, name, youtube_channel_id, thumbnail_url')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (!channels || channels.length === 0) return [];

  const { data: links } = await supabaseAdmin.from('channel_categories').select('channel_id, category_id');
  const categoryIdsByChannel = {};
  for (const l of links || []) {
    if (!categoryIdsByChannel[l.channel_id]) categoryIdsByChannel[l.channel_id] = [];
    categoryIdsByChannel[l.channel_id].push(l.category_id);
  }

  const allCategoryIds = [...new Set((links || []).map((l) => l.category_id))];
  let pendingByCategory = {};
  if (allCategoryIds.length > 0) {
    const { data: pendingVideos } = await supabaseAdmin
      .from('videos')
      .select('category_id')
      .in('category_id', allCategoryIds)
      .eq('status', 'pending')
      .is('trashed_at', null);
    for (const v of pendingVideos || []) {
      pendingByCategory[v.category_id] = (pendingByCategory[v.category_id] || 0) + 1;
    }
  }

  return channels.map((ch) => {
    const catIds = categoryIdsByChannel[ch.id] || [];
    const pendingCount = catIds.reduce((sum, cid) => sum + (pendingByCategory[cid] || 0), 0);
    return { ...ch, pendingCount };
  });
}
