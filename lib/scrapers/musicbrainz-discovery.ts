const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org';
const USER_AGENT = 'MusicAggregatorBot/1.0 (https://example.com/bot)';

let lastMbCall = 0;
async function mbRateLimit(): Promise<void> {
  const wait = 1100 - (Date.now() - lastMbCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbCall = Date.now();
}

async function mbGet<T>(path: string): Promise<T | null> {
  await mbRateLimit();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${MB_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  firstReleaseDate: string | null;
  genres: string[];
}

const EXCLUDED_SECONDARY_TYPES = new Set([
  'Compilation', 'Live', 'Soundtrack', 'Spokenword', 'Interview',
  'Audiobook', 'Audio drama', 'Demo', 'Mixtape/Street', 'DJ-mix',
]);

export async function getArtistMbid(artistName: string): Promise<string | null> {
  const query = encodeURIComponent(`artist:"${artistName}"`);
  const data = await mbGet<{
    artists?: Array<{ id: string; score: number; name: string }>;
  }>(`/artist?query=${query}&fmt=json&limit=3`);

  if (!data?.artists?.length) return null;
  const match = data.artists.find((a) => (a.score ?? 0) >= 85) ?? data.artists[0];
  return match.id;
}

export async function getArtistGenres(mbid: string): Promise<string[]> {
  const data = await mbGet<{
    genres?: Array<{ name: string; count: number }>;
  }>(`/artist/${mbid}?inc=genres&fmt=json`);

  if (!data?.genres?.length) return [];
  return data.genres
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((g) => g.name);
}

export async function getArtistReleaseGroups(mbid: string): Promise<MbReleaseGroup[]> {
  const results: MbReleaseGroup[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const data = await mbGet<{
      'release-groups': Array<{
        id: string;
        title: string;
        'first-release-date'?: string;
        'primary-type'?: string;
        'secondary-types'?: string[];
        genres?: Array<{ name: string; count: number }>;
      }>;
      'release-group-count': number;
    }>(`/release-group?artist=${mbid}&type=album&inc=genres&fmt=json&limit=${limit}&offset=${offset}`);

    if (!data?.['release-groups']?.length) break;

    for (const rg of data['release-groups']) {
      if (rg['primary-type'] !== 'Album') continue;
      const secondary = rg['secondary-types'] ?? [];
      if (secondary.some((t) => EXCLUDED_SECONDARY_TYPES.has(t))) continue;
      const genres = (rg.genres ?? [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((g) => g.name);
      results.push({
        id: rg.id,
        title: rg.title,
        firstReleaseDate: rg['first-release-date'] || null,
        genres,
      });
    }

    offset += data['release-groups'].length;
    if (offset >= data['release-group-count']) break;
  }

  return results.sort((a, b) => {
    if (!a.firstReleaseDate && !b.firstReleaseDate) return 0;
    if (!a.firstReleaseDate) return 1;
    if (!b.firstReleaseDate) return -1;
    return a.firstReleaseDate.localeCompare(b.firstReleaseDate);
  });
}

export async function getCoverArtUrl(rgMbid: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${CAA_BASE}/release-group/${rgMbid}`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      images?: Array<{ image: string; types: string[]; front: boolean }>;
    };

    const front = data.images?.find((img) => img.front || img.types.includes('Front'));
    let url = front?.image ?? null;
    if (!url) return null;

    // CAA URLs redirect to archive.org CDN. Follow the redirect now so the
    // stored URL is the final CDN URL — avoids 8s timeout in Next.js image optimizer.
    try {
      const headCtrl = new AbortController();
      const headT = setTimeout(() => headCtrl.abort(), 10_000);
      const headRes = await fetch(url.replace(/^http:\/\//, 'https://'), {
        method: 'HEAD',
        redirect: 'follow',
        signal: headCtrl.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      clearTimeout(headT);
      if (headRes.ok && headRes.url) url = headRes.url;
    } catch {
      // fall back to original URL if HEAD fails
    }

    return url.replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
}

export async function getReleaseGroupTitles(rgMbid: string): Promise<string[]> {
  const data = await mbGet<{
    releases?: Array<{ title: string; status?: string }>;
  }>(`/release?release-group=${rgMbid}&status=official&fmt=json&limit=100`);

  if (!data?.releases?.length) return [];

  const seen = new Set<string>();
  const titles: string[] = [];
  for (const r of data.releases) {
    const t = r.title.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      titles.push(t);
    }
  }
  return titles;
}

export async function getReleaseTracks(rgMbid: string): Promise<string[]> {
  await mbRateLimit();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(
      `${MB_BASE}/release?release-group=${rgMbid}&inc=recordings&status=official&fmt=json&limit=1`,
      { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    );
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      releases?: Array<{
        media?: Array<{ tracks?: Array<{ title: string }> }>;
      }>;
    };

    const release = data.releases?.[0];
    if (!release?.media) return [];

    return release.media
      .flatMap((m) => m.tracks ?? [])
      .map((tr) => tr.title)
      .filter(Boolean);
  } catch {
    return [];
  }
}
