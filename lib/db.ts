import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'cache.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image_url TEXT,
      bio TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id),
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      release_date TEXT,
      cover_url TEXT,
      tracklist TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(artist_id, slug)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL REFERENCES albums(id),
      source TEXT NOT NULL,
      score REAL,
      max_score REAL DEFAULT 100,
      review_count INTEGER DEFAULT 0,
      source_url TEXT,
      scraped_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(album_id, source)
    );

    CREATE TABLE IF NOT EXISTS popularity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL REFERENCES albums(id),
      deezer_fans INTEGER,
      lastfm_listeners INTEGER,
      lastfm_playcount INTEGER,
      wikipedia_views INTEGER,
      scraped_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(album_id)
    );

    CREATE TABLE IF NOT EXISTS refresh_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      ran_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Migrations — safe to run repeatedly
  const artistCols = (db.prepare(`PRAGMA table_info(artists)`).all() as { name: string }[]).map((c) => c.name);
  if (!artistCols.includes('genres')) {
    db.exec(`ALTER TABLE artists ADD COLUMN genres TEXT DEFAULT '[]'`);
  }

  const albumCols2 = (db.prepare(`PRAGMA table_info(albums)`).all() as { name: string }[]).map((c) => c.name);
  if (!albumCols2.includes('genres')) {
    db.exec(`ALTER TABLE albums ADD COLUMN genres TEXT DEFAULT '[]'`);
  }

  const scoreCols = (db.prepare(`PRAGMA table_info(scores)`).all() as { name: string }[]).map((c) => c.name);
  if (!scoreCols.includes('source_url')) {
    db.exec(`ALTER TABLE scores ADD COLUMN source_url TEXT`);
  }

  const popCols = (db.prepare(`PRAGMA table_info(popularity)`).all() as { name: string }[]).map((c) => c.name);
  if (popCols.includes('spotify_popularity') && !popCols.includes('deezer_fans')) {
    db.exec(`ALTER TABLE popularity RENAME COLUMN spotify_popularity TO deezer_fans`);
  }
  if (!popCols.includes('wikipedia_views')) {
    db.exec(`ALTER TABLE popularity ADD COLUMN wikipedia_views INTEGER`);
  }
  if (!popCols.includes('wikipedia_article')) {
    db.exec(`ALTER TABLE popularity ADD COLUMN wikipedia_article TEXT`);
  }
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Artist {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  bio: string | null;
  genres: string[];
  created_at: number;
  updated_at: number;
}

export interface Album {
  id: number;
  artist_id: number;
  title: string;
  slug: string;
  release_date: string | null;
  cover_url: string | null;
  tracklist: string[];
  genres: string[];
  created_at: number;
  updated_at: number;
}

export interface Score {
  id: number;
  album_id: number;
  source: string;
  score: number | null;
  max_score: number;
  review_count: number;
  source_url: string | null;
  scraped_at: number;
}

export interface AlbumWithScores extends Album {
  artistName: string;
  artistSlug: string;
  scores: Score[];
  aggregateScore: number | null;
  popularity: PopularityData | null;
}

export interface PopularityData {
  id: number;
  album_id: number;
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  lastfm_playcount: number | null;
  wikipedia_views: number | null;
  wikipedia_article: string | null;
  scraped_at: number;
}

// ─── Score weights ────────────────────────────────────────────────────────────

const SOURCE_WEIGHTS: Record<string, number> = {
  discogs: 0.35,
  theaudiodb: 0.25,
  rateyourmusic: 0.15,
  critiquebrainz: 0.10,
};

const POPULARITY_WEIGHT = 0.15;

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

function computeAggregateScore(scores: Score[], popularity: PopularityData | null): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of scores) {
    if (s.score === null) continue;
    const weight = SOURCE_WEIGHTS[s.source] ?? 0;
    if (weight === 0) continue;
    const normalized = (s.score / s.max_score) * 100;
    weightedSum += normalized * weight;
    totalWeight += weight;
  }

  const popScore = normalizePopularity(popularity);
  if (popScore !== null) {
    weightedSum += popScore * POPULARITY_WEIGHT;
    totalWeight += POPULARITY_WEIGHT;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

// ─── Raw DB row types ─────────────────────────────────────────────────────────

interface AlbumRow {
  id: number;
  artist_id: number;
  title: string;
  slug: string;
  release_date: string | null;
  cover_url: string | null;
  tracklist: string;
  genres: string;
  created_at: number;
  updated_at: number;
}

interface AlbumWithArtistRow extends AlbumRow {
  artist_name: string;
  artist_slug: string;
}

interface ScoreRow {
  id: number;
  album_id: number;
  source: string;
  score: number | null;
  max_score: number;
  review_count: number;
  source_url: string | null;
  scraped_at: number;
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fallback; }
}

function parseAlbumRow(row: AlbumRow): Album {
  return {
    ...row,
    tracklist: parseJson<string[]>(row.tracklist, []),
    genres: parseJson<string[]>(row.genres, []),
  };
}

