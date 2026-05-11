const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicAggregatorBot/1.0 (https://example.com/bot)';

export interface ScraperResult {
  score: number;
  reviewCount: number;
  url: string;
}

let lastMbCall = 0;
async function mbRateLimit(): Promise<void> {
  const wait = 1100 - (Date.now() - lastMbCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMbCall = Date.now();
}

async function getMBReleaseGroupId(artistName: string, albumTitle: string): Promise<string | null> {
  await mbRateLimit();
  const query = encodeURIComponent(`artist:"${artistName}" AND release:"${albumTitle}"`);
  try {
    const res = await fetch(`${MB_BASE}/release-group/?query=${query}&fmt=json&limit=1`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { 'release-groups'?: Array<{ id: string; score: number }> };
    const groups = data['release-groups'];
    if (!groups?.length || (groups[0].score ?? 0) < 80) return null;
    return groups[0].id;
  } catch {
    return null;
  }
}

export async function getRYMScore(
  artistName: string,
  albumTitle: string
): Promise<ScraperResult | null> {
  const mbid = await getMBReleaseGroupId(artistName, albumTitle);
  if (!mbid) return null;

  await mbRateLimit();
  try {
    const res = await fetch(`${MB_BASE}/release-group/${mbid}?inc=ratings&fmt=json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      rating?: { value: number | null; 'votes-count': number };
      id: string;
    };

    const rating = data.rating;
    if (!rating?.value || rating['votes-count'] < 5) return null;

    // MB ratings are 0–5; normalize to 0–100
    const score = Math.round((rating.value / 5) * 100 * 10) / 10;
    const url = `https://musicbrainz.org/release-group/${mbid}/ratings`;

    console.log(`[mb-rating] ${artistName} - ${albumTitle}: ${rating.value}/5 → ${score}/100 (${rating['votes-count']} votes)`);
    return { score, reviewCount: rating['votes-count'], url };
  } catch (err) {
    console.error('[mb-rating] Error:', err);
    return null;
  }
}
