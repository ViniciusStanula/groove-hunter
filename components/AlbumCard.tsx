import Image from 'next/image';
import Link from 'next/link';
import type { AlbumWithScores } from '@/lib/db';

export type CardVariant = 'standard' | 'featured' | 'hero';

const ALL_SOURCES = ['discogs', 'theaudiodb', 'rateyourmusic', 'critiquebrainz'];

const SRC_LABELS: Record<string, string> = {
  discogs: 'Discogs',
  theaudiodb: 'AudioDB',
  rateyourmusic: 'MusicBrainz',
  critiquebrainz: 'CritBrainz',
};

function scoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-500 bg-zinc-800 border-zinc-700';
  if (score >= 75)
    return 'text-[#09090b] bg-[#E8FF3A] border-[#E8FF3A] shadow-[0_0_20px_rgba(232,255,58,0.2)] ring-1 ring-inset ring-white/20';
  if (score >= 50)
    return 'text-zinc-900 bg-amber-400 border-amber-400 ring-1 ring-inset ring-white/20';
  return 'text-zinc-100 bg-red-600 border-red-600 ring-1 ring-inset ring-white/10';
}

function barColor(pct: number, hasData: boolean): string {
  if (!hasData) return 'bg-zinc-700';
  if (pct >= 75) return 'bg-[#E8FF3A]';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

const MusicIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
    />
  </svg>
);

