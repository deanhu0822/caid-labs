import { exportOpenCadShape } from '@/lib/opencad-client.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shapeId = url.searchParams.get('shapeId');
    const format = url.searchParams.get('format');
    if (!shapeId || (format !== 'step' && format !== 'stl')) {
      return Response.json({ error: 'A shapeId and step or stl format are required.' }, { status: 400 });
    }
    const upstream = await exportOpenCadShape(shapeId, format);
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || (format === 'step' ? 'model/step' : 'model/stl'),
        'Content-Disposition': upstream.headers.get('content-disposition') || `attachment; filename="rover-camera-mount.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'OpenCAD export failed.' }, { status: 503 });
  }
}
