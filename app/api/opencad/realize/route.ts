import { NextResponse } from 'next/server';
import { realizeCameraMount } from '@/lib/opencad-client.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = await request.json() as { heightMm?: number; clearanceMm?: number; fromRevision?: string; toRevision?: string };
    const heightMm = Number(input.heightMm);
    const clearanceMm = Number(input.clearanceMm);
    if (!Number.isFinite(heightMm) || heightMm < 85 || heightMm > 120) {
      return NextResponse.json({ error: 'Height must be between 85 mm and 120 mm.' }, { status: 400 });
    }
    if (!Number.isFinite(clearanceMm) || clearanceMm < 0 || clearanceMm > 20) {
      return NextResponse.json({ error: 'Clearance must be between 0 mm and 20 mm.' }, { status: 400 });
    }
    const result = await realizeCameraMount({
      heightMm,
      clearanceMm,
      fromRevision: input.fromRevision || 'Rev C',
      toRevision: input.toRevision || 'Rev D',
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'OpenCAD realization failed.' }, { status: 503 });
  }
}
