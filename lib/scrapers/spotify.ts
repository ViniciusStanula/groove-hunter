const DEEZER_BASE = 'https://api.deezer.com';

let lastDeezerCall = 0;
async function deezerRateLimit(): Promise<void> {
  const wait = 300 - (Date.now() - lastDeezerCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastDeezerCall = Date.now();
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function getSpotifyPopularity(
  artistName: string,
  albumTitle: string
): Promise<{ score: number; reviewCount: number } | null> {
  await deezerRateLimit();
  try {
    const q = encodeURIComponent(`${artistName} ${albumTitle}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${DEEZER_BASE}/search/album?q=${q}&limit=10`, {
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;

    const data = (await res.json()) as { data?: Array<{ id: number; title: string; artist: { name: string } }> };
    const items = data.data;
    if (!items?.length) return null;

    const normArtist = normalize(artistName);
    const normAlbum = normalize(albumTitle);
    const match = items.find((a) =>
      normalize(a.artist.name).includes(normArtist.slice(0, 4)) &&
      normalize(a.title).includes(normAlbum.slice(0, 5))
    ) ?? items[0];

    // Fetch full album to get fans count
    await deezerRateLimit();
    const albumRes = await fetch(`${DEEZER_BASE}/album/${match.id}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!albumRes.ok) return null;
    const album = (await albumRes.json()) as { fans?: number };
    if (!album.fans) return null;

    // Normalize fans to 0–100 using log scale (1M fans = ~100)
    const score = Math.min(100, Math.round((Math.log10(album.fans + 1) / 6) * 100 * 10) / 10);
    console.log(`[deezer] ${artistName} - ${albumTitle}: ${album.fans} fans → ${score}/100`);
    return { score, reviewCount: album.fans };
  } catch (err) {
    console.error('[deezer] Error:', err);
    return null;
  }
}

let lastLfmCall = 0;
async function lfmRateLimit(): Promise<void> {
  const wait = 200 - (Date.now() - lastLfmCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLfmCall = Date.now();
}

async function fetchLastfmAlbumStats(
  artistName: string,
  albumTitle: string,
  apiKey: string
): Promise<{ listeners: number; playcount: number } | null> {
  await lfmRateLimit();
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${apiKey}&artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumTitle)}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { album?: { listeners: string; playcount: string } };
    if (!data.album) return null;
    return {
      listeners: parseInt(data.album.listeners, 10) || 0,
      playcount: parseInt(data.album.playcount, 10) || 0,
    };
  } catch {
    return null;
  }
}

export async function getLastfmPopularity(
  artistName: string,
  albumTitles: string | string[],
  apiKey: string
): Promise<{ listeners: number; playcount: number } | null> {
  const titles = Array.isArray(albumTitles) ? albumTitles : [albumTitles];
  let totalListeners = 0;
  let totalPlaycount = 0;
  let found = false;

  for (const title of titles) {
    const result = await fetchLastfmAlbumStats(artistName, title, apiKey);
    if (result) {
      totalListeners += result.listeners;
      totalPlaycount += result.playcount;
      found = true;
    }
  }

  return found ? { listeners: totalListeners, playcount: totalPlaycount } : null;
}
