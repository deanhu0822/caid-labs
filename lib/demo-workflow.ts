import clarifyConstraints from '@/synthetic-assets/rover-alpha/features/clarify_constraints.json';
import impactAnalysis from '@/synthetic-assets/rover-alpha/features/impact_analysis.json';
import multimodalIntent from '@/synthetic-assets/rover-alpha/features/multimodal_intent.json';
import partSubstitution from '@/synthetic-assets/rover-alpha/features/part_substitution.json';
import revisionUpdate from '@/synthetic-assets/rover-alpha/features/revision_update.json';
import validation from '@/synthetic-assets/rover-alpha/features/validation.json';
import { getValidatedProduct } from './product-state';

export type DemoWorkflowStepStatus = 'completed' | 'warning' | 'waiting' | 'blocked';

export type DemoWorkflowStep = {
  id: 'intent' | 'constraints' | 'impact' | 'candidate' | 'validation' | 'approval' | 'revision' | 'evidence';
  label: string;
  status: DemoWorkflowStepStatus;
  detail: string;
  artifactIds: string[];
  evidence: string[];
};

export type DemoWorkflowReceipt = {
  runId: string;
  createdAt: string;
  objective: string;
  state: 'awaiting-approval' | 'committed' | 'blocked';
  provider: {
    name: string;
    mode: string;
    inferencePerformed: boolean;
    model: string | null;
    disclosure: string;
  };
  advisory: {
    answer: string;
    reasoning: string[];
  };
  proof: {
    baseCandidateId: 'rover-alpha:rev-c';
    candidateId: 'rover-alpha:rev-d-payload';
    baseRevision: string;
    targetRevision: string;
    baseHash: string;
    candidateHash: string;
    schemaValidation: 'pass';
    semanticGates: 'pass';
    gateFailures: [];
    changedComponentIds: string[];
    checks: Array<{ key: string; pass: boolean; detail: string }>;
  };
  approval: {
    required: true;
    approved: boolean;
    commitEligible: boolean;
    message: string;
  };
  steps: DemoWorkflowStep[];
};

type ReceiptOptions = {
  runId: string;
  createdAt?: string;
  objective?: string;
  approved?: boolean;
  provider?: Partial<DemoWorkflowReceipt['provider']>;
  advisory?: Partial<DemoWorkflowReceipt['advisory']>;
};

function changedComponentIds() {
  const base = getValidatedProduct('rover-alpha:rev-c').product.components;
  const candidate = getValidatedProduct('rover-alpha:rev-d-payload').product.components;
  const baseById = new Map(base.map((component) => [component.component_id, component]));
  return candidate
    .filter((component) => JSON.stringify(baseById.get(component.component_id)) !== JSON.stringify(component))
    .map((component) => component.component_id);
}

