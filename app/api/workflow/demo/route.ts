import { randomUUID } from 'node:crypto';
import { buildDemoWorkflowReceipt } from '@/lib/demo-workflow';
import { formaInferenceProvider } from '@/lib/forma-inference.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type WorkflowRequest = {
  objective?: unknown;
  approved?: unknown;
  runId?: unknown;
  createdAt?: unknown;
};

function safeRunId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 20_000) return Response.json({ error: 'Workflow request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as WorkflowRequest;
  const objective = typeof body.objective === 'string' ? body.objective.trim().slice(0, 500) : undefined;
  const approved = body.approved === true;
  const runId = safeRunId(body.runId) || randomUUID();
  const createdAt = typeof body.createdAt === 'string' && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : undefined;

  const baseline = buildDemoWorkflowReceipt({ runId, createdAt, objective, approved });
  if (approved) {
    return Response.json(baseline, { headers: { 'Cache-Control': 'no-store' } });
  }

  let advisory = baseline.advisory;
  let inferencePerformed = false;
  let inferenceMode = formaInferenceProvider.getStatus().mode;
  let inferenceDisclosure = formaInferenceProvider.getStatus().disclosure;
  try {
    const result = await formaInferenceProvider.reason({
      objective: baseline.objective,
      engineeringState: {
        baseRevision: baseline.proof.baseRevision,
        targetRevision: baseline.proof.targetRevision,
        changedComponentIds: baseline.proof.changedComponentIds,
        deterministicChecks: baseline.proof.checks,
        approvalRequired: true,
      },
      featureContract: {
        output: 'advisory answer and concise reasoning only',
        protectedFields: ['proof', 'approval', 'steps', 'candidateHash', 'commitEligible'],
      },
      mockResult: advisory,
    });
    advisory = result.structured;
    inferencePerformed = result.inferencePerformed;
    inferenceMode = result.mode;
    inferenceDisclosure = result.summary;
  } catch (error) {
    inferenceDisclosure = `Advisory inference unavailable: ${error instanceof Error ? error.message : 'unknown error'}`;
  }
  const status = formaInferenceProvider.getStatus();
  const reasoningService = status.services.find((service) => service.capability === 'reasoning');
  const receipt = buildDemoWorkflowReceipt({
    runId,
    createdAt: baseline.createdAt,
    objective: baseline.objective,
    provider: {
      name: status.provider,
      mode: inferenceMode,
      inferencePerformed,
      model: reasoningService?.model || null,
      disclosure: inferenceDisclosure,
    },
    advisory,
  });
  return Response.json(receipt, { headers: { 'Cache-Control': 'no-store' } });
}
