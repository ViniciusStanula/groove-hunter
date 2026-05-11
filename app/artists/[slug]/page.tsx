import { getArtistBySlug, getAlbumsByArtist, getAllArtistSlugs } from '@/lib/db';
import type { AlbumWithScores } from '@/lib/db';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = getAllArtistSlugs();
  return slugs.map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = getArtistBySlug(slug);
  if (!artist) return { title: 'Artista Não Encontrado' };
  return {
    title: `${artist.name} — Álbuns | ScoreStack`,
    description: `Veja todos os álbuns de ${artist.name} com notas agregadas da crítica.`,
  };
}

function scoreTierBg(score: number | null): string {
  if (score === null) return 'bg-zinc-800';
  if (score >= 75) return 'bg-[#E8FF3A]';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-red-600';
}

function scoreBg(score: number | null) {
  if (score === null) return 'bg-zinc-800 text-zinc-500';
  if (score >= 75) return 'bg-[#E8FF3A] text-zinc-900 shadow-[0_0_20px_rgba(232,255,58,0.2)] ring-1 ring-inset ring-white/20';
  if (score >= 50) return 'bg-amber-400 text-zinc-900 ring-1 ring-inset ring-white/20';
  return 'bg-red-600 text-zinc-100 ring-1 ring-inset ring-white/10';
}

const SOURCE_DISPLAY: Record<string, string> = {
  discogs: 'Discogs',
  theaudiodb: 'AudioDB',
  rateyourmusic: 'MusicBrainz',
  critiquebrainz: 'CritBrainz',
  lastfm: 'LFM',
};

function SourceBadge({
  source,
  score,
  maxScore,
}: {
  source: string;
  score: number | null;
  maxScore: number;
}) {
  const pct = score !== null ? Math.round((score / maxScore) * 100) : null;
  const color =
    pct === null
      ? 'text-zinc-600'
      : pct >= 75
        ? 'text-[#E8FF3A]'
        : pct >= 50
          ? 'text-amber-400'
          : 'text-red-400';

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-zinc-700 bg-zinc-900"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-zinc-500">{SOURCE_DISPLAY[source] ?? source}</span>
      <span className={color}>{pct !== null ? pct : '—'}</span>
    </span>
  );
}

