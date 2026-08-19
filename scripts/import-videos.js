// One-time import: Excel workbook -> Supabase `videos` table
//
// Setup:
//   npm install xlsx @supabase/supabase-js
//
// Run:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_xxxx \
//   node import-videos.js /path/to/Auto_Post_File.xlsx
//
// What it does:
//   - Reads all 3 sheets (AI Video, Funny Cats, Celebrity video)
//   - Maps each sheet to its category in Supabase
//   - Uses the correct title column per sheet (title for AI Video, idea for the other two)
//   - Fixes any Dropbox links still ending in dl=0 -> dl=1
//   - Skips rows with no video link
//   - Splits Tags into an array
//   - Skips videos already imported (safe to re-run)

const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// Node 20 has no built-in WebSocket global; supabase-js's realtime client needs one
// even though this script never uses realtime features. Polyfill it so the client
// can construct without crashing.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const filePath = process.argv[2];

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars.');
  process.exit(1);
}
if (!filePath) {
  console.error('Usage: node import-videos.js /path/to/Auto_Post_File.xlsx');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  realtime: { transport: require('ws') },
});

// sheet name -> category name (must match what's in the `categories` table)
const SHEET_TO_CATEGORY = {
  'AI Video': 'AI Ads',
  'Funny Cats': 'Funny',
  'Celebrity video': 'Celebrity',
};

// which column holds the real title, per sheet
const TITLE_COLUMN = {
  'AI Video': 'title',
  'Funny Cats': 'idea',
  'Celebrity video': 'idea',
};

function fixDropboxLink(url) {
  if (!url) return url;
  return url.trim().replace(/dl=0\s*$/, 'dl=1');
}

function splitTags(tagsCell) {
  if (!tagsCell) return [];
  return String(tagsCell)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

async function getCategoryMap() {
  const { data, error } = await supabase.from('categories').select('id, name');
  if (error) throw error;
  const map = {};
  for (const row of data) map[row.name] = row.id;
  return map;
}

async function main() {
  const categoryMap = await getCategoryMap();
  const workbook = xlsx.readFile(filePath);

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const sheetName of workbook.SheetNames) {
    const categoryName = SHEET_TO_CATEGORY[sheetName];
    if (!categoryName) {
      console.log(`Skipping unrecognized sheet: ${sheetName}`);
      continue;
    }
    const categoryId = categoryMap[categoryName];
    if (!categoryId) {
      throw new Error(`Category "${categoryName}" not found in Supabase. Did Phase 1 seed run?`);
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const titleCol = TITLE_COLUMN[sheetName];

    const toInsert = [];
    for (const row of rows) {
      const sourceUrl = fixDropboxLink(row['Video Link']);
      const title = row[titleCol];

      if (!sourceUrl || !title) {
        totalSkipped++;
        continue;
      }

      toInsert.push({
        category_id: categoryId,
        source_url: sourceUrl,
        original_title: String(title).trim(),
        original_idea: row['idea'] ? String(row['idea']).trim() : null,
        original_caption: row['caption'] ? String(row['caption']).trim() : null,
        original_tags: splitTags(row['Tags']),
        status: 'pending',
      });
    }

    console.log(`${sheetName}: ${toInsert.length} rows to insert, ${rows.length - toInsert.length} skipped`);

    // insert in batches of 200, ignore duplicates (source_url is unique)
    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200);
      const { error, count } = await supabase
        .from('videos')
        .upsert(batch, { onConflict: 'source_url', ignoreDuplicates: true, count: 'exact' });

      if (error) {
        console.error(`Error inserting batch at row ${i} of ${sheetName}:`, error.message);
        continue;
      }
      totalInserted += batch.length;
    }
  }

  console.log(`\nDone. Attempted to insert ${totalInserted} rows (duplicates auto-skipped), ${totalSkipped} rows skipped for missing data.`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
