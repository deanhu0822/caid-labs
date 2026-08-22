import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get('probe') === '1';
  const status = formaInferenceProvider.checkHealth
    ? await formaInferenceProvider.checkHealth({ probe })
    : formaInferenceProvider.getStatus();
  return NextResponse.json(status);
}
