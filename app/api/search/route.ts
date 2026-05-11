import { NextRequest, NextResponse } from 'next/server';
import { searchArtists, searchAlbums } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q || q.length < 1) {
    return NextResponse.json({ artists: [], albums: [] });
  }

  try {
    const artists = searchArtists(q);
    const albums = searchAlbums(q);
    return NextResponse.json({ artists, albums });
  } catch (err) {
    console.error('[api/search] Error:', err);
    return NextResponse.json(
      { artists: [], albums: [], error: 'Search failed' },
      { status: 500 }
    );
  }
}
