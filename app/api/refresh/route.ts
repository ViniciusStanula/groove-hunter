import { NextRequest, NextResponse } from 'next/server';
import { refreshArtist, refreshTopArtists } from '@/lib/refresh';

export async function POST(req: NextRequest) {
  let body: { artist?: string; secret?: string };
  try {
    body = (await req.json()) as { artist?: string; secret?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const expectedSecret = process.env.REFRESH_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: 'REFRESH_SECRET not configured' }, { status: 500 });
  }
  if (!body.secret || body.secret !== expectedSecret) {
    return NextResponse.json({ ok: false, message: 'Invalid or missing secret' }, { status: 401 });
  }

  // Respond immediately — refresh runs in background
  const label = body.artist ? `artist: ${body.artist}` : 'all top artists';
  const work = body.artist ? refreshArtist(body.artist) : refreshTopArtists();
  work.catch((err) => console.error(`[api/refresh] Background refresh failed (${label}):`, err));

  return NextResponse.json({ ok: true, message: `Refresh started for ${label}` }, { status: 202 });
}
