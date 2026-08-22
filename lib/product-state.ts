import type { Artifact, EdgeKind, Relation } from '@/app/product-data';
import type { AgentResponse } from './corpus-types';
import validationManifest from '@/product_pipeline/dataset/validation_manifest.json';
import roverRevC from '@/product_pipeline/dataset/products/rover_alpha_rev_c.json';
import roverRevDPayload from '@/product_pipeline/dataset/products/rover_alpha_rev_d_payload.json';
import roverRevDCamera from '@/product_pipeline/dataset/products/rover_alpha_rev_d_camera.json';
import roverRevDJ12 from '@/product_pipeline/dataset/products/rover_alpha_rev_d_j12.json';
import roverRevDRuntime from '@/product_pipeline/dataset/products/rover_alpha_rev_d_runtime.json';

/**
 * Minimal reader types for the UI adapter. These are not a second validator:
 * schema.py::Product remains canonical and validate.py remains authoritative.
 */
type ProductComponent = {
  component_id: string;
  display_name: string;
  category: string;
  type: string;
  material: string;
  quantity: number;
  description: string;
  dimensions: Record<string, string | number | null>;
  functional_role: string;
  pins?: string[] | null;
};

type ProductRelationship = {
  source: string;
  relation: string;
  target: string;
  required: boolean;
  notes?: string;
};

type ProductSource = {
  component_id: string;
  product_name: string;
  unit_cost_usd: number;
  quantity: number;
  total_cost_usd: number;
  vendor?: string | null;
  url?: string | null;
};

export type CanonicalProductRecord = {
  project: { project_id: string; name: string; summary: string; revision: string; original_prompt: string };
  requirements: { tools: string[]; assumptions: string[]; safety_notes: string[]; constraints: string[]; skill_level: string };
  components: ProductComponent[];
  relationships: ProductRelationship[];
  circuit: {
    summary: string;
    nets: Array<{ net_id: string; name: string; kind: string; members: Array<{ component: string; pin: string }> }>;
    power_budget: { input_source: string; total_power_w?: number | null; rails: Array<{ name: string; voltage: string; estimated_current_a?: number | null; loads: string[] }> };
  };
  fabrication: { processes: string[]; component_settings: Record<string, unknown>; post_processing: string[]; tolerances: Record<string, string> };
  instructions: Array<{ step_id: string; phase: string; title: string; component_ids: string[]; dependencies: string[]; expected_result: string; detail: { summary: string; steps: string[]; tools: string[]; warnings: string[] } }>;
  appearance: { overall_dimensions: string; geometry_summary: string; finish: string; color: string; key_features: string[]; visual_description: string };
  image_generation_prompt: { prompt: string; negative_prompt: string; tags: string[]; style: string; view: string; lighting: string; background: string; aspect_ratio: string };
  sourcing: { items: ProductSource[]; cost_summary: { total_usd: number; components_priced: number; components_total: number }; vendors: string[] };
  validation: { schema_valid: boolean; reference_integrity_valid: boolean; manufacturability_valid: boolean; naming_consistency_valid: boolean; issues: unknown[]; confidence_score: number };
};

export type ProductCandidateId =
  | 'rover-alpha:rev-c'
  | 'rover-alpha:rev-d-payload'
  | 'rover-alpha:rev-d-camera'
  | 'rover-alpha:rev-d-j12'
  | 'rover-alpha:rev-d-runtime';

export type ValidatedProductState = {
  candidateId: ProductCandidateId;
  sourcePath: string;
  hash: string;
  revision: string;
  validation: {
    schema: 'pass';
    semanticGates: 'pass';
    gateFailures: [];
    warnings: string[];
  };
  product: CanonicalProductRecord;
};

const PRODUCTS: Record<ProductCandidateId, CanonicalProductRecord> = {
  'rover-alpha:rev-c': roverRevC as CanonicalProductRecord,
  'rover-alpha:rev-d-payload': roverRevDPayload as CanonicalProductRecord,
  'rover-alpha:rev-d-camera': roverRevDCamera as CanonicalProductRecord,
  'rover-alpha:rev-d-j12': roverRevDJ12 as CanonicalProductRecord,
  'rover-alpha:rev-d-runtime': roverRevDRuntime as CanonicalProductRecord,
};

type ManifestRecord = {
  candidate_id: string;
  path: string;
  sha256: string;
  revision: string;
  schema_validation: string;
  semantic_gates: string;
  gate_failures: unknown[];
  warnings: string[];
};

const RECORDS = validationManifest.records as Record<ProductCandidateId, ManifestRecord>;

export function getValidatedProduct(candidateId: ProductCandidateId): ValidatedProductState {
  const product = PRODUCTS[candidateId];
  const manifest = RECORDS[candidateId];
  if (!product || !manifest) throw new Error(`Unknown Product candidate: ${candidateId}`);
  const revision = `Rev ${product.project.revision}`;
  if (manifest.schema_validation !== 'pass' || manifest.semantic_gates !== 'pass' || manifest.gate_failures.length || manifest.revision !== revision) {
    throw new Error(`Product candidate ${candidateId} is not accepted by the Python validation manifest.`);
  }
  return {
    candidateId,
    sourcePath: manifest.path,
    hash: manifest.sha256,
    revision,
    validation: { schema: 'pass', semanticGates: 'pass', gateFailures: [], warnings: manifest.warnings },
    product,
  };
}

