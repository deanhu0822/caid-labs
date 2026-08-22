import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(formaInferenceProvider.getStatus());
}