export function AlbumCard({
  album,
  rank,
  variant = 'standard',
  priority = false,
}: {
  album: AlbumWithScores;
  rank: number;
  variant?: CardVariant;
  priority?: boolean;
}) {
  const score = album.aggregateScore;
  const sourceCount = album.scores.filter((s) => s.score !== null).length;
  const rankStr = `#${String(rank).padStart(2, '0')}`;

  const bars = ALL_SOURCES.map((src) => {
    const s = album.scores.find((sc) => sc.source === src);
    const pct = s?.score != null ? (s.score / s.max_score) * 100 : 0;
    const hasData = s?.score != null;
    return { src, s, pct, hasData };
  });

  // ── Hero variant (#1) ───────────────────────────────────────────────────────
  if (variant === 'hero') {
    return (
      <div
        className="group relative flex bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all duration-300 overflow-hidden"
        style={{ minHeight: '200px' }}
      >
        <Link
          href={`/albums/${album.artistSlug}/${album.slug}`}
          className="absolute inset-0 z-0"
          aria-label={`${album.title} por ${album.artistName}`}
        />

        {/* Cover — fixed width column */}
        <div className="relative w-44 sm:w-56 lg:w-64 shrink-0 overflow-hidden bg-zinc-800">
          {album.cover_url ? (
            <Image
              src={album.cover_url}
              alt={`${album.title} cover`}
              fill
              sizes="256px"
              priority={priority}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <MusicIcon className="w-16 h-16 text-zinc-700" />
            </div>
          )}
          {/* Right-edge fade into content area */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-zinc-900 opacity-80" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col justify-between p-6 sm:p-8 min-w-0">
          {/* Top: rank + source count */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs font-bold text-[#E8FF3A] tracking-widest"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {rankStr}
            </span>
            <span className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
              {sourceCount} fonte{sourceCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Title block */}
          <div className="flex-1 flex flex-col justify-center py-4 min-w-0">
            <p className="relative z-10 text-xs font-medium text-zinc-500 uppercase tracking-widest truncate mb-1">
              <Link
                href={`/artists/${album.artistSlug}`}
                className="hover:text-[#E8FF3A] transition-colors"
              >
                {album.artistName}
              </Link>
            </p>
            <h3
              className="text-2xl sm:text-3xl lg:text-4xl font-normal text-zinc-50 leading-tight group-hover:text-white transition-colors line-clamp-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {album.title}
            </h3>
            {album.release_date && (
              <span
                className="text-xs text-zinc-600 mt-1 block"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {album.release_date.slice(0, 4)}
              </span>
            )}
          </div>

          {/* Bottom: score + labeled source bars */}
          <div className="flex items-end gap-4">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center text-2xl sm:text-3xl font-bold score-badge ${scoreColor(score)}`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {score !== null ? Math.round(score) : '—'}
            </div>

            {album.scores.length > 0 && (
              <div className="flex-1 flex flex-col gap-1.5 pb-1 min-w-0">
                {bars.map(({ src, pct, hasData }) => (
                  <div key={src} className="flex items-center gap-2">
                    <span
                      className="text-[10px] text-zinc-600 shrink-0 w-20 truncate"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {SRC_LABELS[src] ?? src}
                    </span>
                    <div className="flex-1 h-1.5 bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full score-bar-fill ${barColor(pct, hasData)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className="text-[10px] text-zinc-700 w-5 text-right"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {hasData ? Math.round(pct) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Featured variant (#2–3) ─────────────────────────────────────────────────
  if (variant === 'featured') {
    return (
      <div className="group relative flex flex-col bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all duration-300 overflow-hidden">
        <Link
          href={`/albums/${album.artistSlug}/${album.slug}`}
          className="absolute inset-0 z-0"
          aria-label={`${album.title} por ${album.artistName}`}
        />

        <div
          className="absolute top-3 left-3 z-10 text-xs font-bold tracking-widest leading-none select-none text-zinc-400"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {rankStr}
        </div>

        <div
          className={`absolute top-3 right-3 z-10 w-12 h-12 flex items-center justify-center text-base font-bold border score-badge ${scoreColor(score)}`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {score !== null ? Math.round(score) : '—'}
        </div>

        <div className="relative aspect-[4/3] bg-zinc-800 overflow-hidden">
          {album.cover_url ? (
            <Image
              src={album.cover_url}
              alt={`${album.title} cover`}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              priority={priority}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <MusicIcon className="w-12 h-12 text-zinc-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-60" />
        </div>

        <div className="p-4 flex flex-col gap-1.5 flex-1">
          <p className="relative z-10 text-xs font-medium text-zinc-500 uppercase tracking-widest truncate">
            <Link
              href={`/artists/${album.artistSlug}`}
              className="hover:text-[#E8FF3A] transition-colors"
            >
              {album.artistName}
            </Link>
          </p>
          <h3
            className="text-lg font-medium text-zinc-100 leading-snug line-clamp-2 group-hover:text-white transition-colors"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {album.title}
          </h3>
          <div className="mt-auto flex items-center justify-between pt-2">
            {album.release_date && (
              <span className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                {album.release_date.slice(0, 4)}
              </span>
            )}
            <span className="text-xs text-zinc-600 ml-auto" style={{ fontFamily: 'var(--font-mono)' }}>
              {sourceCount} src
            </span>
          </div>
        </div>

        {album.scores.length > 0 && (
          <div className="px-4 pb-4 flex gap-1">
            {bars.map(({ src, pct, hasData }) => (
              <div
                key={src}
                className="flex-1 h-1.5 bg-zinc-800 overflow-hidden"
                title={`${src}: ${hasData ? Math.round(pct) : '—'}`}
              >
                <div
                  className={`h-full score-bar-fill ${barColor(pct, hasData)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Standard variant (default, #4+) ────────────────────────────────────────
  return (
    <div className="group relative flex flex-col bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all duration-300 overflow-hidden">
      <Link
        href={`/albums/${album.artistSlug}/${album.slug}`}
        className="absolute inset-0 z-0"
        aria-label={`${album.title} by ${album.artistName}`}
      />

      <div
        className="absolute top-3 left-3 z-10 text-xs font-bold leading-none select-none tracking-widest text-zinc-700"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {rankStr}
      </div>

      <div
        className={`absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center text-sm font-bold border score-badge ${scoreColor(score)}`}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {score !== null ? Math.round(score) : '—'}
      </div>

      <div className="relative aspect-square bg-zinc-800 overflow-hidden">
        {album.cover_url ? (
          <Image
            src={album.cover_url}
            alt={`${album.title} cover`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MusicIcon className="w-12 h-12 text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-60" />
      </div>

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <p className="relative z-10 text-xs font-medium text-zinc-500 uppercase tracking-widest truncate">
          <Link
            href={`/artists/${album.artistSlug}`}
            className="hover:text-[#E8FF3A] transition-colors"
          >
            {album.artistName}
          </Link>
        </p>
        <h3
          className="text-base font-medium text-zinc-100 leading-snug line-clamp-2 group-hover:text-white transition-colors"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {album.title}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          {album.release_date && (
            <span className="text-xs text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
              {album.release_date.slice(0, 4)}
            </span>
          )}
          <span className="text-xs text-zinc-600 ml-auto" style={{ fontFamily: 'var(--font-mono)' }}>
            {sourceCount} src
          </span>
        </div>
      </div>

      {album.scores.length > 0 && (
        <div className="px-4 pb-4 flex gap-1">
          {bars.map(({ src, pct, hasData }) => (
            <div
              key={src}
              className="flex-1 h-1.5 bg-zinc-800 overflow-hidden"
              title={`${src}: ${hasData ? Math.round(pct) : '—'}`}
            >
              <div
                className={`h-full score-bar-fill ${barColor(pct, hasData)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
