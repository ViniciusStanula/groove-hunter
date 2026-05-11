import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOP_N = parseInt(process.env.TOP_N ?? '30', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Dynamic import after env check so supabase client initializes correctly
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: topArtists, error } = await supabase
    .from('top_artists')
    .select('name, rank')
    .order('rank', { ascending: true })
    .limit(TOP_N);

  if (error) throw new Error(`Failed to fetch top artists: ${error.message}`);

  if (!topArtists?.length) {
    console.log('No artists in top_artists table. Run the Last.fm crawler first.');
    process.exit(0);
  }

  console.log(`Scraping albums for top ${topArtists.length} artists...`);

  // Import refresh after env is confirmed set
  const { refreshArtist } = await import('../lib/refresh');

  for (const artist of topArtists) {
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
