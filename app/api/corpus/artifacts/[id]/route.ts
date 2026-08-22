import { getArtifactRecord } from '@/lib/corpus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await getArtifactRecord(id);
  if (!record) return Response.json({ error: `Unknown artifact: ${id}` }, { status: 404 });
  return Response.json(record);
}
