import { supabase } from '@/lib/supabase';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Artist {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  bio: string | null;
  genres: string[];
  created_at: string;
  updated_at: string;
}

export interface Album {
  id: number;
  artist_id: number;
  title: string;
  slug: string;
  release_date: string | null;
  cover_url: string | null;
  tracklist: string[];
  genres: string[];
  created_at: string;
  updated_at: string;
}

export interface Score {
  id: number;
  album_id: number;
  source: string;
  score: number | null;
  max_score: number;
  review_count: number;
  source_url: string | null;
  scraped_at: string;
}

export interface PopularityData {
  id: number;
  album_id: number;
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  lastfm_playcount: number | null;
  wikipedia_views: number | null;
  wikipedia_article: string | null;
  scraped_at: string;
}

export interface AlbumWithScores extends Album {
  artistName: string;
  artistSlug: string;
  scores: Score[];
  aggregateScore: number | null;
  popularity: PopularityData | null;
}

export interface ArtistPopularityContext {
  maxDeezer: number | null;
  maxListeners: number | null;
  totalAlbums: number;
  deezerRank: number | null;
  listenersRank: number | null;
}

// ─── Score weights ────────────────────────────────────────────────────────────

const SOURCE_WEIGHTS: Record<string, number> = {
  discogs: 0.35,
  theaudiodb: 0.25,
  rateyourmusic: 0.15,
  critiquebrainz: 0.10,
};

const POPULARITY_WEIGHT = 0.15;