function buildAlbumWithScores(
  row: AlbumWithArtistRow,
  scores: Score[],
  popularity: PopularityData | null
): AlbumWithScores {
  const album = parseAlbumRow(row);
  return {
    ...album,
    artistName: row.artist_name,
    artistSlug: row.artist_slug,
    scores,
    aggregateScore: computeAggregateScore(scores, popularity),
    popularity,
  };
}

// ─── Exported functions ───────────────────────────────────────────────────────

function parseArtistRow(row: Artist & { genres: string }): Artist {
  return { ...row, genres: parseJson<string[]>((row as unknown as { genres: string }).genres, []) };
}

export function upsertArtist(
  name: string,
  slug: string,
  imageUrl?: string,
  bio?: string,
  genres?: string[]
): Artist {
  const db = getDb();
  const genresJson = JSON.stringify(genres ?? []);
  db.prepare(`
    INSERT INTO artists (name, slug, image_url, bio, genres, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      image_url = COALESCE(excluded.image_url, image_url),
      bio = COALESCE(excluded.bio, bio),
      genres = CASE WHEN excluded.genres = '[]' THEN genres ELSE excluded.genres END,
      updated_at = unixepoch()
  `).run(name, slug, imageUrl ?? null, bio ?? null, genresJson);

  return parseArtistRow(db.prepare('SELECT * FROM artists WHERE slug = ?').get(slug) as Artist & { genres: string });
}

export function upsertAlbum(
  artistId: number,
  title: string,
  slug: string,
  releaseDate?: string,
  coverUrl?: string,
  tracklist?: string[],
  genres?: string[]
): Album {
  const db = getDb();
  const tracklistJson = JSON.stringify(tracklist ?? []);
  const genresJson = JSON.stringify(genres ?? []);

  db.prepare(`
    INSERT INTO albums (artist_id, title, slug, release_date, cover_url, tracklist, genres, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(artist_id, slug) DO UPDATE SET
      title = excluded.title,
      release_date = COALESCE(excluded.release_date, release_date),
      cover_url = COALESCE(excluded.cover_url, cover_url),
      tracklist = CASE WHEN excluded.tracklist = '[]' THEN tracklist ELSE excluded.tracklist END,
      genres = CASE WHEN excluded.genres = '[]' THEN genres ELSE excluded.genres END,
      updated_at = unixepoch()
  `).run(artistId, title, slug, releaseDate ?? null, coverUrl ?? null, tracklistJson, genresJson);

  const row = db
    .prepare('SELECT * FROM albums WHERE artist_id = ? AND slug = ?')
    .get(artistId, slug) as AlbumRow;

  return parseAlbumRow(row);
}

export function upsertScore(
  albumId: number,
  source: string,
  score: number,
  maxScore: number,
  reviewCount: number,
  sourceUrl?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO scores (album_id, source, score, max_score, review_count, source_url, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(album_id, source) DO UPDATE SET
      score = excluded.score,
      max_score = excluded.max_score,
      review_count = excluded.review_count,
      source_url = COALESCE(excluded.source_url, source_url),
      scraped_at = unixepoch()
  `).run(albumId, source, score, maxScore, reviewCount, sourceUrl ?? null);
}

export function getArtistBySlug(slug: string): Artist | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM artists WHERE slug = ?').get(slug) as (Artist & { genres: string }) | undefined;
  if (!row) return undefined;
  return parseArtistRow(row);
}

export interface ArtistPopularityContext {
  maxDeezer: number | null;
  maxListeners: number | null;
  totalAlbums: number;
  deezerRank: number | null;
  listenersRank: number | null;
}

export function getArtistPopularityContext(
  artistId: number,
  albumId: number
): ArtistPopularityContext {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.album_id, p.deezer_fans, p.lastfm_listeners
    FROM popularity p
    JOIN albums a ON a.id = p.album_id
    WHERE a.artist_id = ?
  `).all(artistId) as { album_id: number; deezer_fans: number | null; lastfm_listeners: number | null }[];

  if (!rows.length) return { maxDeezer: null, maxListeners: null, totalAlbums: 0, deezerRank: null, listenersRank: null };

  const deezerVals = rows.filter((r) => r.deezer_fans != null).sort((a, b) => (b.deezer_fans ?? 0) - (a.deezer_fans ?? 0));
  const listenersVals = rows.filter((r) => r.lastfm_listeners != null).sort((a, b) => (b.lastfm_listeners ?? 0) - (a.lastfm_listeners ?? 0));

  const deezerRank = deezerVals.findIndex((r) => r.album_id === albumId);
  const listenersRank = listenersVals.findIndex((r) => r.album_id === albumId);

  return {
    maxDeezer: deezerVals[0]?.deezer_fans ?? null,
    maxListeners: listenersVals[0]?.lastfm_listeners ?? null,
    totalAlbums: rows.length,
    deezerRank: deezerRank >= 0 ? deezerRank + 1 : null,
    listenersRank: listenersRank >= 0 ? listenersRank + 1 : null,
  };
}

function getPopularity(albumId: number): PopularityData | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM popularity WHERE album_id = ?').get(albumId) as PopularityData | undefined) ?? null;
}

