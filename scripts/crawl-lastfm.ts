import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY!;

const BATCH_SIZE = 100;
const MAX_PAGE = 100; // 100 pages × 100 artists = 10,000

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function getState(): Promise<{ next_page: number; total_crawled: number }> {
  const { data, error } = await supabase
    .from('crawler_state')
    .select('next_page, total_crawled')
    .eq('id', 1)
    .single();

  if (error) throw new Error(`Failed to get crawler state: ${error.message}`);
  return data;
}

async function updateState(next_page: number, total_crawled: number): Promise<void> {
  const { error } = await supabase
    .from('crawler_state')
    .update({ next_page, total_crawled, last_run: new Date().toISOString() })
    .eq('id', 1);

  if (error) throw new Error(`Failed to update crawler state: ${error.message}`);
}

interface LastfmArtist {
  name: string;
  listeners: string;
  '@attr': { rank: string };
}

async function fetchTopArtists(page: number): Promise<Array<{ name: string; listeners: number; rank: number }>> {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=chart.gettopartists` +
    `&api_key=${LASTFM_API_KEY}&format=json&limit=${BATCH_SIZE}&page=${page}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm API error: ${res.status} ${res.statusText}`);

  const data = await res.json() as { artists: { artist: LastfmArtist[] } };
  return data.artists.artist.map((a) => ({
    name: a.name,
    listeners: parseInt(a.listeners, 10),
    rank: parseInt(a['@attr'].rank, 10),
  }));
}

async function upsertArtists(
  artists: Array<{ name: string; listeners: number; rank: number }>
): Promise<void> {
  const rows = artists.map((a) => ({
    name: a.name,
    slug: slugify(a.name),
    rank: a.rank,
    listeners: a.listeners,
    last_updated: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('top_artists')
    .upsert(rows, { onConflict: 'slug' });

  if (error) throw new Error(`Failed to upsert artists: ${error.message}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !LASTFM_API_KEY) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LASTFM_API_KEY');
  }

  const { next_page, total_crawled } = await getState();
  const rangeStart = (next_page - 1) * BATCH_SIZE + 1;
  const rangeEnd = next_page * BATCH_SIZE;

  console.log(`Crawling page ${next_page} — artists ${rangeStart}–${rangeEnd}`);

  const artists = await fetchTopArtists(next_page);
  console.log(`Fetched ${artists.length} artists from Last.fm`);

  await upsertArtists(artists);
  console.log('Upserted to Supabase');

  const wrapped = next_page >= MAX_PAGE;
  const new_page = wrapped ? 1 : next_page + 1;
  const new_total = wrapped ? 0 : total_crawled + artists.length;

  await updateState(new_page, new_total);

  if (wrapped) {
    console.log('Reached page 100 (10,000 artists). Resetting to page 1 for refresh cycle.');
  } else {
    console.log(`State updated: next_page=${new_page}, total_crawled=${new_total}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
