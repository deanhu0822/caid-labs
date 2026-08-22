import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ReasonRequest = {
  objective?: unknown;
  engineeringState?: unknown;
  featureContract?: unknown;
  fallback?: unknown;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1_000_000) return NextResponse.json({ error: 'Reasoning request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => null) as ReasonRequest | null;
  if (!body || typeof body.objective !== 'string' || !body.objective.trim() || !body.fallback || typeof body.fallback !== 'object') {
    return NextResponse.json({ error: 'A non-empty objective and structured fallback are required.' }, { status: 400 });
  }
  const result = await formaInferenceProvider.reason({
    objective: body.objective.trim(),
    engineeringState: body.engineeringState,
    featureContract: body.featureContract,
    mockResult: body.fallback,
  });
  return NextResponse.json(result);
}
