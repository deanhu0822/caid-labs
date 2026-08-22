import { NextResponse } from 'next/server';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'An engineering document is required.' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Document must be smaller than 25 MB.' }, { status: 413 });
  const mimeType = file.type || 'application/octet-stream';
  const supported = mimeType === 'application/pdf' || mimeType.startsWith('image/');
  if (!supported) return NextResponse.json({ error: 'Live parsing currently supports PDF and image documents.' }, { status: 415 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await formaInferenceProvider.parseDocument({
    sourceId: String(form?.get('sourceId') || `document-${Date.now()}`).slice(0, 200),
    name: file.name,
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
  });
  return NextResponse.json(result);
}
