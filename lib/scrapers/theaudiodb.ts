const BASE = 'https://www.theaudiodb.com/api/v1/json/2';
const USER_AGENT = 'MusicAggregatorBot/1.0';

export interface ScraperResult {
  score: number;
  reviewCount: number;
  url: string;
}

let lastCall = 0;
async function rateLimit(): Promise<void> {
  const wait = 500 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

interface AudioDBAlbum {
  idAlbum: string;
  strAlbum: string;
  strArtist: string;
  intScore: string | null;
  intScoreVotes: string | null;
}

interface AudioDBResponse {
  album: AudioDBAlbum[] | null;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function getTheAudioDBScore(
  artistName: string,
  albumTitle: string
): Promise<ScraperResult | null> {
  await rateLimit();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `${BASE}/searchalbum.php?s=${encodeURIComponent(artistName)}&a=${encodeURIComponent(albumTitle)}`,
      { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = (await res.json()) as AudioDBResponse;
    if (!data.album?.length) return null;

    // Verify match
    const normAlbum = normalize(albumTitle);
    const match = data.album.find((a) => normalize(a.strAlbum).includes(normAlbum.slice(0, 6)))
      ?? data.album[0];

    if (!match.intScore) return null;
    const score = parseFloat(match.intScore);
    const votes = match.intScoreVotes ? parseInt(match.intScoreVotes, 10) : 0;
    if (isNaN(score) || votes < 1) return null;

    // TheAudioDB scores are 0–10; normalize to 0–100
    return {
      score: Math.round(score * 10),
      reviewCount: votes,
      url: `https://www.theaudiodb.com/album/${match.idAlbum}`,
    };
  } catch (err) {
    console.error('[theaudiodb] Error:', err);
    return null;
  }
}