const SOURCE_ORDER = ['discogs', 'theaudiodb', 'rateyourmusic', 'critiquebrainz'];

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = getArtistBySlug(slug);
  if (!artist) notFound();

  const albums: AlbumWithScores[] = getAlbumsByArtist(artist.id).sort((a, b) => {
    if (a.aggregateScore === null && b.aggregateScore === null) return 0;
    if (a.aggregateScore === null) return 1;
    if (b.aggregateScore === null) return -1;
    return b.aggregateScore - a.aggregateScore;
  });

  const scoredAlbums = albums.filter((a) => a.aggregateScore !== null);
  const topScore =
    scoredAlbums.length > 0
      ? Math.round(scoredAlbums[0].aggregateScore!)
      : null;
  const avgScore =
    scoredAlbums.length > 0
      ? Math.round(
          scoredAlbums.reduce((sum, a) => sum + a.aggregateScore!, 0) / scoredAlbums.length
        )
      : null;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 mb-8 text-xs text-zinc-600">
        <Link href="/" className="hover:text-[#E8FF3A] transition-colors">
          Início
        </Link>
        <span>/</span>
        <span className="text-zinc-400">{artist.name}</span>
      </nav>

      {/* Artist header */}
      <div className="mb-12">
        {/* Acid yellow top rule */}
        <div className="h-px bg-[#E8FF3A] mb-8 opacity-40" />

        <div className="flex flex-col sm:flex-row gap-8 items-start">
          {/* Image — larger, with slight grain overlay */}
          {artist.image_url ? (
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 shrink-0 overflow-hidden border border-zinc-700 grain-overlay">
              <Image
                src={artist.image_url}
                alt={artist.name}
                fill
                sizes="192px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-40 h-40 sm:w-48 sm:h-48 shrink-0 bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <svg
                className="w-14 h-14 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-col gap-3 pt-1 min-w-0">
            <p
              className="text-xs font-bold tracking-widest text-[#E8FF3A] uppercase"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Artista
            </p>
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-normal text-zinc-50 leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {artist.name}
            </h1>

            {/* Stats row */}
            <div className="flex gap-6 mt-2 pt-3 border-t border-zinc-800">
              <div>
                <p
                  className="text-2xl font-bold text-zinc-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {albums.length}
                </p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-0.5">
                  Álbuns
                </p>
              </div>
              {topScore !== null && (
                <div>
                  <p
                    className={`text-2xl font-bold ${topScore >= 75 ? 'text-[#E8FF3A]' : topScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {topScore}
                  </p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-0.5">
                    Melhor Nota
                  </p>
                </div>
              )}
              {avgScore !== null && scoredAlbums.length > 1 && (
                <div>
                  <p
                    className="text-2xl font-bold text-zinc-400"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {avgScore}
                  </p>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-0.5">
                    Nota Média
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Genres */}
        {artist.genres.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {artist.genres.map((g) => (
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

        {/* Bio — if present */}
        {artist.bio && (
          <div className="mt-6 max-w-2xl border-l-2 border-zinc-700 pl-4">
            <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4">{artist.bio}</p>
          </div>
        )}
      </div>

      {/* Section divider */}
      <div className="flex items-center gap-4 mb-6">
        <p
          className="text-xs font-bold tracking-widest text-zinc-500 uppercase shrink-0"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Discografia
        </p>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Albums table */}
      {albums.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800">
          Nenhum álbum indexado ainda para este artista.
        </div>
      ) : (
        <div className="space-y-px">
          {/* Table header */}
          <div
            className="hidden md:grid grid-cols-[2rem_3.5rem_1fr_4rem_1fr] gap-4 px-5 py-2 text-xs font-bold tracking-widest text-zinc-600 uppercase border-b border-zinc-800"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span>#</span>
            <span />
            <span>Álbum</span>
            <span className="text-right">Nota</span>
            <span>Fontes</span>
          </div>

          {albums.map((album, i) => (
            <Link
              key={album.id}
              href={`/albums/${album.artistSlug}/${album.slug}`}
              className="relative grid grid-cols-1 md:grid-cols-[2rem_3.5rem_1fr_4rem_1fr] gap-4 items-center px-5 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 group overflow-hidden"
            >
              {/* Score tier accent bar — left edge */}
              <span
                className={`absolute left-0 top-0 bottom-0 w-[3px] ${scoreTierBg(album.aggregateScore)}`}
                aria-hidden
              />

              {/* Rank */}
              <span
                className="hidden md:block text-xs text-zinc-600 pl-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Cover */}
              <div className="hidden md:block relative w-14 h-14 bg-zinc-800 overflow-hidden shrink-0">
                {album.cover_url ? (
                  <Image
                    src={album.cover_url}
                    alt={album.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-zinc-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Title + year */}
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-zinc-100 group-hover:text-white font-medium transition-colors"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {album.title}
                </span>
                {album.release_date && (
                  <span
                    className="text-xs text-zinc-600"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {album.release_date.slice(0, 4)}
                  </span>
                )}
              </div>

              {/* Score badge */}
              <div className="md:flex justify-end hidden">
                <span
                  className={`w-12 h-12 flex items-center justify-center text-sm font-bold ${scoreBg(album.aggregateScore)}`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {album.aggregateScore !== null ? Math.round(album.aggregateScore) : '—'}
                </span>
              </div>

              {/* Source badges */}
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_ORDER.map((src) => {
                  const s = album.scores.find((sc) => sc.source === src);
                  return (
                    <SourceBadge
                      key={src}
                      source={src}
                      score={s?.score ?? null}
                      maxScore={s?.max_score ?? 100}
                    />
                  );
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
