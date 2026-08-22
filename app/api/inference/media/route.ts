import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A photo or video file is required.' }, { status: 400 });
  const analysisKind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!analysisKind) return NextResponse.json({ error: 'Only image and video inputs are supported.' }, { status: 415 });
  const declaredKind = String(form?.get('sourceKind') || '');
  const sourceKind = declaredKind === 'video' || declaredKind === 'image' ? declaredKind : analysisKind;
  const sourceSizeBytes = Number(form?.get('sourceSizeBytes') || file.size);
  const maxBytes = sourceKind === 'video' ? 60 * 1024 * 1024 : 20 * 1024 * 1024;
  if (!Number.isFinite(sourceSizeBytes) || sourceSizeBytes < 0 || sourceSizeBytes > maxBytes) {
    return NextResponse.json({ error: `${sourceKind === 'video' ? 'Video' : 'Image'} input is too large for hosted analysis.` }, { status: 413 });
  }
  const candidates = String(form?.get('candidates') || '').slice(0, 8_000);
  const sourceName = String(form?.get('sourceName') || file.name).slice(0, 300);
  const sourceMimeType = String(form?.get('sourceMimeType') || file.type).slice(0, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await formaInferenceProvider.observeMedia({
    sourceId: `scanner-${Date.now()}`,
    kind: analysisKind,
    name: sourceName,
    mimeType: file.type,
    dataUrl: `data:${file.type};base64,${bytes.toString('base64')}`,
    context: [
      sourceKind === 'video' ? 'This image is a four-frame contact sheet sampled across the uploaded video timeline.' : '',
      candidates ? `Match the visible hardware to one candidate: ${candidates}` : 'Identify the visible engineering hardware and its physical condition.',
    ].filter(Boolean).join(' '),
  });
  return NextResponse.json({
    ...result,
    sourceKind,
    sourceName,
    sourceMimeType,
    sourceSizeBytes,
    analysisInputKind: analysisKind,
    sampledVideoFrames: sourceKind === 'video' && analysisKind === 'image',
  });
}
