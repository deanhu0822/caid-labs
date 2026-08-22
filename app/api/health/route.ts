import { getCorpusHealth } from '@/lib/corpus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getCorpusHealth(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Corpus backend failed to initialize.' }, { status: 500 });
  }
}
