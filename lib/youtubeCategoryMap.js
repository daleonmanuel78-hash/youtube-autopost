// Maps our internal category names to YouTube's standard video category IDs.
// (These IDs are fixed, global YouTube category IDs — not something we define.)
const CATEGORY_NAME_TO_YOUTUBE_ID = {
  'Funny': '24',    // Entertainment
  'AI Ads': '1',    // Film & Animation
  'Celebrity': '22', // People & Blogs
};

const CATEGORY_NAME_TO_YOUTUBE_LABEL = {
  'Funny': 'Entertainment',
  'AI Ads': 'Film & Animation',
  'Celebrity': 'People & Blogs',
};

const FALLBACK_YOUTUBE_CATEGORY_ID = '22'; // People & Blogs, if a category has no mapping
const FALLBACK_YOUTUBE_LABEL = 'People & Blogs';

export async function getYoutubeCategoryId(supabaseAdmin, categoryId) {
  if (!categoryId) return FALLBACK_YOUTUBE_CATEGORY_ID;
  const { data } = await supabaseAdmin.from('categories').select('name').eq('id', categoryId).maybeSingle();
  return CATEGORY_NAME_TO_YOUTUBE_ID[data?.name] || FALLBACK_YOUTUBE_CATEGORY_ID;
}

// Synchronous, static lookup for display purposes (e.g. showing the label in
// the upload popup) — no database call needed once you already know the name.
export function getYoutubeCategoryLabel(categoryName) {
  return CATEGORY_NAME_TO_YOUTUBE_LABEL[categoryName] || FALLBACK_YOUTUBE_LABEL;
}
