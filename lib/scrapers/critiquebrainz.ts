const MB_BASE = 'https://musicbrainz.org/ws/2';
const CB_BASE = 'https://critiquebrainz.org/ws/1';
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

async function getMusicBrainzReleaseGroupId(
  artistName: string,
  albumTitle: string
): Promise<string | null> {
  await mbRateLimit();
  const query = encodeURIComponent(`artist:"${artistName}" AND release:"${albumTitle}"`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${MB_BASE}/release-group/?query=${query}&fmt=json&limit=1`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { 'release-groups'?: Array<{ id: string; score: number }> };
    const groups = data['release-groups'];
    if (!groups?.length || (groups[0].score ?? 0) < 80) return null;
    return groups[0].id;
  } catch {
    return null;
  }
}

interface CbReviewResponse {
  average_rating?: { rating: number; count: number };
}

export async function getCritiqueBrainzScore(
  artistName: string,
  albumTitle: string
): Promise<ScraperResult | null> {
  const mbid = await getMusicBrainzReleaseGroupId(artistName, albumTitle);
  if (!mbid) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `${CB_BASE}/review/?entity_id=${mbid}&entity_type=release_group&limit=1`,
      { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as CbReviewResponse;
    const avg = data.average_rating;
    if (!avg || avg.count < 3) return null;

    // CritiqueBrainz ratings are 1–5; normalize to 0–100
    const score = ((avg.rating - 1) / 4) * 100;
    return {
      score: Math.round(score * 10) / 10,
      reviewCount: avg.count,
      url: `https://critiquebrainz.org/release-group/${mbid}/`,
    };
  } catch (err) {
    console.error('[critiquebrainz] Error:', err);
    return null;
  }
}
