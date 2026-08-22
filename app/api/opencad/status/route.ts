import { NextResponse } from 'next/server';
import { getOpenCadStatus } from '@/lib/opencad-client.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getOpenCadStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
