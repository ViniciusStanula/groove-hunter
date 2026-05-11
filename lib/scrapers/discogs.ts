const BASE = 'https://api.discogs.com';
const USER_AGENT = 'MusicAggregatorBot/1.0';

export interface ScraperResult {
  score: number;
  reviewCount: number;
  url: string;
}

function authHeader(): string {
  return `Discogs key=${process.env.DISCOGS_KEY}, secret=${process.env.DISCOGS_SECRET}`;
}

let lastCall = 0;
async function rateLimit(): Promise<void> {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function discogsGet<T>(path: string): Promise<T | null> {
  await rateLimit();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Authorization: authHeader(), 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface MasterSearchResult {
  results: Array<{
    id: number;
    title: string;
    uri: string;
  }>;
}

interface Master {
  id: number;
  title: string;
  uri: string;
  main_release: number;
}

interface MasterVersions {
  versions: Array<{ id: number }>;
  pagination: { pages: number; items: number };
}

interface Release {
  community: { rating: { count: number; average: number } };
}

export async function getDiscogsScore(
  artistName: string,
  albumTitle: string
): Promise<ScraperResult | null> {
  const search = await discogsGet<MasterSearchResult>(
    `/database/search?artist=${encodeURIComponent(artistName)}&release_title=${encodeURIComponent(albumTitle)}&type=master&per_page=10`
  );
  if (!search?.results?.length) return null;

  const normAlbum = normalize(albumTitle);
  const normArtist = normalize(artistName);
  const match = search.results.find((r) => {
    const parts = r.title.split(' - ');
    const rArtist = normalize(parts[0] ?? '');
    const rAlbum = normalize(parts.slice(1).join(' - '));
    return rArtist.includes(normArtist.slice(0, 4)) && rAlbum.includes(normAlbum.slice(0, 6));
  }) ?? search.results[0];

  const master = await discogsGet<Master>(`/masters/${match.id}`);
  if (!master) return null;

  // Fetch release IDs — cap at 50 to keep runtime reasonable
  const MAX_RELEASES = 50;
  const releaseIds: number[] = [];
  let page = 1;
  outer: for (;;) {
    const versions = await discogsGet<MasterVersions>(
      `/masters/${match.id}/versions?per_page=100&page=${page}`
    );
    if (!versions?.versions?.length) break;
    for (const v of versions.versions) {
      releaseIds.push(v.id);
      if (releaseIds.length >= MAX_RELEASES) break outer;
    }
    if (page >= versions.pagination.pages) break;
    page++;
  }

  if (!releaseIds.length && master.main_release) {
    releaseIds.push(master.main_release);
  }

  // Fetch community rating for each release and aggregate
  let weightedSum = 0;
  let totalCount = 0;

  for (const id of releaseIds) {
    const rel = await discogsGet<Release>(`/releases/${id}`);
    const r = rel?.community?.rating;
    if (!r || r.count < 1) continue;
    weightedSum += r.average * r.count;
    totalCount += r.count;
  }

  if (totalCount < 5) return null;

  const avgRating = weightedSum / totalCount;
  // Discogs ratings are 1–5; normalize to 0–100
  const score = Math.round(((avgRating - 1) / 4) * 100 * 10) / 10;
  const url = master.uri.startsWith('http') ? master.uri : `https://www.discogs.com${master.uri}`;

  console.log(`[discogs] ${artistName} - ${albumTitle}: ${avgRating.toFixed(2)}/5 → ${score}/100 (${totalCount} ratings across ${releaseIds.length} releases)`);
  return { score, reviewCount: totalCount, url };
}
