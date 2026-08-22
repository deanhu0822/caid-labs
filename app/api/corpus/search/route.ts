import { searchCorpus } from '@/lib/corpus';
import type { AgentKind } from '@/lib/corpus-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENTS = new Set<AgentKind>(['builder', 'product', 'supply']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const requestedAgent = url.searchParams.get('agent') as AgentKind | null;
  const limit = Number(url.searchParams.get('limit') ?? 8);
  if (!query) return Response.json({ error: 'Query parameter q is required.' }, { status: 400 });
  if (query.length > 500) return Response.json({ error: 'Query is too long.' }, { status: 400 });
  const agent = requestedAgent && AGENTS.has(requestedAgent) ? requestedAgent : undefined;
  const results = await searchCorpus(query, { agent, limit: Number.isFinite(limit) ? limit : 8 });
  return Response.json({ query, count: results.length, results });
}