export function buildDemoWorkflowReceipt(options: ReceiptOptions): DemoWorkflowReceipt {
  const base = getValidatedProduct('rover-alpha:rev-c');
  const candidate = getValidatedProduct('rover-alpha:rev-d-payload');
  const changedComponents = changedComponentIds();
  const changedArtifacts = revisionUpdate.changed_artifact_ids;
  const preservedArtifacts = revisionUpdate.preserved_artifact_ids;
  const overlap = changedArtifacts.filter((id) => preservedArtifacts.includes(id));
  const checks = [
    {
      key: 'revision-lineage',
      pass: base.revision === revisionUpdate.from_revision && candidate.revision === revisionUpdate.to_revision,
      detail: `${base.revision} → ${candidate.revision} matches the declared revision transition.`,
    },
    {
      key: 'candidate-validation',
      pass: candidate.validation.schema === 'pass' && candidate.validation.semanticGates === 'pass' && candidate.validation.gateFailures.length === 0,
      detail: 'The candidate is present in the canonical validation manifest with zero gate failures.',
    },
    {
      key: 'minimal-change',
      pass: changedComponents.length > 0 && overlap.length === 0 && !changedArtifacts.includes('chassis'),
      detail: `${changedComponents.length} canonical component ${changedComponents.length === 1 ? 'record changed' : 'records changed'}; the fixed chassis remains preserved.`,
    },
    {
      key: 'tradeoff-visible',
      pass: validation.checks.some((check) => check.status === 'warn'),
      detail: 'The runtime tradeoff remains visible instead of being silently converted into a pass.',
    },
    {
      key: 'evidence-linked',
      pass: impactAnalysis.focus_artifact_ids.every((id) => impactAnalysis.affected_systems.some((system) => system.artifact_ids.includes(id))),
      detail: 'Every focused artifact is linked to an affected system in the impact record.',
    },
  ];
  const commitEligible = checks.every((check) => check.pass);
  const approved = Boolean(options.approved && commitEligible);
  const blocked = !commitEligible;
  const state: DemoWorkflowReceipt['state'] = blocked ? 'blocked' : approved ? 'committed' : 'awaiting-approval';
  const waitingStatus = blocked ? 'blocked' as const : approved ? 'completed' as const : 'waiting' as const;
  const advisory = {
    answer: options.advisory?.answer || 'Motor M4 is the smallest coherent payload upgrade that preserves the released chassis while keeping all dependent records explicit.',
    reasoning: options.advisory?.reasoning || [
      'Trace the motor change through controller, firmware, power, BOM, and test evidence.',
      'Keep the 11% runtime reduction visible as an approval tradeoff.',
      'Create Rev D only after a person accepts the validated candidate.',
    ],
  };

  return {
    runId: options.runId,
    createdAt: options.createdAt || new Date().toISOString(),
    objective: options.objective?.trim() || multimodalIntent.objective,
    state,
    provider: {
      name: options.provider?.name || 'mock',
      mode: options.provider?.mode || 'mock',
      inferencePerformed: options.provider?.inferencePerformed === true,
      model: options.provider?.model || null,
      disclosure: options.provider?.disclosure || 'Deterministic workflow proof. No model inference was performed.',
    },
    advisory,
    proof: {
      baseCandidateId: 'rover-alpha:rev-c',
      candidateId: 'rover-alpha:rev-d-payload',
      baseRevision: base.revision,
      targetRevision: candidate.revision,
      baseHash: base.hash,
      candidateHash: candidate.hash,
      schemaValidation: candidate.validation.schema,
      semanticGates: candidate.validation.semanticGates,
      gateFailures: candidate.validation.gateFailures,
      changedComponentIds: changedComponents,
      checks,
    },
    approval: {
      required: true,
      approved,
      commitEligible,
      message: blocked
        ? 'Revision creation is blocked because one or more deterministic checks failed.'
        : approved
          ? `${candidate.revision} was committed to the shared demo state after explicit approval.`
          : `${candidate.revision} is validated and ready, but no revision has been created yet.`,
    },
    steps: [
      {
        id: 'intent',
        label: 'Observe',
        status: 'completed',
        detail: 'Normalize the payload objective and attached engineering context.',
        artifactIds: ['rover', 'motor-m4-datasheet'],
        evidence: ['features/multimodal_intent.json'],
      },
      {
        id: 'constraints',
        label: 'Understand',
        status: 'completed',
        detail: `${clarifyConstraints.fixed.length} constraints are fixed before a candidate is selected.`,
        artifactIds: ['chassis'],
        evidence: ['features/clarify_constraints.json'],
      },
      {
        id: 'impact',
        label: 'Trace',
        status: checks[4].pass ? 'completed' : 'blocked',
        detail: `${impactAnalysis.affected_systems.length} affected systems were traced through the product graph.`,
        artifactIds: [...impactAnalysis.focus_artifact_ids],
        evidence: ['features/impact_analysis.json', base.sourcePath],
      },
      {
        id: 'candidate',
        label: 'Propose',
        status: checks[2].pass ? 'completed' : 'blocked',
        detail: `${partSubstitution.selected_part} was selected as the smallest compatible change.`,
        artifactIds: [...changedArtifacts],
        evidence: ['features/part_substitution.json', candidate.sourcePath],
      },
      {
        id: 'validation',
        label: 'Validate',
        status: commitEligible ? 'warning' : 'blocked',
        detail: `${validation.checks.filter((check) => check.status === 'pass').length} checks passed; ${validation.checks.filter((check) => check.status === 'warn').length} tradeoff requires review.`,
        artifactIds: [...changedArtifacts],
        evidence: ['features/validation.json', 'product_pipeline/dataset/validation_manifest.json'],
      },
      {
        id: 'approval',
        label: 'Approve',
        status: blocked ? 'blocked' : approved ? 'completed' : 'waiting',
        detail: approved ? 'A person approved the validated change.' : 'A person must accept the tradeoff before revision creation.',
        artifactIds: [...changedArtifacts],
        evidence: ['features/revision_update.json'],
      },
      {
        id: 'revision',
        label: 'Commit',
        status: waitingStatus,
        detail: approved ? `${candidate.revision} is now the shared Product state.` : 'Revision creation is waiting for approval.',
        artifactIds: [...changedArtifacts],
        evidence: [candidate.sourcePath, 'product_pipeline/dataset/validation_manifest.json'],
      },
      {
        id: 'evidence',
        label: 'Learn',
        status: waitingStatus,
        detail: approved ? 'The decision, tradeoff, hashes, and affected artifacts are retained as the execution receipt.' : 'The learning record is written only after commit.',
        artifactIds: [...changedArtifacts, ...preservedArtifacts],
        evidence: ['features/revision_update.json', candidate.sourcePath],
      },
    ],
  };
}
