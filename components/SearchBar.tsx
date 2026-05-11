'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Artist, AlbumWithScores } from '@/lib/db';

interface SearchResults {
  artists: Artist[];
  albums: AlbumWithScores[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const debouncedQuery = useDebounce(query, 300);

  // Fetch search results
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => res.json())
      .then((data: SearchResults) => {
        if (!cancelled) {
          setResults(data);
          setOpen(true);
          setActiveIndex(-1);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build flat list of navigable items
  const items: Array<{ type: 'artist'; slug: string; label: string } | { type: 'album'; artistSlug: string; albumSlug: string; label: string; sub: string }> =
    [];

  if (results) {
    for (const artist of results.artists) {
      items.push({ type: 'artist', slug: artist.slug, label: artist.name });
    }
    for (const album of results.albums) {
      items.push({
        type: 'album',
        artistSlug: album.artistSlug,
        albumSlug: album.slug,
        label: album.title,
        sub: album.artistName,
      });
    }
  }

  const navigateTo = useCallback(
    (item: (typeof items)[number]) => {
      if (item.type === 'artist') {
        router.push(`/artists/${item.slug}`);
      } else {
        router.push(`/albums/${item.artistSlug}/${item.albumSlug}`);
      }
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        navigateTo(items[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const hasResults = items.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative flex items-center">
        {/* Search icon */}
        <svg
          className="absolute left-3 w-3.5 h-3.5 text-zinc-600 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results && items.length > 0) setOpen(true);
          }}
          placeholder="Buscar artistas e álbuns…"
          className="w-full h-9 pl-9 pr-9 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 focus:outline-none text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors"
          style={{ fontFamily: 'var(--font-body)' }}
          autoComplete="off"
          spellCheck={false}
          aria-label="Buscar artistas e álbuns"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />

        {/* Loading spinner / clear */}
        <div className="absolute right-3 flex items-center">
          {loading ? (
            <svg
              className="w-3.5 h-3.5 text-[#E8FF3A] animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : query ? (
            <button
              onClick={() => {
                setQuery('');
                setResults(null);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
              aria-label="Limpar busca"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 shadow-2xl max-h-80 overflow-y-auto"
          role="listbox"
        >
          {!hasResults ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {results && results.artists.length > 0 && (
                <div>
                  <div
                    className="px-3 py-1.5 text-xs font-bold tracking-widest text-zinc-600 uppercase border-b border-zinc-800"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    Artistas
                  </div>
                  {results.artists.map((artist) => {
                    const idx = items.findIndex(
                      (it) => it.type === 'artist' && it.slug === artist.slug
                    );
                    return (
                      <button
                        key={artist.id}
                        role="option"
                        aria-selected={activeIndex === idx}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          activeIndex === idx
                            ? 'bg-zinc-800 text-[#E8FF3A]'
                            : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                        }`}
                        onClick={() => navigateTo(items[idx])}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <svg
                          className="w-3.5 h-3.5 text-zinc-600 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        <span>{artist.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {results && results.albums.length > 0 && (
                <div>
                  <div
                    className={`px-3 py-1.5 text-xs font-bold tracking-widest text-zinc-600 uppercase border-b border-zinc-800 ${
                      results.artists.length > 0 ? 'border-t border-zinc-800' : ''
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    Álbuns
                  </div>
                  {results.albums.map((album) => {
                    const idx = items.findIndex(
                      (it) =>
                        it.type === 'album' &&
                        it.albumSlug === album.slug &&
                        it.artistSlug === album.artistSlug
                    );
                    return (
                      <button
                        key={album.id}
                        role="option"
                        aria-selected={activeIndex === idx}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          activeIndex === idx
                            ? 'bg-zinc-800 text-[#E8FF3A]'
                            : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                        }`}
                        onClick={() => navigateTo(items[idx])}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <svg
                          className="w-3.5 h-3.5 text-zinc-600 shrink-0"
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
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{album.title}</span>
                          <span className="text-xs text-zinc-600 truncate">
                            {album.artistName}
                            {album.aggregateScore !== null && (
                              <span
                                className="ml-2 text-[#E8FF3A]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {Math.round(album.aggregateScore)}
                              </span>
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
