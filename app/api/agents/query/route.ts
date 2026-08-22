import { queryAgent } from '@/lib/agent-engine';
import type { AgentKind } from '@/lib/corpus-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENTS = new Set<AgentKind>(['builder', 'product', 'supply']);

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') return Response.json({ error: 'Request body is required.' }, { status: 400 });
  const { agent, question } = payload as { agent?: AgentKind; question?: string };
  if (!agent || !AGENTS.has(agent)) return Response.json({ error: 'agent must be builder, product, or supply.' }, { status: 400 });
  if (typeof question !== 'string' || !question.trim()) return Response.json({ error: 'question is required.' }, { status: 400 });
  if (question.length > 1000) return Response.json({ error: 'question must be 1000 characters or fewer.' }, { status: 400 });

  try {
    return Response.json(await queryAgent(agent, question.trim()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Agent query failed.' }, { status: 500 });
  }
}
