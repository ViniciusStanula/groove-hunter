import type { Metadata } from 'next';
import { DM_Serif_Display, Space_Mono, DM_Sans } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';

const dmSerifDisplay = DM_Serif_Display({
  weight: ['400'],
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const dmSans = DM_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ScoreStack — Agregador de Notas de Álbuns',
    template: '%s | ScoreStack',
  },
  description:
    'Notas agregadas da crítica para álbuns de música a partir do Last.fm, MusicBrainz, CritiqueBrainz e Discogs.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSerifDisplay.variable} ${spaceMono.variable} ${dmSans.variable} h-full`}
    >
      <head>
        {/* Preconnect to image CDNs to eliminate connection setup latency */}
        <link rel="preconnect" href="https://lastfm.freetls.fastly.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://lastfm.freetls.fastly.net" />
        <link rel="preconnect" href="https://coverartarchive.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://coverartarchive.org" />
        <link rel="preconnect" href="https://i.scdn.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://i.scdn.co" />
      </head>
      <body className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 antialiased">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 gap-6">
              {/* Logo */}
              <Link
                href="/"
                className="flex items-baseline gap-2 shrink-0 group"
              >
                <span
                  className="text-2xl leading-none font-bold tracking-tighter"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <span className="text-[#E8FF3A]">S</span>
                  <span className="text-zinc-100 group-hover:text-[#E8FF3A] transition-colors duration-200">
                    CORE
                  </span>
                </span>
                <span
                  className="text-2xl leading-none font-bold tracking-tighter text-zinc-400 group-hover:text-zinc-200 transition-colors duration-200"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  STACK
                </span>
              </Link>

              {/* Search bar — center */}
              <div className="flex-1 max-w-xl">
                <SearchBar />
              </div>

              {/* Nav */}
              <nav className="hidden md:flex items-center gap-1 shrink-0">
                <Link
                  href="/"
                  className="px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-[#E8FF3A] transition-colors duration-200"
                >
                  Início
                </Link>
                <span className="text-zinc-700 select-none">·</span>
                <a
                  href="#"
                  className="px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-[#E8FF3A] transition-colors duration-200"
                >
                  Paradas
                </a>
              </nav>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col">{children}</main>

        {/* Footer */}
        <footer className="border-t border-zinc-800 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <p
                  className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Fontes de Dados
                </p>
                <p className="text-sm text-zinc-400">
                  Dados de{' '}
                  <a
                    href="https://www.last.fm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-[#E8FF3A] transition-colors"
                  >
                    Last.fm
                  </a>
                  ,{' '}
                  <a
                    href="https://musicbrainz.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-[#E8FF3A] transition-colors"
                  >
                    MusicBrainz
                  </a>
                  ,{' '}
                  <a
                    href="https://critiquebrainz.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-[#E8FF3A] transition-colors"
                  >
                    CritiqueBrainz
                  </a>
                  ,{' '}
                  <a
                    href="https://www.discogs.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-[#E8FF3A] transition-colors"
                  >
                    Discogs
                  </a>
                  ,{' '}
                  <a
                    href="https://www.theaudiodb.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-[#E8FF3A] transition-colors"
                  >
                    TheAudioDB
                  </a>
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-xs text-zinc-600"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  SCORESTACK © {new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
