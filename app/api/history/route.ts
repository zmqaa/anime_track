import { NextResponse } from 'next/server';
import { getWatchHistory, getWatchHistorySince } from '@/lib/history';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '2000'); // Default high limit for charts
  const days = Number(searchParams.get('days') ?? '');
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 10000) : 2000;

  let entries;
  if (Number.isFinite(days) && days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    entries = await getWatchHistorySince(since, safeLimit);
  } else {
    entries = await getWatchHistory(safeLimit);
  }
  return NextResponse.json({ ok: true, entries });
}
