import { getEvaluationTasks, getEvidenceForFiles, searchCorpus, tokenize } from './corpus';
import type { AgentKind, AgentResponse, CorpusEvidence } from './corpus-types';
import { formaInferenceProvider } from './forma-inference.server';

const AGENT_LABELS: Record<AgentKind, string> = {
  builder: 'Builder Agent',
  product: 'Product Agent',
  supply: 'Supply Agent',
};

function taskScore(question: string, prompt: string) {
  const questionTokens = new Set(tokenize(question));
  const promptTokens = new Set(tokenize(prompt));
  const overlap = [...questionTokens].filter((token) => promptTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(questionTokens.size, promptTokens.size));
  const phraseBonus = question.toLowerCase().includes(prompt.toLowerCase()) || prompt.toLowerCase().includes(question.toLowerCase()) ? 0.45 : 0;
  return Math.min(1, overlap / denominator + phraseBonus);
}

function mergeEvidence(primary: CorpusEvidence[], retrieved: CorpusEvidence[]) {
  const byPath = new Map<string, CorpusEvidence>();
  [...primary, ...retrieved].forEach((item) => {
    const current = byPath.get(item.sourceFile);
    if (!current || item.score > current.score) byPath.set(item.sourceFile, item);
  });
  return [...byPath.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

function sentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

async function routeReasoningThroughProvider(response: AgentResponse): Promise<AgentResponse> {
  const assisted = await formaInferenceProvider.reason({
    objective: response.question,
    engineeringState: {
      agent: response.agent,
      artifactIds: response.artifactIds,
      evidence: response.evidence,
      matchedTask: response.matchedTask,
    },
    featureContract: {
      output: 'AgentResponse',
      protectedFields: ['agent', 'question', 'artifactIds', 'evidence', 'matchedTask', 'mode'],
    },
    mockResult: response,
  });

  if (assisted.mode !== 'local' || !assisted.inferencePerformed) return response;
  const candidate = assisted.structured;
  return {
    ...response,
    answer: typeof candidate.answer === 'string' ? candidate.answer : response.answer,
    reasoning: Array.isArray(candidate.reasoning) && candidate.reasoning.every((item) => typeof item === 'string') ? candidate.reasoning : response.reasoning,
  };
}

export async function queryAgent(agent: AgentKind, question: string): Promise<AgentResponse> {
  const started = performance.now();
  const tasks = await getEvaluationTasks(agent);
  const ranked = tasks
    .map((task) => ({ task, score: taskScore(question, task.prompt) }))
    .sort((a, b) => b.score - a.score);
  const match = ranked[0];
  const useGroundTruth = Boolean(match && match.score >= 0.24);
  const retrieved = await searchCorpus(question, { agent, limit: 8 });

  if (useGroundTruth) {
    const directEvidence = await getEvidenceForFiles(match.task.evidence_files, question);
    const evidence = mergeEvidence(directEvidence, retrieved);
    return routeReasoningThroughProvider({
      agent,
      question,
      answer: match.task.expected_answer,
      reasoning: sentences(match.task.expected_answer),
      artifactIds: match.task.artifact_refs,
      evidence,
      matchedTask: { id: match.task.id, prompt: match.task.prompt },
      confidence: Math.round(Math.min(0.98, 0.66 + match.score * 0.3) * 100) / 100,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      mode: 'ground-truth',
    });
  }

  const artifactIds = [...new Set(retrieved.flatMap((item) => item.artifactIds))].slice(0, 10);
  const evidenceSummary = retrieved.slice(0, 3).map((item) => `${item.title} (${item.sourceFile})`).join(', ');
  const answer = retrieved.length
    ? `${AGENT_LABELS[agent]} found relevant corpus evidence in ${evidenceSummary}. This question does not exactly match a validated scenario yet, so review the cited excerpts and affected artifacts before approving an engineering change.`
    : `${AGENT_LABELS[agent]} could not find matching evidence in the rover-alpha corpus. Try including a part number, artifact ID, supplier, test ID, or engineering objective.`;

  return routeReasoningThroughProvider({
    agent,
    question,
    answer,
    reasoning: retrieved.slice(0, 4).map((item) => item.excerpt),
    artifactIds,
    evidence: retrieved.slice(0, 6),
    matchedTask: null,
    confidence: retrieved.length ? 0.48 : 0.12,
    latencyMs: Math.max(1, Math.round(performance.now() - started)),
    mode: 'retrieval',
  });
}