function normalizePopularity(pop: PopularityData | null): number | null {
  const scores: number[] = [];
  if (pop?.deezer_fans != null) scores.push(pop.deezer_fans);
  if (pop?.lastfm_listeners != null)
    scores.push(Math.min(100, (Math.log10(pop.lastfm_listeners + 1) / 6) * 100));
  if (pop?.wikipedia_views != null)
    scores.push(Math.min(100, (Math.log10(pop.wikipedia_views + 1) / 6) * 100));
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeAggregateScore(scores: Score[], popularity: PopularityData | null): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of scores) {
    if (s.score === null) continue;
    const weight = SOURCE_WEIGHTS[s.source] ?? 0;
    if (weight === 0) continue;
    const normalized = (s.score / s.max_score) * 100;
    weightedSum += normalized * weight;
    totalWeight += weight;
  }

  const popScore = normalizePopularity(popularity);
  if (popScore !== null) {
    weightedSum += popScore * POPULARITY_WEIGHT;
    totalWeight += POPULARITY_WEIGHT;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface AlbumRowWithArtist {
  id: number;
  artist_id: number;
  title: string;
  slug: string;
  release_date: string | null;
  cover_url: string | null;
  tracklist: string[];
  genres: string[];
  created_at: string;
  updated_at: string;
  artists: { name: string; slug: string } | null;
}

function buildAlbumWithScores(
  row: AlbumRowWithArtist,
  scores: Score[],
  popularity: PopularityData | null,
): AlbumWithScores {
  return {
    id: row.id,
    artist_id: row.artist_id,
    title: row.title,
    slug: row.slug,
    release_date: row.release_date,
    cover_url: row.cover_url,
    tracklist: row.tracklist ?? [],
    genres: row.genres ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    artistName: row.artists?.name ?? '',
    artistSlug: row.artists?.slug ?? '',
    scores,
    aggregateScore: computeAggregateScore(scores, popularity),
    popularity,
  };
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function upsertArtist(
  name: string,
  slug: string,
  imageUrl?: string,
  bio?: string,
  genres?: string[],
): Promise<Artist> {
  const row: Record<string, unknown> = { name, slug, updated_at: new Date().toISOString() };
  if (imageUrl != null) row.image_url = imageUrl;
  if (bio != null) row.bio = bio;
  if (genres?.length) row.genres = genres;

  const { data, error } = await supabase
    .from('artists')
    .upsert(row, { onConflict: 'slug' })
    .select()
    .single();

  if (error) throw new Error(`upsertArtist failed: ${error.message}`);
  return data as Artist;
}

export async function upsertAlbum(
  artistId: number,
  title: string,
  slug: string,
  releaseDate?: string,
  coverUrl?: string,
  tracklist?: string[],
  genres?: string[],
): Promise<Album> {
  const row: Record<string, unknown> = {
    artist_id: artistId,
    title,
    slug,
    updated_at: new Date().toISOString(),
  };
  if (releaseDate != null) row.release_date = releaseDate;
  if (coverUrl != null) row.cover_url = coverUrl;
  if (tracklist?.length) row.tracklist = tracklist;
  if (genres?.length) row.genres = genres;

  const { data, error } = await supabase
    .from('albums')
    .upsert(row, { onConflict: 'artist_id,slug' })
    .select()
    .single();

  if (error) throw new Error(`upsertAlbum failed: ${error.message}`);
  return data as Album;
}

export async function upsertScore(
  albumId: number,
  source: string,
  score: number,
  maxScore: number,
  reviewCount: number,
  sourceUrl?: string,
): Promise<void> {
  const row: Record<string, unknown> = {
    album_id: albumId,
    source,
    score,
    max_score: maxScore,
    review_count: reviewCount,
    scraped_at: new Date().toISOString(),
  };
  if (sourceUrl != null) row.source_url = sourceUrl;

  const { error } = await supabase
    .from('scores')
    .upsert(row, { onConflict: 'album_id,source' });

  if (error) throw new Error(`upsertScore failed: ${error.message}`);
}

export async function upsertPopularity(
  albumId: number,
  deezerFans: number | null,
  lastfmListeners: number | null,
  lastfmPlaycount: number | null,
  wikipediaViews: number | null = null,
  wikipediaArticle: string | null = null,
): Promise<void> {
  const row: Record<string, unknown> = {
    album_id: albumId,
    scraped_at: new Date().toISOString(),
  };
  if (deezerFans != null) row.deezer_fans = deezerFans;
  if (lastfmListeners != null) row.lastfm_listeners = lastfmListeners;
  if (lastfmPlaycount != null) row.lastfm_playcount = lastfmPlaycount;
  if (wikipediaViews != null) row.wikipedia_views = wikipediaViews;
  if (wikipediaArticle != null) row.wikipedia_article = wikipediaArticle;

  const { error } = await supabase
    .from('popularity')
    .upsert(row, { onConflict: 'album_id' });

  if (error) throw new Error(`upsertPopularity failed: ${error.message}`);
}

export async function logRefresh(
  artistSlug: string,
  status: string,
  message?: string,
): Promise<void> {
  await supabase.from('refresh_log').insert({
    artist_slug: artistSlug,
    status,
    message: message ?? null,
  });
}

export async function getArtistBySlug(slug: string): Promise<Artist | undefined> {
  const { data } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .single();

  return (data as Artist | null) ?? undefined;
}

export async function getAlbumsByArtist(artistId: number): Promise<AlbumWithScores[]> {
  const { data: albumRows, error } = await supabase
    .from('albums')
    .select('*, artists!inner(name, slug)')
    .eq('artist_id', artistId)
    .order('release_date', { ascending: false });

  if (error || !albumRows?.length) return [];

  const albumIds = albumRows.map((r) => r.id as number);

  const [{ data: scores }, { data: popularity }] = await Promise.all([
    supabase.from('scores').select('*').in('album_id', albumIds),
    supabase.from('popularity').select('*').in('album_id', albumIds),
  ]);

  return (albumRows as AlbumRowWithArtist[]).map((row) => {
    const albumScores = ((scores ?? []) as Score[]).filter((s) => s.album_id === row.id);
    const albumPop = ((popularity ?? []) as PopularityData[]).find((p) => p.album_id === row.id) ?? null;
    return buildAlbumWithScores(row, albumScores, albumPop);
  });
}

export async function getAlbumWithScores(
  artistSlug: string,
  albumSlug: string,
): Promise<AlbumWithScores | undefined> {
  const { data: artist } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('slug', artistSlug)
    .single();

  if (!artist) return undefined;

  const { data: albumRow } = await supabase
    .from('albums')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('slug', albumSlug)
    .single();

  if (!albumRow) return undefined;

  const [{ data: scores }, { data: popularity }] = await Promise.all([
    supabase.from('scores').select('*').eq('album_id', albumRow.id),
    supabase.from('popularity').select('*').eq('album_id', albumRow.id).maybeSingle(),
  ]);

  const row: AlbumRowWithArtist = {
    ...(albumRow as Album),
    artists: { name: artist.name as string, slug: artist.slug as string },
  };

  return buildAlbumWithScores(
    row,
    (scores ?? []) as Score[],
    (popularity as PopularityData | null) ?? null,
  );
}

export async function getTopAlbums(limit: number): Promise<AlbumWithScores[]> {
  const { data: albumRows, error } = await supabase
    .from('albums')
    .select('*, artists!inner(name, slug)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !albumRows?.length) return [];

  const albumIds = albumRows.map((r) => r.id as number);

  const [{ data: scores }, { data: popularity }] = await Promise.all([
    supabase.from('scores').select('*').in('album_id', albumIds),
    supabase.from('popularity').select('*').in('album_id', albumIds),
  ]);

  const results = (albumRows as AlbumRowWithArtist[]).map((row) => {
    const albumScores = ((scores ?? []) as Score[]).filter((s) => s.album_id === row.id);
    const albumPop = ((popularity ?? []) as PopularityData[]).find((p) => p.album_id === row.id) ?? null;
    return buildAlbumWithScores(row, albumScores, albumPop);
  });

  return results.sort((a, b) => {
    if (a.aggregateScore === null && b.aggregateScore === null) return 0;
    if (a.aggregateScore === null) return 1;
    if (b.aggregateScore === null) return -1;
    return b.aggregateScore - a.aggregateScore;
  });
}

export async function getAllArtistSlugs(): Promise<{ slug: string }[]> {
  const { data } = await supabase.from('artists').select('slug');
  return (data ?? []) as { slug: string }[];
}

export async function getAllAlbumSlugs(): Promise<{ artistSlug: string; albumSlug: string }[]> {
  const { data } = await supabase
    .from('albums')
    .select('slug, artists!inner(slug)');

  if (!data) return [];

  return (data as Array<{ slug: string; artists: { slug: string } }>).map((row) => ({
    artistSlug: row.artists.slug,
    albumSlug: row.slug,
  }));
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const { data } = await supabase
    .from('artists')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(10);

  return (data ?? []) as Artist[];
}

export async function searchAlbums(query: string): Promise<AlbumWithScores[]> {
  const { data: albumRows } = await supabase
    .from('albums')
    .select('*, artists!inner(name, slug)')
    .ilike('title', `%${query}%`)
    .limit(10);

  if (!albumRows?.length) return [];

  const albumIds = albumRows.map((r) => r.id as number);
  const [{ data: scores }, { data: popularity }] = await Promise.all([
    supabase.from('scores').select('*').in('album_id', albumIds),
    supabase.from('popularity').select('*').in('album_id', albumIds),
  ]);

  return (albumRows as AlbumRowWithArtist[]).map((row) => {
    const albumScores = ((scores ?? []) as Score[]).filter((s) => s.album_id === row.id);
    const albumPop = ((popularity ?? []) as PopularityData[]).find((p) => p.album_id === row.id) ?? null;
    return buildAlbumWithScores(row, albumScores, albumPop);
  });
}

export async function clearArtistAlbums(artistId: number): Promise<void> {
  const { data: albums } = await supabase
    .from('albums')
    .select('id')
    .eq('artist_id', artistId);

  if (!albums?.length) return;

  const albumIds = albums.map((a) => a.id as number);

  await Promise.all([
    supabase.from('scores').delete().in('album_id', albumIds),
    supabase.from('popularity').delete().in('album_id', albumIds),
  ]);

  await supabase.from('albums').delete().eq('artist_id', artistId);
}

export async function getArtistPopularityContext(
  artistId: number,
  albumId: number,
): Promise<ArtistPopularityContext> {
  const { data: albums } = await supabase
    .from('albums')
    .select('id')
    .eq('artist_id', artistId);

  if (!albums?.length) {
    return { maxDeezer: null, maxListeners: null, totalAlbums: 0, deezerRank: null, listenersRank: null };
  }

  const albumIds = albums.map((a) => a.id as number);

  const { data: rows } = await supabase
    .from('popularity')
    .select('album_id, deezer_fans, lastfm_listeners')
    .in('album_id', albumIds);

  if (!rows?.length) {
    return { maxDeezer: null, maxListeners: null, totalAlbums: albums.length, deezerRank: null, listenersRank: null };
  }

  type PopRow = { album_id: number; deezer_fans: number | null; lastfm_listeners: number | null };
  const popRows = rows as PopRow[];

  const deezerSorted = popRows
    .filter((r) => r.deezer_fans != null)
    .sort((a, b) => (b.deezer_fans ?? 0) - (a.deezer_fans ?? 0));
  const listenersSorted = popRows
    .filter((r) => r.lastfm_listeners != null)
    .sort((a, b) => (b.lastfm_listeners ?? 0) - (a.lastfm_listeners ?? 0));

  return {
    maxDeezer: deezerSorted[0]?.deezer_fans ?? null,
    maxListeners: listenersSorted[0]?.lastfm_listeners ?? null,
    totalAlbums: albums.length,
    deezerRank: deezerSorted.findIndex((r) => r.album_id === albumId) + 1 || null,
    listenersRank: listenersSorted.findIndex((r) => r.album_id === albumId) + 1 || null,
  };
}
