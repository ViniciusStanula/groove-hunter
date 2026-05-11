import { artistToSlug, albumToSlug } from '@/lib/slugify';
import { upsertArtist, upsertAlbum, upsertScore, upsertPopularity, logRefresh } from '@/lib/db';
import { getArtistMbid, getArtistReleaseGroups, getArtistGenres, getCoverArtUrl, getReleaseTracks, getReleaseGroupTitles } from '@/lib/scrapers/musicbrainz-discovery';
import { getCritiqueBrainzScore } from '@/lib/scrapers/critiquebrainz';
import { getDiscogsScore } from '@/lib/scrapers/discogs';
import { getTheAudioDBScore } from '@/lib/scrapers/theaudiodb';
import { getRYMScore } from '@/lib/scrapers/rateyourmusic';
import { getSpotifyPopularity, getLastfmPopularity } from '@/lib/scrapers/spotify';
import { fetchAlbumInfo } from '@/lib/scrapers/lastfm';
import { getWikipediaPageviews } from '@/lib/scrapers/wikipedia';

const TOP_ARTISTS = [
  'The Weeknd',
  'Kanye West',
  'Michael Jackson',
  'Lady Gaga',
  'PinkPantheress',
];

function extractLastfmImage(images: Array<{ '#text': string; size: string }>): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const size of ['extralarge', 'large', 'medium']) {
    const img = images.find((i) => i.size === size);
    if (img?.['#text']) return img['#text'];
  }
  return undefined;
}

async function getArtistLastfmInfo(artistName: string): Promise<{ bio?: string; imageUrl?: string }> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return {};
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      artist?: {
        bio?: { summary: string };
        image?: Array<{ '#text': string; size: string }>;
      };
    };
    return {
      bio: data.artist?.bio?.summary || undefined,
      imageUrl: extractLastfmImage(data.artist?.image ?? []),
    };
  } catch {
    return {};
  }
}

export async function refreshArtist(artistName: string): Promise<void> {
  const artistSlug = artistToSlug(artistName);
  console.log(`[refresh] Starting refresh for: ${artistName} (${artistSlug})`);

  try {
    // Discover canonical albums via MusicBrainz release groups
    const mbid = await getArtistMbid(artistName);
    if (!mbid) {
      logRefresh(artistSlug, 'warning', 'Artist not found on MusicBrainz');
      console.warn(`[refresh] Artist not found on MusicBrainz: ${artistName}`);
      return;
    }
    console.log(`[refresh] MB artist MBID: ${mbid}`);

    const [releaseGroups, artistGenres] = await Promise.all([
      getArtistReleaseGroups(mbid),
      getArtistGenres(mbid),
    ]);
    if (!releaseGroups.length) {
      logRefresh(artistSlug, 'warning', 'No albums found on MusicBrainz');
      console.warn(`[refresh] No albums found for ${artistName}`);
      return;
    }

    // Limit to 20 most recent studio albums
    const topAlbums = releaseGroups.slice(-20).reverse();
    console.log(`[refresh] Found ${releaseGroups.length} studio albums, processing ${topAlbums.length}`);

    // Fetch artist bio + image from Last.fm (one-time, not per album)
    const { bio, imageUrl: artistImageUrl } = await getArtistLastfmInfo(artistName);

    const artist = upsertArtist(artistName, artistSlug, artistImageUrl, bio, artistGenres);

    for (const rg of topAlbums) {
      try {
        console.log(`[refresh]   Processing: ${rg.title} (${rg.firstReleaseDate ?? 'no date'})`);

        const albumSlug = albumToSlug(rg.title);

        // Cover art, tracklist, and all edition titles (for aggregated Last.fm stats)
        // Last.fm is primary image source (fast CDN, no redirect chain); CAA is fallback
        const [lfmDetail, caaUrl, tracklist, allTitles] = await Promise.all([
          fetchAlbumInfo(artistName, rg.title),
          getCoverArtUrl(rg.id),
          getReleaseTracks(rg.id),
          getReleaseGroupTitles(rg.id),
        ]);

        const coverUrl = lfmDetail?.image || caaUrl || null;

        const album = upsertAlbum(
          artist.id,
          rg.title,
          albumSlug,
          rg.firstReleaseDate ?? undefined,
          coverUrl ?? undefined,
          tracklist,
          rg.genres.length ? rg.genres : artistGenres,
        );

        // Critic scores
        const [tadbResult, discogsResult, cbResult, rymResult] = await Promise.allSettled([
          getTheAudioDBScore(artistName, rg.title),
          getDiscogsScore(artistName, rg.title),
          getCritiqueBrainzScore(artistName, rg.title),
          getRYMScore(artistName, rg.title),
        ]);

        if (tadbResult.status === 'fulfilled' && tadbResult.value)
          upsertScore(album.id, 'theaudiodb', tadbResult.value.score, 100, tadbResult.value.reviewCount, tadbResult.value.url);
        if (discogsResult.status === 'fulfilled' && discogsResult.value)
          upsertScore(album.id, 'discogs', discogsResult.value.score, 100, discogsResult.value.reviewCount, discogsResult.value.url);
        if (cbResult.status === 'fulfilled' && cbResult.value)
          upsertScore(album.id, 'critiquebrainz', cbResult.value.score, 100, cbResult.value.reviewCount, cbResult.value.url);
        if (rymResult.status === 'fulfilled' && rymResult.value)
          upsertScore(album.id, 'rateyourmusic', rymResult.value.score, 100, rymResult.value.reviewCount, rymResult.value.url);

        // Popularity signals
        // Last.fm sums listeners across all editions (remastered, deluxe, etc.)
        const titlesToQuery = allTitles.length ? allTitles : [rg.title];
        const [spotifyResult, lfmPop, wikiViews] = await Promise.all([
          getSpotifyPopularity(artistName, rg.title),
          getLastfmPopularity(artistName, titlesToQuery, process.env.LASTFM_API_KEY ?? ''),
          getWikipediaPageviews(artistName, rg.title),
        ]);
        upsertPopularity(
          album.id,
          spotifyResult?.score ?? null,
          lfmPop?.listeners ?? null,
          lfmPop?.playcount ?? null,
          wikiViews?.views ?? null,
          wikiViews?.article ?? null,
        );

        console.log(`[refresh]   Done: ${rg.title}`);
      } catch (albumErr) {
        console.error(`[refresh] Error processing ${rg.title}:`, albumErr);
      }
    }

    logRefresh(artistSlug, 'success', `Refreshed ${topAlbums.length} albums for ${artistName}`);
    console.log(`[refresh] Completed refresh for: ${artistName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logRefresh(artistSlug, 'error', message);
    console.error(`[refresh] Failed for ${artistName}:`, err);
    throw err;
  }
}

export async function refreshTopArtists(): Promise<void> {
  console.log('[refresh] Starting refresh for top artists');
  for (const artist of TOP_ARTISTS) {
    try {
      await refreshArtist(artist);
    } catch (err) {
      console.error(`[refresh] Failed to refresh ${artist}:`, err);
    }
  }
  console.log('[refresh] Completed refresh for all top artists');
}
