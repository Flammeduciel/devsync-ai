import { NextResponse } from 'next/server';
import { handler } from '@/server/http/respond';
import { db } from '@/server/infrastructure/database';
import { redis } from '@/server/infrastructure/redis';
import { ensureBucket } from '@/server/infrastructure/storage';
import { checkHealth } from '@/server/services/health.service';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const report = await checkHealth({
    database: () => db().$queryRaw`SELECT 1`,
    redis: () => redis().ping(),
    storage: () => ensureBucket(),
  });
  return NextResponse.json(report, { status: report.status === 'ok' ? 200 : 503 });
});