const COMPONENT_ARTIFACT_IDS: Record<string, string> = {
  chassis: 'chassis',
  left_wheel_assembly: 'left-wheel',
  right_wheel_assembly: 'right-wheel',
  camera_mount: 'camera-mount',
  battery_enclosure: 'battery-enclosure',
  motor_housing: 'motor-housing',
  main_board: 'main-board',
  motor_controller: 'motor-controller',
  motor_driver: 'motor-driver',
  drive_motor_m2: 'motor-bom',
  drive_motor_m4: 'motor-bom',
  battery_pack: 'battery',
  j12_connector: 'j12',
  camera_module: 'camera-module',
};

const RELATION_KINDS: Record<string, EdgeKind> = {
  contains: 'contains',
  mounted_on: 'contains',
  attached_to: 'contains',
  supported_by: 'contains',
  positions: 'contains',
  connects_to: 'routes',
  routed_around: 'routes',
  secured_by: 'depends',
  fastens_into: 'depends',
  rotates_on: 'depends',
};

function relationshipDescription(source: Artifact, target: Artifact, kind: EdgeKind, provided?: string) {
  if (provided?.trim()) return provided.trim();
  const phrases: Record<EdgeKind, string> = {
    contains: `${source.label} physically contains or locates ${target.label}.`,
    routes: `${source.label} connects or routes engineering interfaces to ${target.label}.`,
    drives: `${source.label} sends control or power commands to ${target.label}.`,
    sourced: `${source.label} is sourced from ${target.label}.`,
    validated: `${source.label} is validated by ${target.label}.`,
    depends: `${source.label} depends on ${target.label}.`,
    changed: `${source.label} can be changed by ${target.label}.`,
  };
  return phrases[kind];
}

export function mapProductToGraph(state: ValidatedProductState, baseArtifacts: Artifact[], baseRelations: Relation[]) {
  const componentByArtifact = new Map<string, ProductComponent>();
  state.product.components.forEach((component) => {
    const artifactId = COMPONENT_ARTIFACT_IDS[component.component_id];
    if (artifactId) componentByArtifact.set(artifactId, component);
  });
  const artifacts = baseArtifacts.map((artifact) => {
    const component = componentByArtifact.get(artifact.id);
    if (!component) return artifact;
    return { ...artifact, label: component.display_name };
  });
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const seen = new Set(baseRelations.map((relation) => `${relation.source}:${relation.target}:${relation.kind}`));
  const mapped: Relation[] = [];
  state.product.relationships.forEach((relationship) => {
    const sourceId = COMPONENT_ARTIFACT_IDS[relationship.source];
    const targetId = COMPONENT_ARTIFACT_IDS[relationship.target];
    if (!sourceId || !targetId || sourceId === targetId) return;
    const kind = RELATION_KINDS[relationship.relation] ?? 'depends';
    const signature = `${sourceId}:${targetId}:${kind}`;
    if (seen.has(signature)) return;
    const source = artifactById.get(sourceId);
    const target = artifactById.get(targetId);
    if (!source || !target) return;
    seen.add(signature);
    mapped.push({
      id: `product:${relationship.source}:${relationship.relation}:${relationship.target}`,
      source: sourceId,
      target: targetId,
      kind,
      description: relationshipDescription(source, target, kind, relationship.notes),
      productRelationship: relationship.relation,
    });
  });
  return { artifacts, relations: [...baseRelations, ...mapped] };
}

export function productAgentContext(state: ValidatedProductState) {
  return {
    candidateId: state.candidateId,
    productId: state.product.project.project_id,
    revision: state.revision,
    validation: state.validation,
    requirements: state.product.requirements.constraints,
    componentIds: state.product.components.map((component) => component.component_id),
    relationships: state.product.relationships,
    circuitNets: state.product.circuit.nets.map((net) => net.net_id),
    fabricationProcesses: state.product.fabrication.processes,
    instructionSteps: state.product.instructions.map((instruction) => ({ id: instruction.step_id, title: instruction.title, phase: instruction.phase })),
    sourcing: state.product.sourcing,
  };
}

export function productAgentStructuredState(candidateId: ProductCandidateId): AgentResponse['structuredState'] {
  const context = productAgentContext(getValidatedProduct(candidateId));
  return {
    candidateId: context.candidateId,
    productId: context.productId,
    revision: context.revision,
    validation: context.validation,
    requirements: context.requirements,
    componentIds: context.componentIds,
    relationshipCount: context.relationships.length,
    circuitNets: context.circuitNets,
    fabricationProcesses: context.fabricationProcesses,
    instructionSteps: context.instructionSteps,
    sourcingItems: context.sourcing.items.map((item) => ({
      componentId: item.component_id,
      productName: item.product_name,
      vendor: item.vendor ?? null,
      unitCostUsd: item.unit_cost_usd,
    })),
  };
}
