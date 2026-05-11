import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RANK_START = parseInt(process.env.RANK_START ?? '1', 10);
const RANK_END = parseInt(process.env.RANK_END ?? '100', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Fetching artists with rank ${RANK_START}–${RANK_END}...`);

  const { data: artists, error } = await supabase
    .from('top_artists')
    .select('name, rank')
    .gte('rank', RANK_START)
    .lte('rank', RANK_END)
    .order('rank', { ascending: true });

  if (error) throw new Error(`Failed to fetch artists: ${error.message}`);

  if (!artists?.length) {
    console.log('No artists found in that rank range. Run the Last.fm crawler first.');
    process.exit(0);
  }

  console.log(`Scraping albums for ${artists.length} artists (ranks ${RANK_START}–${RANK_END})...`);

  const { refreshArtist } = await import('../lib/refresh');

  for (const artist of artists) {
    console.log(`\n[scrape] Rank #${artist.rank}: ${artist.name}`);
    try {
      await refreshArtist(artist.name);
    } catch (err) {
      console.error(`[scrape] Failed for ${artist.name}:`, err);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
