import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { listAnimeRecords } from '@/lib/anime';

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: '只有管理员可以导出数据' }, { status: 403 });
  }

  const records = await listAnimeRecords();
  return NextResponse.json({ count: records.length, records });
}