export function upsertPopularity(
  albumId: number,
  deezerFans: number | null,
  lastfmListeners: number | null,
  lastfmPlaycount: number | null,
  wikipediaViews: number | null = null,
  wikipediaArticle: string | null = null
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO popularity (album_id, deezer_fans, lastfm_listeners, lastfm_playcount, wikipedia_views, wikipedia_article, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(album_id) DO UPDATE SET
      deezer_fans = COALESCE(excluded.deezer_fans, deezer_fans),
      lastfm_listeners = COALESCE(excluded.lastfm_listeners, lastfm_listeners),
      lastfm_playcount = COALESCE(excluded.lastfm_playcount, lastfm_playcount),
      wikipedia_views = COALESCE(excluded.wikipedia_views, wikipedia_views),
      wikipedia_article = COALESCE(excluded.wikipedia_article, wikipedia_article),
      scraped_at = unixepoch()
  `).run(albumId, deezerFans, lastfmListeners, lastfmPlaycount, wikipediaViews, wikipediaArticle);
}

export function getAlbumsByArtist(artistId: number): AlbumWithScores[] {
  const db = getDb();
  const albumRows = db
    .prepare(`
      SELECT al.*, ar.name as artist_name, ar.slug as artist_slug
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      WHERE al.artist_id = ?
      ORDER BY al.release_date DESC
    `)
    .all(artistId) as AlbumWithArtistRow[];

  return albumRows.map((row) => {
    const scores = db.prepare('SELECT * FROM scores WHERE album_id = ?').all(row.id) as ScoreRow[];
    return buildAlbumWithScores(row, scores, getPopularity(row.id));
  });
}

export function getAlbumWithScores(
  artistSlug: string,
  albumSlug: string
): AlbumWithScores | undefined {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT al.*, ar.name as artist_name, ar.slug as artist_slug
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      WHERE ar.slug = ? AND al.slug = ?
    `)
    .get(artistSlug, albumSlug) as AlbumWithArtistRow | undefined;

  if (!row) return undefined;

  const scores = db.prepare('SELECT * FROM scores WHERE album_id = ?').all(row.id) as ScoreRow[];
  return buildAlbumWithScores(row, scores, getPopularity(row.id));
}

export function getTopAlbums(limit: number): AlbumWithScores[] {
  const db = getDb();
  const albumRows = db
    .prepare(`
      SELECT al.*, ar.name as artist_name, ar.slug as artist_slug
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      ORDER BY al.created_at DESC
      LIMIT ?
    `)
    .all(limit) as AlbumWithArtistRow[];

  const results: AlbumWithScores[] = albumRows.map((row) => {
    const scores = db.prepare('SELECT * FROM scores WHERE album_id = ?').all(row.id) as ScoreRow[];
    return buildAlbumWithScores(row, scores, getPopularity(row.id));
  });

  return results.sort((a, b) => {
    if (a.aggregateScore === null && b.aggregateScore === null) return 0;
    if (a.aggregateScore === null) return 1;
    if (b.aggregateScore === null) return -1;
    return b.aggregateScore - a.aggregateScore;
  });
}

export function clearArtistAlbums(artistId: number): void {
  const db = getDb();
  const albumIds = (db.prepare('SELECT id FROM albums WHERE artist_id = ?').all(artistId) as { id: number }[]).map((r) => r.id);
  if (!albumIds.length) return;
  const placeholders = albumIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM scores WHERE album_id IN (${placeholders})`).run(...albumIds);
  db.prepare(`DELETE FROM popularity WHERE album_id IN (${placeholders})`).run(...albumIds);
  db.prepare('DELETE FROM albums WHERE artist_id = ?').run(artistId);
}

export function logRefresh(
  artistSlug: string,
  status: string,
  message?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO refresh_log (artist_slug, status, message)
    VALUES (?, ?, ?)
  `).run(artistSlug, status, message ?? null);
}

export function searchArtists(query: string): Artist[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM artists WHERE name LIKE ? LIMIT 10").all(`%${query}%`) as (Artist & { genres: string })[];
  return rows.map(parseArtistRow);
}

export function searchAlbums(query: string): AlbumWithScores[] {
  const db = getDb();
  const albumRows = db
    .prepare(`
      SELECT al.*, ar.name as artist_name, ar.slug as artist_slug
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      WHERE al.title LIKE ?
      LIMIT 10
    `)
    .all(`%${query}%`) as AlbumWithArtistRow[];

  return albumRows.map((row) => {
    const scores = db
      .prepare('SELECT * FROM scores WHERE album_id = ?')
      .all(row.id) as ScoreRow[];
    return buildAlbumWithScores(row, scores, getPopularity(row.id));
  });
}

export function getAllArtistSlugs(): { slug: string }[] {
  const db = getDb();
  return db.prepare('SELECT slug FROM artists').all() as { slug: string }[];
}

export function getAllAlbumSlugs(): { artistSlug: string; albumSlug: string }[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT ar.slug as artistSlug, al.slug as albumSlug
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
    `)
    .all() as { artistSlug: string; albumSlug: string }[];
}
