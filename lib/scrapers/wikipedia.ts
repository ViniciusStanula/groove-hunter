const USER_AGENT = 'ScoreStackBot/1.0 (music aggregator)';

let lastCall = 0;
async function rateLimit(): Promise<void> {
  const wait = 200 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function searchArticleTitle(artist: string, album: string): Promise<string | null> {
  await rateLimit();
  const query = `${artist} ${album} album`;
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
    const hits = data.query?.search ?? [];
    if (!hits.length) return null;

    // Prefer result where title contains both artist and album words
    const normAlbum = album.toLowerCase();
    const normArtist = artist.toLowerCase().split(' ')[0];
    const match = hits.find((h) => {
      const t = h.title.toLowerCase();
      return t.includes(normAlbum.slice(0, 6)) && t.includes(normArtist.slice(0, 4));
    }) ?? hits[0];

    return match.title;
  } catch {
    return null;
  }
}

async function fetchAnnualPageviews(title: string): Promise<number | null> {
  await rateLimit();
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const now = new Date();
  const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 12);
  const start = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}01`;

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encoded}/monthly/${start}/${end}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ views: number }> };
    const total = (data.items ?? []).reduce((s, i) => s + i.views, 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export async function getWikipediaPageviews(
  artistName: string,
  albumTitle: string
): Promise<{ views: number; article: string } | null> {
  const title = await searchArticleTitle(artistName, albumTitle);
  if (!title) return null;

  const views = await fetchAnnualPageviews(title);
  if (views === null) return null;

  console.log(`[wikipedia] "${title}": ${views.toLocaleString()} annual views`);
  return { views, article: title };
}
