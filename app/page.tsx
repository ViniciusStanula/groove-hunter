import { getTopAlbums } from '@/lib/db';
import { AlbumCard } from '@/components/AlbumCard';

export default async function HomePage() {
  const albums = await getTopAlbums(20);

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      {/* Page header */}
      <div className="mb-10 flex flex-col gap-2">
        <p
          className="text-xs font-bold tracking-widest text-[#E8FF3A] uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Aggregated Critic Scores
        </p>
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-normal text-zinc-50 leading-none tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Top Rated Albums
        </h1>
        <p className="text-zinc-400 max-w-lg text-sm mt-2">
          Weighted scores from TheAudioDB, Discogs and CritiqueBrainz — one number that cuts through the noise.
        </p>
      </div>

      {albums.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 border border-dashed border-zinc-800 p-12">
          <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-zinc-300 text-lg font-medium mb-2">No albums yet</p>
            <p className="text-zinc-500 text-sm max-w-sm">
              Populate the database by sending a{' '}
              <code className="text-[#E8FF3A] bg-zinc-900 px-1.5 py-0.5 text-xs rounded">
                POST
              </code>{' '}
              request to{' '}
              <code className="text-[#E8FF3A] bg-zinc-900 px-1.5 py-0.5 text-xs rounded">
                /api/refresh
              </code>{' '}
              with your secret token.
            </p>
          </div>
          <div className="mt-2 bg-zinc-900 border border-zinc-800 p-4 text-xs font-mono text-zinc-400 max-w-sm w-full">
            <p className="text-zinc-600 mb-1"># Index top artists</p>
            <p>
              curl -X POST /api/refresh \{' '}
              <br />
              &nbsp;&nbsp;-d{' '}
              <span className="text-amber-400">
                &apos;&#123;&quot;secret&quot;:&quot;your_secret&quot;&#125;&apos;
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* #1 — hero, full-width landscape */}
          <AlbumCard album={albums[0]} rank={1} variant="hero" priority />

          {/* #2–3 — featured, side by side */}
          {albums.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {albums.slice(1, 3).map((album, i) => (
                <AlbumCard key={album.id} album={album} rank={i + 2} variant="featured" priority />
              ))}
            </div>
          )}

          {/* #4+ — standard dense grid */}
          {albums.length > 3 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {albums.slice(3).map((album, i) => (
                <AlbumCard key={album.id} album={album} rank={i + 4} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Score legend */}
      <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-wrap gap-6 items-center">
        <p
          className="text-xs font-bold tracking-widest text-zinc-600 uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Score Scale
        </p>
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Excellent', range: '75–100', color: 'bg-[#E8FF3A]', text: 'text-zinc-900' },
            { label: 'Good', range: '50–74', color: 'bg-amber-400', text: 'text-zinc-900' },
            { label: 'Poor', range: '0–49', color: 'bg-red-600', text: 'text-zinc-100' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 inline-flex items-center justify-center text-xs font-bold ${item.color} ${item.text}`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                ●
              </span>
              <span className="text-xs text-zinc-500">
                {item.label}{' '}
                <span className="text-zinc-600" style={{ fontFamily: 'var(--font-mono)' }}>
                  {item.range}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
