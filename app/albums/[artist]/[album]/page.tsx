import { getAlbumWithScores, getAllAlbumSlugs, getArtistPopularityContext } from '@/lib/db';
import type { Score, PopularityData } from '@/lib/db';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamicParams = true;

export async function generateStaticParams() {
  const pairs = await getAllAlbumSlugs();
  return pairs.map((p) => ({ artist: p.artistSlug, album: p.albumSlug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ artist: string; album: string }>;
}): Promise<Metadata> {
  const { artist, album } = await params;
  const data = await getAlbumWithScores(artist, album);
  if (!data) return { title: 'Album Not Found' };
  return {
    title: `${data.title} by ${data.artistName} — The Groove Hunter`,
    description: `Aggregated critic score for ${data.title} by ${data.artistName}. Score: ${data.aggregateScore ?? 'N/A'}/100.`,
  };
}

const CRITIC_SOURCES = ['discogs', 'theaudiodb', 'rateyourmusic', 'critiquebrainz'];

const SOURCE_META: Record<
  string,
  { label: string; url: (artist: string, album: string) => string; color: string }
> = {
  rateyourmusic: {
    label: 'MusicBrainz',
    url: (a, al) =>
      `https://musicbrainz.org/search?query=${encodeURIComponent(a + ' ' + al)}&type=release_group`,
    color: '#A259FF',
  },
  theaudiodb: {
    label: 'TheAudioDB',
    url: (a, al) =>
      `https://www.theaudiodb.com/search.php?s=${encodeURIComponent(a)}&a=${encodeURIComponent(al)}`,
    color: '#E8FF3A',
  },
  discogs: {
    label: 'Discogs',
    url: (a, al) =>
      `https://www.discogs.com/search/?q=${encodeURIComponent(a + ' ' + al)}&type=master`,
    color: '#333DFF',
  },
  critiquebrainz: {
    label: 'CritiqueBrainz',
    url: (a, al) =>
      `https://critiquebrainz.org/search?query=${encodeURIComponent(a + ' ' + al)}`,
    color: '#EB743B',
  },
  lastfm: {
    label: 'Last.fm',
    url: (a, al) =>
      `https://www.last.fm/music/${encodeURIComponent(a)}/${encodeURIComponent(al)}`,
    color: '#D51007',
  },
  deezer: {
    label: 'Deezer',
    url: (a, al) =>
      `https://www.deezer.com/search/${encodeURIComponent(a + ' ' + al)}`,
    color: '#A238FF',
  },
};

// Mirrors db.ts normalizePopularity — keeps popularity score visible in UI
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

// Formula weights — must match db.ts SOURCE_WEIGHTS + POPULARITY_WEIGHT
const FORMULA: Array<{ key: string; label: string; weight: number; color: string }> = [
  { key: 'discogs',      label: 'Discogs',        weight: 35, color: SOURCE_META.discogs.color },
  { key: 'theaudiodb',   label: 'TheAudioDB',     weight: 25, color: SOURCE_META.theaudiodb.color },
  { key: 'rateyourmusic',label: 'MusicBrainz',    weight: 15, color: SOURCE_META.rateyourmusic.color },
  { key: 'critiquebrainz',label:'CritiqueBrainz', weight: 10, color: SOURCE_META.critiquebrainz.color },
  { key: '_pop',         label: 'Popularity',     weight: 15, color: '#A238FF' },
];

// SVG donut ring — r=15.9155 gives circumference≈100, so weight% = dasharray length
// strokeDashoffset: 25 starts at 12-o'clock; subsequent segments decrement by prior weight
const DONUT_SEGMENTS = (() => {
  let cumulativeWeight = 0;
  return FORMULA.map((f) => {
    const offset = 25 - cumulativeWeight;
    const seg = { ...f, dasharray: `${f.weight - 1} ${101 - f.weight}`, dashoffset: offset };
    cumulativeWeight += f.weight;
    return seg;
  });
})();

function scoreTierBar(score: number | null): string {
  if (score === null) return 'bg-zinc-800';
  if (score >= 75) return 'bg-[#E8FF3A]';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-red-600';
}

function scoreBg(score: number | null) {
  if (score === null) return 'bg-zinc-800 text-zinc-500';
  if (score >= 75)
    return 'bg-[#E8FF3A] text-zinc-900 shadow-[0_0_32px_rgba(232,255,58,0.25)] ring-1 ring-inset ring-white/20';
  if (score >= 50) return 'bg-amber-400 text-zinc-900 ring-1 ring-inset ring-white/20';
  return 'bg-red-600 text-zinc-100 ring-1 ring-inset ring-white/10';
}

function scoreBarColor(pct: number): string {
  if (pct >= 75) return 'bg-[#E8FF3A]';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

function scoreTextColor(pct: number): string {
  if (pct >= 75) return 'text-[#E8FF3A]';
  if (pct >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <h2
        className="text-xs font-bold tracking-widest text-zinc-500 uppercase shrink-0"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {children}
      </h2>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

function ScoreRow({
  score,
  artistName,
  albumTitle,
}: {
  score: Score;
  artistName: string;
  albumTitle: string;
}) {
  const meta = SOURCE_META[score.source];
  const pct =
    score.score !== null ? Math.round((score.score / score.max_score) * 100) : null;

  return (
    <div className="grid grid-cols-[1fr_5rem_7rem_5rem] gap-4 items-center px-5 py-4 border-b border-zinc-800 last:border-0 group hover:bg-zinc-800/40 transition-colors">
      <div className="flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: meta?.color ?? '#52525b' }}
        />
        <div>
          <p className="text-sm font-medium text-zinc-200">{meta?.label ?? score.source}</p>
          {(score.source_url ?? (meta ? meta.url(artistName, albumTitle) : null)) && (
            <a
              href={score.source_url ?? meta!.url(artistName, albumTitle)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-600 hover:text-[#E8FF3A] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              View source ↗
            </a>
          )}
        </div>
      </div>

      <div className="text-right text-lg font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
        {pct !== null ? (
          <span className={pct >= 75 ? 'text-[#E8FF3A]' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}>
            {pct}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
        <span className="text-xs text-zinc-700 ml-0.5">/100</span>
      </div>

      <div className="h-1.5 bg-zinc-800 overflow-hidden">
        {pct !== null && (
          <div
            className={`h-full score-bar-fill ${scoreBarColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      <div className="text-right text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
        {score.review_count > 0 ? (
          <>
            <span className="text-zinc-400">{score.review_count.toLocaleString()}</span>
            <span className="ml-1">ratings</span>
          </>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>
    </div>
  );
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ artist: string; album: string }>;
}) {
  const { artist, album } = await params;
  const data = await getAlbumWithScores(artist, album);
  if (!data) notFound();

  const popContext = await getArtistPopularityContext(data.artist_id, data.id);

  const allScores = CRITIC_SOURCES.map(
    (src) => data.scores.find((s) => s.source === src)
  ).filter((s): s is Score => s !== undefined);

  const hasPopularity =
    data.popularity != null &&
    (data.popularity.deezer_fans != null ||
      data.popularity.lastfm_listeners != null ||
      data.popularity.wikipedia_views != null);

  // Compute per-source contributions for the Score Composition panel
  const popScore = normalizePopularity(data.popularity);

  const compositionRows = FORMULA.map((f) => {
    if (f.key === '_pop') {
      const pts = popScore !== null ? (f.weight / 100) * popScore : null;
      return { ...f, score: popScore, points: pts };
    }
    const s = allScores.find((sc) => sc.source === f.key);
    const normalized = s?.score != null ? (s.score / s.max_score) * 100 : null;
    const pts = normalized !== null ? (f.weight / 100) * normalized : null;
    return { ...f, score: normalized, points: pts };
  });

  const activeWeight = compositionRows.reduce(
    (sum, r) => (r.points !== null ? sum + r.weight : sum),
    0
  );
  const pointsSum = compositionRows.reduce((sum, r) => sum + (r.points ?? 0), 0);
  // Aggregate = pointsSum / (activeWeight/100) which equals weighted avg
  const derivedAggregate = activeWeight > 0 ? Math.round((pointsSum / activeWeight) * 100) : null;

  return (
    <>
      {/* Full-width score tier color bar */}
      <div className={`h-1 w-full ${scoreTierBar(data.aggregateScore)}`} />

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 mb-8 text-xs text-zinc-600 flex-wrap">
          <Link href="/" className="hover:text-[#E8FF3A] transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link
            href={`/artists/${data.artistSlug}`}
            className="hover:text-[#E8FF3A] transition-colors"
          >
            {data.artistName}
          </Link>
          <span>/</span>
          <span className="text-zinc-400 truncate max-w-xs">{data.title}</span>
        </nav>

        {/* Album hero */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 mb-14">
          <div className="relative w-48 h-48 sm:w-64 sm:h-64 bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 shadow-2xl">
            {data.cover_url ? (
              <Image
                src={data.cover_url}
                alt={`${data.title} cover`}
                fill
                sizes="256px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-16 h-16 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-end gap-3">
            <p
              className="text-xs font-bold tracking-widest text-[#E8FF3A] uppercase"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Album
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-normal text-zinc-50 leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {data.title}
            </h1>
            <p className="text-xl text-zinc-400">
              by{' '}
              <Link
                href={`/artists/${data.artistSlug}`}
                className="text-zinc-200 hover:text-[#E8FF3A] transition-colors font-medium"
              >
                {data.artistName}
              </Link>
            </p>
            {data.release_date && (
              <p className="text-sm text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                {data.release_date}
              </p>
            )}
            {data.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {data.genres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 text-xs border border-zinc-700 text-zinc-400 bg-zinc-900"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-5 mt-4">
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center text-5xl font-bold score-badge ${scoreBg(data.aggregateScore)}`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {data.aggregateScore !== null ? Math.round(data.aggregateScore) : '—'}
              </div>
              <div className="pb-2">
                <p className="text-sm font-medium text-zinc-300">Aggregate Score</p>
                <p className="text-xs text-zinc-600 max-w-xs mt-0.5">
                  {allScores.length} critic source{allScores.length !== 1 ? 's' : ''}
                  {hasPopularity ? ' + popularity signals' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="mb-10">
          <SectionLabel>Score Breakdown</SectionLabel>
          {(() => {
            const lfmScore = data.popularity?.lastfm_listeners != null
              ? Math.min(100, Math.round((Math.log10(data.popularity.lastfm_listeners + 1) / 6) * 100 * 10) / 10)
              : null;
            const deezerScore = data.popularity?.deezer_fans != null
              ? data.popularity.deezer_fans
              : null;
            const hasAnyScore = allScores.length > 0 || lfmScore !== null || deezerScore !== null;

            if (!hasAnyScore) return (
              <div className="border border-dashed border-zinc-800 py-10 text-center text-zinc-600 text-sm">
                No scores collected yet.
              </div>
            );

            const popRows: Array<{ key: string; score: number | null; count: string | null }> = [
              { key: 'lastfm', score: lfmScore, count: data.popularity?.lastfm_listeners != null ? data.popularity.lastfm_listeners.toLocaleString() + ' listeners' : null },
              { key: 'deezer', score: deezerScore, count: data.popularity?.deezer_fans != null ? Math.round(data.popularity.deezer_fans as number).toString() + '/100' : null },
            ];

            return (
              <div className="border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
                <div
                  className="grid grid-cols-[1fr_5rem_7rem_5rem] gap-4 px-5 py-2 text-xs font-bold tracking-widest text-zinc-600 uppercase"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <span>Source</span>
                  <span className="text-right">Score</span>
                  <span>Bar</span>
                  <span className="text-right">Ratings</span>
                </div>
                {allScores.map((score) => (
                  <ScoreRow
                    key={score.id}
                    score={score}
                    artistName={data.artistName}
                    albumTitle={data.title}
                  />
                ))}
                {popRows.map(({ key, score, count }) => {
                  const meta = SOURCE_META[key];
                  const pct = score !== null ? Math.round(score) : null;
                  const color = pct === null ? 'text-zinc-600' : pct >= 75 ? 'text-[#E8FF3A]' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
                  const barColor = pct === null ? '' : pct >= 75 ? 'bg-[#E8FF3A]' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500';
                  return (
                    <div key={key} className="grid grid-cols-[1fr_5rem_7rem_5rem] gap-4 items-center px-5 py-4 border-b border-zinc-800 last:border-0 group hover:bg-zinc-800/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{meta.label}</p>
                          <a
                            href={meta.url(data.artistName, data.title)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-600 hover:text-[#E8FF3A] transition-colors"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            View source ↗
                          </a>
                        </div>
                      </div>
                      <div className="text-right text-lg font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
                        {pct !== null ? <span className={color}>{pct}</span> : <span className="text-zinc-600">—</span>}
                        {pct !== null && <span className="text-xs text-zinc-700 ml-0.5">/100</span>}
                      </div>
                      <div className="h-1.5 bg-zinc-800 overflow-hidden">
                        {pct !== null && <div className={`h-full score-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />}
                      </div>
                      <div className="text-right text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                        {count ? <span className="text-zinc-400">{count}</span> : <span className="text-zinc-700">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Popularity panel */}
        {data.popularity && popContext.totalAlbums > 0 && (
          <div className="mb-10">
            <SectionLabel>Discography Popularity</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.popularity.deezer_fans != null && popContext.maxDeezer != null && (
                <div className="bg-zinc-900 border border-zinc-800 border-t-2 border-t-[#A238FF] p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#A238FF] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38H6.27zm6.27 0v3.027h5.19V8.38h-5.19zm6.27 0v3.027H24V8.38h-5.19zM6.27 12.6v3.027h5.189V12.6H6.27zm6.27 0v3.027h5.19V12.6h-5.19zm6.27 0v3.027H24V12.6h-5.19zM0 16.81v3.027h5.19V16.81H0zm6.27 0v3.027h5.189V16.81H6.27zm6.27 0v3.027h5.19V16.81h-5.19zm6.27 0v3.027H24V16.81h-5.19z" />
                      </svg>
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Deezer Popularity</p>
                    {popContext.deezerRank != null && (
                      <span className="ml-auto text-xs font-bold text-zinc-400" style={{ fontFamily: 'var(--font-mono)' }}>
                        #{popContext.deezerRank} of {popContext.totalAlbums}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-zinc-800 mb-2">
                    <div
                      className="h-full bg-[#A238FF] score-bar-fill"
                      style={{ width: `${Math.round((data.popularity.deezer_fans / popContext.maxDeezer) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                    Score{' '}
                    <span className="text-zinc-400">{Math.round(data.popularity.deezer_fans)}</span>
                    <span className="text-zinc-700">/100</span>
                    {popContext.deezerRank != null && (
                      <span className="text-zinc-700 ml-2">
                        · discography peak: {Math.round(popContext.maxDeezer!)}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {data.popularity.wikipedia_views != null && (
                <div className="bg-zinc-900 border border-zinc-800 border-t-2 border-t-[#3366CC] p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#3366CC] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.09 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm.81 15.28h-1.56v-6.4H9.77v-1.4h4.69v1.4h-1.56v6.4zm-3.13-9.06a1.07 1.07 0 1 1 1.07-1.07 1.07 1.07 0 0 1-1.07 1.07z" />
                      </svg>
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Wikipedia Views</p>
                    <span className="ml-auto text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                      12 months
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 mb-2">
                    <div
                      className="h-full bg-[#3366CC] score-bar-fill"
                      style={{ width: `${Math.min(100, Math.round((Math.log10(data.popularity.wikipedia_views + 1) / 6) * 100))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                      {data.popularity.wikipedia_views >= 1_000_000
                        ? `${(data.popularity.wikipedia_views / 1_000_000).toFixed(1)}M`
                        : `${(data.popularity.wikipedia_views / 1_000).toFixed(0)}K`}{' '}
                      annual views
                    </p>
                    {data.popularity.wikipedia_article && (
                      <a
                        href={`https://en.wikipedia.org/wiki/${encodeURIComponent(data.popularity.wikipedia_article.replace(/ /g, '_'))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-600 hover:text-[#E8FF3A] transition-colors shrink-0"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        View article ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              {data.popularity.lastfm_listeners != null && popContext.maxListeners != null && (
                <div className="bg-zinc-900 border border-zinc-800 border-t-2 border-t-[#D51007] p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#D51007] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10.599 8.823l-.881 2.672s-.881-1.058-2.2-1.058c-1.85 0-1.85 2.496 0 2.496.979 0 1.542-.529 1.542-.529l.881 2.672s-.979.529-2.2.529c-3.392 0-3.392-5.343 0-5.343 1.322 0 2.858.561 2.858.561zm4.313 0c-1.763 0-2.672.881-2.672.881l.529 2.143s.528-.881 1.763-.881c.979 0 1.319.529 1.319 1.058v.176c-3.391.176-4.752 1.495-4.752 3.039 0 1.054.705 2.143 2.143 2.143 1.143 0 1.848-.705 1.848-.705v.529h2.32v-4.993c0-2.672-1.675-3.39-2.498-3.39zm.528 5.519c0 .881-.881 1.236-1.495 1.236-.705 0-.705-.529-.705-.529 0-.881 1.142-1.056 2.2-1.144v.437z" />
                      </svg>
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Last.fm Listeners</p>
                    {popContext.listenersRank != null && (
                      <span className="ml-auto text-xs font-bold text-zinc-400" style={{ fontFamily: 'var(--font-mono)' }}>
                        #{popContext.listenersRank} of {popContext.totalAlbums}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-zinc-800 mb-2">
                    <div
                      className="h-full bg-[#D51007] score-bar-fill"
                      style={{ width: `${Math.round((data.popularity.lastfm_listeners / popContext.maxListeners) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                    {data.popularity.lastfm_listeners >= 1_000_000
                      ? `${(data.popularity.lastfm_listeners / 1_000_000).toFixed(1)}M`
                      : `${(data.popularity.lastfm_listeners / 1_000).toFixed(0)}K`}{' '}
                    listeners
                    {data.popularity.lastfm_playcount != null &&
                      ` · ${data.popularity.lastfm_playcount.toLocaleString()} plays`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Composition — donut ring + contribution table */}
        <div className="mb-10">
          <SectionLabel>Score Composition</SectionLabel>
          <div className="bg-zinc-900 border border-zinc-800">
            <div className="flex flex-col lg:flex-row">

              {/* Left — SVG donut ring */}
              <div className="flex items-center justify-center p-8 lg:p-10 lg:border-r border-zinc-800 shrink-0">
                <div className="relative">
                  <svg
                    viewBox="0 0 36 36"
                    className="w-40 h-40"
                    aria-label="Score weight distribution"
                    role="img"
                  >
                    {/* Background ring */}
                    <circle
                      cx="18" cy="18" r="15.9155"
                      fill="none"
                      stroke="#27272a"
                      strokeWidth="3"
                    />
                    {/* Weight segments — circumference≈100, 1-unit gap between each */}
                    {DONUT_SEGMENTS.map((seg) => (
                      <circle
                        key={seg.key}
                        cx="18" cy="18" r="15.9155"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="3"
                        strokeDasharray={seg.dasharray}
                        strokeDashoffset={seg.dashoffset}
                        strokeLinecap="butt"
                      />
                    ))}
                    {/* Aggregate score in center */}
                    {data.aggregateScore !== null && (
                      <>
                        <text
                          x="18" y="16"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={data.aggregateScore >= 75 ? '#E8FF3A' : data.aggregateScore >= 50 ? '#fbbf24' : '#ef4444'}
                          fontSize="7"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {Math.round(data.aggregateScore)}
                        </text>
                        <text
                          x="18" y="21.5"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#52525b"
                          fontSize="3"
                          fontFamily="monospace"
                        >
                          /100
                        </text>
                      </>
                    )}
                  </svg>

                  {/* Legend below donut */}
                  <div className="mt-4 space-y-1.5">
                    {FORMULA.map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="text-[10px] text-zinc-500 flex-1" style={{ fontFamily: 'var(--font-mono)' }}>
                          {f.label}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400" style={{ fontFamily: 'var(--font-mono)' }}>
                          {f.weight}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — contribution table */}
              <div className="flex-1 flex flex-col">
                {/* Column headers */}
                <div
                  className="grid grid-cols-[1fr_3.5rem_3.5rem_5rem] gap-3 px-5 py-3 text-[10px] font-bold tracking-widest text-zinc-600 uppercase border-b border-zinc-800"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <span>Source</span>
                  <span className="text-right">Weight</span>
                  <span className="text-right">Score</span>
                  <span className="text-right">Contribution</span>
                </div>

                {/* Rows */}
                {compositionRows.map((row) => {
                  const hasScore = row.score !== null;
                  // Points bar: how much of max possible contribution was earned
                  // max for this source = row.weight (e.g. Discogs max = 35 pts)
                  const earnedPct = hasScore ? (row.points! / (row.weight / 100)) : 0;
                  return (
                    <div
                      key={row.key}
                      className={`grid grid-cols-[1fr_3.5rem_3.5rem_5rem] gap-3 items-center px-5 py-3.5 border-b border-zinc-800/60 last:border-0 ${!hasScore ? 'opacity-40' : ''}`}
                    >
                      {/* Source name */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="text-sm text-zinc-300 truncate">{row.label}</span>
                      </div>

                      {/* Weight */}
                      <span
                        className="text-right text-xs text-zinc-500"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {row.weight}%
                      </span>

                      {/* Score */}
                      <span
                        className={`text-right text-sm font-bold ${hasScore ? scoreTextColor(row.score!) : 'text-zinc-600'}`}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {hasScore ? Math.round(row.score!) : '—'}
                      </span>

                      {/* Contribution bar + pts */}
                      <div className="flex flex-col gap-1 items-end">
                        <span
                          className={`text-xs font-bold ${hasScore ? 'text-zinc-300' : 'text-zinc-700'}`}
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {hasScore ? `+${row.points!.toFixed(1)}` : '—'}
                        </span>
                        <div className="w-full h-1 bg-zinc-800 overflow-hidden">
                          {hasScore && (
                            <div
                              className="h-full score-bar-fill"
                              style={{
                                width: `${earnedPct}%`,
                                backgroundColor: row.color,
                                opacity: 0.8,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Total row */}
                <div className="mt-auto border-t border-zinc-700 px-5 py-4 grid grid-cols-[1fr_3.5rem_3.5rem_5rem] gap-3 items-center bg-zinc-800/30">
                  <div className="text-xs text-zinc-500" style={{ fontFamily: 'var(--font-mono)' }}>
                    Active weight:{' '}
                    <span className="text-zinc-400 font-bold">{activeWeight}%</span>
                    {activeWeight < 100 && (
                      <span className="text-zinc-600 ml-1">(missing sources excluded)</span>
                    )}
                  </div>
                  <span />
                  <span />
                  <div className="text-right">
                    <span
                      className="text-xs text-zinc-500 block"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      Σ {pointsSum.toFixed(1)} ÷ {activeWeight}%
                    </span>
                    <span
                      className={`text-base font-bold ${derivedAggregate !== null ? (derivedAggregate >= 75 ? 'text-[#E8FF3A]' : derivedAggregate >= 50 ? 'text-amber-400' : 'text-red-400') : 'text-zinc-600'}`}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      = {derivedAggregate ?? '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tracklist */}
        {data.tracklist.length > 0 && (
          <div>
            <SectionLabel>Tracks</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-800">
              {data.tracklist.map((track, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 transition-colors"
                >
                  <span
                    className="text-xs text-zinc-600 w-6 text-right shrink-0"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-zinc-300 truncate">{track}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
