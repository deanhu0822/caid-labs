import multimodalIntent from '@/synthetic-assets/rover-alpha/features/multimodal_intent.json';
import clarifyConstraints from '@/synthetic-assets/rover-alpha/features/clarify_constraints.json';
import impactAnalysis from '@/synthetic-assets/rover-alpha/features/impact_analysis.json';
import partSubstitution from '@/synthetic-assets/rover-alpha/features/part_substitution.json';
import validation from '@/synthetic-assets/rover-alpha/features/validation.json';
import revisionUpdate from '@/synthetic-assets/rover-alpha/features/revision_update.json';
import physicalRealization from '@/synthetic-assets/rover-alpha/features/physical_realization.json';
import type { AgentResponse } from './corpus-types';
import { productAgentStructuredState } from './product-state';

export type DemoFeatureId =
  | 'multimodal_intent'
  | 'clarify_constraints'
  | 'impact_analysis'
  | 'part_substitution'
  | 'validation'
  | 'revision_update'
  | 'physical_realization';

export type DemoStage = {
  id: string;
  label: string;
  feature: DemoFeatureId;
  durationMs: number;
  phase: 'intent' | 'constraints' | 'graph' | 'candidate' | 'validation' | 'revision' | 'guided' | 'pro';
};

export const DEMO_FEATURES = {
  multimodal_intent: multimodalIntent,
  clarify_constraints: clarifyConstraints,
  impact_analysis: impactAnalysis,
  part_substitution: partSubstitution,
  validation,
  revision_update: revisionUpdate,
  physical_realization: physicalRealization,
} as const;

export const DEMO_STAGES: DemoStage[] = [
  { id: 'intent', label: 'User Intent', feature: 'multimodal_intent', durationMs: 4800, phase: 'intent' },
  { id: 'constraints', label: 'Constraints', feature: 'clarify_constraints', durationMs: 4600, phase: 'constraints' },
  { id: 'impact', label: 'Impact Analysis', feature: 'impact_analysis', durationMs: 5000, phase: 'graph' },
  { id: 'candidate', label: 'Candidate Change', feature: 'part_substitution', durationMs: 5200, phase: 'candidate' },
  { id: 'validation', label: 'Validation', feature: 'validation', durationMs: 5200, phase: 'validation' },
  { id: 'revision', label: 'Revision Update', feature: 'revision_update', durationMs: 5000, phase: 'revision' },
  { id: 'guided', label: 'Guided Result', feature: 'revision_update', durationMs: 4800, phase: 'guided' },
  { id: 'pro', label: 'Pro Evidence', feature: 'revision_update', durationMs: 0, phase: 'pro' }
];

export const DEMO_OBJECTIVE = multimodalIntent.objective;
export const DEMO_IMPACT_IDS = impactAnalysis.focus_artifact_ids;

export function demoAgentResponse(): AgentResponse {
  return {
    agent: 'builder',
    question: multimodalIntent.objective,
    answer: 'Motor M4 is the smallest compatible change that reaches the payload target while preserving CHS-240.',
    reasoning: [
      ...partSubstitution.reasons,
      'Controller, protection, firmware, and BOM records must evolve together.',
    ],
    artifactIds: [
      'motor-bom',
      'motor-controller',
      'motor-driver',
      'power-board',
      'motor-control',
      'battery',
      'chassis',
      'motor-m4-datasheet',
    ],
    evidence: [
      {
        sourceFile: 'features/part_substitution.json',
        title: 'Payload motor substitution',
        excerpt: 'Motor M4 provides +32% torque, fits CHS-240, and is available within the BOM ceiling.',
        artifactIds: ['motor-bom', 'motor-controller', 'chassis'],
        score: 98,
      },
      {
        sourceFile: 'motor_M4_datasheet.pdf',
        title: 'Motor M4 component specification',
        excerpt: 'Prototype document interpretation records 24 V, 11.2 A peak current, and 8.4 Nm torque. No model inference was performed.',
        artifactIds: ['motor-bom', 'motor-m4-datasheet'],
        score: 95,
      },
      {
        sourceFile: 'features/validation.json',
        title: 'Rev D validation state',
        excerpt: 'Payload and chassis checks pass; expected runtime decreases by 11%.',
        artifactIds: ['motor-bom', 'battery', 'motor-control'],
        score: 96,
      },
    ],
    matchedTask: { id: 'BLD-001', prompt: multimodalIntent.objective },
    confidence: 0.97,
    latencyMs: 420,
    mode: 'ground-truth',
    structuredState: productAgentStructuredState('rover-alpha:rev-c'),
  };
}
