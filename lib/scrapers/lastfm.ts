const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// Module-level rate limiting
let lastCallTimestamp = 0;
const RATE_LIMIT_MS = 200;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTimestamp;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastCallTimestamp = Date.now();
}

async function lastfmFetch(
  params: Record<string, string>
): Promise<unknown> {
  await rateLimit();

  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.warn('[lastfm] LASTFM_API_KEY not set');
    return null;
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[lastfm] HTTP ${res.status} for ${params.method}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    console.error('[lastfm] fetch error:', err);
    return null;
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LastfmAlbum {
  name: string;
  playcount: number;
  url: string;
  image: string;
}

export interface LastfmAlbumDetail {
  name: string;
  artist: string;
  image: string;
  tracks: string[];
  listeners: number;
  playcount: number;
  wiki?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractImage(images: Array<{ '#text': string; size: string }>): string {
  if (!Array.isArray(images)) return '';
  // Prefer 'extralarge' or 'large'
  const sizes = ['extralarge', 'large', 'medium', 'small'];
  for (const size of sizes) {
    const img = images.find((i) => i.size === size);
    if (img?.['#text']) return img['#text'];
  }
  return images[images.length - 1]?.['#text'] ?? '';
}

/**
 * Normalize Last.fm listener count to 0–100 using a log scale.
 * 0 listeners → 0, 10M+ listeners → 100
 */
function normalizeListeners(listeners: number): number {
  if (!listeners || listeners <= 0) return 0;
  const MAX_LISTENERS = 10_000_000;
  const score = (Math.log10(listeners + 1) / Math.log10(MAX_LISTENERS + 1)) * 100;
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function fetchArtistAlbums(
  artistName: string
): Promise<LastfmAlbum[]> {
  const data = (await lastfmFetch({
    method: 'artist.getTopAlbums',
    artist: artistName,
    limit: '20',
  })) as {
    topalbums?: {
      album?: Array<{
        name: string;
        playcount: number;
        url: string;
        image: Array<{ '#text': string; size: string }>;
      }>;
    };
  } | null;

  if (!data?.topalbums?.album) return [];

  return data.topalbums.album
    .filter((a) => a.name && a.name !== '(null)')
    .map((a) => ({
      name: a.name,
      playcount: Number(a.playcount) || 0,
      url: a.url,
      image: extractImage(a.image),
    }));
}

export async function fetchAlbumInfo(
  artistName: string,
  albumTitle: string
): Promise<LastfmAlbumDetail | null> {
  const data = (await lastfmFetch({
    method: 'album.getInfo',
    artist: artistName,
    album: albumTitle,
  })) as {
    album?: {
      name: string;
      artist: string;
      image: Array<{ '#text': string; size: string }>;
      tracks?: {
        track?: Array<{ name: string }> | { name: string };
      };
      listeners: string;
      playcount: string;
      wiki?: { summary: string };
    };
    error?: number;
  } | null;

  if (!data || data.error || !data.album) return null;

  const album = data.album;

  let tracks: string[] = [];
  if (album.tracks?.track) {
    const t = album.tracks.track;
    if (Array.isArray(t)) {
      tracks = t.map((tr) => tr.name).filter(Boolean);
    } else if (t.name) {
      tracks = [t.name];
    }
  }

  return {
    name: album.name,
    artist: album.artist,
    image: extractImage(album.image),
    tracks,
    listeners: parseInt(album.listeners ?? '0', 10),
    playcount: parseInt(album.playcount ?? '0', 10),
    wiki: album.wiki?.summary,
  };
}

export async function getLastfmScore(
  artistName: string,
  albumTitle: string
): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const detail = await fetchAlbumInfo(artistName, albumTitle);
    if (!detail) return null;

    const score = normalizeListeners(detail.listeners);
    // Use listeners as a proxy for "review count" (scaled down)
    const reviewCount = detail.listeners;

    return { score, reviewCount };
  } catch (err) {
    console.error('[lastfm] getLastfmScore error:', err);
    return null;
  }
}
