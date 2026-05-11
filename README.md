# ScoreStack — Music Album Score Aggregator

Aggregated critic scores for music albums, pulling from Last.fm, Album of the Year, Metacritic, and Pitchfork into a single weighted score.

## Setup

### 1. Clone / Download

```bash
git clone <repo-url>
cd test-site
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

- `LASTFM_API_KEY` — Get a free API key at [last.fm/api](https://www.last.fm/api/account/create)
- `REFRESH_SECRET` — Choose any secret string to protect the refresh endpoint

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Seed data

The database starts empty. Use the refresh API to populate it.

**Seed all top artists** (Taylor Swift, Kendrick Lamar, Beyoncé, The Beatles, Radiohead):

```bash
curl -X POST http://localhost:3000/api/refresh \
  -H "Content-Type: application/json" \
  -d '{"secret": "your_secret_token_here"}'
```

**Seed a specific artist:**

```bash
curl -X POST http://localhost:3000/api/refresh \
  -H "Content-Type: application/json" \
  -d '{"secret": "your_secret_token_here", "artist": "Taylor Swift"}'
```

> Note: Seeding respects rate limits across all scrapers and may take several minutes per artist.

### 6. Browse

- Homepage: [http://localhost:3000](http://localhost:3000) — Top ranked albums grid
- Artist page: `http://localhost:3000/artists/{artist-slug}`
- Album page: `http://localhost:3000/albums/{artist-slug}/{album-slug}`

## Score Weights

| Source            | Weight |
|-------------------|--------|
| Album of the Year | 35%    |
| Metacritic        | 30%    |
| Last.fm           | 20%    |
| Pitchfork         | 15%    |

## Architecture

- **Next.js 15** App Router with Server Components
- **SQLite** via `better-sqlite3` for local caching
- **Scrapers** for Last.fm (official API), Album of the Year, Metacritic, Pitchfork
- **No client-side data fetching** — all pages are server-rendered

## Project Structure

```
lib/
  db.ts              # SQLite database layer
  slugify.ts         # URL slug utilities
  refresh.ts         # Refresh orchestrator
  scrapers/
    lastfm.ts        # Last.fm API scraper
    albumoftheyear.ts
    metacritic.ts
    pitchfork.ts
app/
  layout.tsx         # Root layout with header/footer
  page.tsx           # Homepage — top albums grid
  artists/[slug]/
    page.tsx         # Artist page — album list
  albums/[artist]/[album]/
    page.tsx         # Album page — score breakdown
  api/
    refresh/route.ts # POST /api/refresh
    search/route.ts  # GET /api/search?q=
components/
  SearchBar.tsx      # Client-side search with keyboard nav
```
