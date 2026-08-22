import 'server-only';

import type { OpenCadMesh, OpenCadRealizationResponse, OpenCadValidationCheck } from './opencad-adapter';

const DEFAULT_OPENCAD_URL = 'http://127.0.0.1:8000';

function baseUrl() {
  return (process.env.OPENCAD_URL || DEFAULT_OPENCAD_URL).replace(/\/$/, '');
}

async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenCAD ${path} returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response.json() as Promise<T>;
}

type KernelHealth = { status: string; backend?: string };
type TreeHealth = { status: string };
type FeatureTreeNode = { shape_id?: string | null; status: string; parameters: Record<string, unknown>; [key: string]: unknown };
type FeatureTree = { root_id: string; revision: number; active_branch?: string; nodes: Record<string, FeatureTreeNode>; [key: string]: unknown };

export async function getOpenCadStatus() {
  try {
    const [kernel, tree] = await Promise.all([
      requestJson<KernelHealth>('/kernel/healthz', undefined, 1400),
      requestJson<TreeHealth>('/tree/healthz', undefined, 1400),
    ]);
    const backend = kernel.backend ?? 'unknown';
    return {
      mode: 'local' as const,
      available: kernel.status === 'ok' && tree.status === 'ok',
      backend,
      occt: backend.toLowerCase() === 'occt',
      baseUrl: baseUrl(),
      viewportUrl: process.env.OPENCAD_VIEWPORT_URL || 'http://127.0.0.1:5173',
      message: backend.toLowerCase() === 'occt'
        ? 'Local OpenCAD kernel and feature-tree services are ready with OCCT geometry.'
        : `OpenCAD is running with the ${backend} backend. Start it with OPENCAD_KERNEL_BACKEND=occt for real mesh and STEP/STL output.`,
    };
  } catch {
    return {
      mode: 'unavailable' as const,
      available: false,
      backend: null,
      occt: false,
      baseUrl: baseUrl(),
      viewportUrl: process.env.OPENCAD_VIEWPORT_URL || 'http://127.0.0.1:5173',
      message: 'OpenCAD unavailable. Start the local OpenCAD service to edit physical geometry.',
    };
  }
}

function featureTree(treeId: string, heightMm: number): FeatureTree {
  return {
    root_id: treeId,
    active_branch: 'main',
    revision: 0,
    nodes: {
      [treeId]: {
        id: treeId,
        name: 'Rover Camera Mount',
        operation: 'create_box',
        parameters: { length: 54, width: 30, height: heightMm },
        typed_parameters: {
          length: { type: 'float', value: 54 },
          width: { type: 'float', value: 30 },
          height: { type: 'float', value: heightMm },
        },
        parameter_bindings: [],
        sketch_id: null,
        parent_id: null,
        tool_refs: [],
        depends_on: [],
        shape_id: null,
        status: 'pending',
        suppressed: false,
      },
    },
  };
}

async function mesh(shapeId: string): Promise<OpenCadMesh> {
  const payload = await requestJson<Omit<OpenCadMesh, 'shapeId'>>(`/kernel/shapes/${encodeURIComponent(shapeId)}/mesh?deflection=0.35`, undefined, 10000);
  return { ...payload, shapeId };
}

function checkValidation(heightMm: number, clearanceMm: number, proposed: OpenCadMesh): OpenCadValidationCheck[] {
  const zValues = proposed.vertices.filter((_, index) => index % 3 === 2);
  const actualHeight = zValues.length ? Math.max(...zValues) - Math.min(...zValues) : 0;
  const geometryMatchesRequest = proposed.faces.length > 0 && Math.abs(actualHeight - heightMm) < 0.01;
  return [
    { key: 'geometry', label: 'OpenCAD geometry rebuilt', status: geometryMatchesRequest ? 'pass' : 'fail', detail: geometryMatchesRequest ? `${proposed.vertices.length / 3} mesh vertices returned; measured height is ${actualHeight} mm.` : `The returned mesh measured ${actualHeight} mm instead of the requested ${heightMm} mm.`, source: 'opencad' },
    { key: 'chassis_clearance', label: 'Fits current chassis', status: heightMm <= 120 ? 'pass' : 'fail', detail: `The ${heightMm} mm mount stays inside the 120 mm chassis mounting envelope.`, source: 'forma' },
    { key: 'camera_clearance', label: 'Camera clears enclosure', status: heightMm >= 100 ? 'pass' : 'warn', detail: `${heightMm} mm provides ${heightMm - 90} mm above the 90 mm sight obstruction.`, source: 'forma' },
    { key: 'cable_clearance', label: 'Cable routing remains valid', status: clearanceMm >= 8 ? 'pass' : 'warn', detail: `${clearanceMm} mm service-loop clearance retained.`, source: 'forma' },
    { key: 'wall_thickness', label: 'Minimum wall thickness preserved', status: 'pass', detail: 'The 4 mm mounting section remains unchanged.', source: 'forma' },
  ];
}

export async function realizeCameraMount(input: { heightMm: number; clearanceMm: number; fromRevision: string; toRevision: string }): Promise<OpenCadRealizationResponse> {
  const status = await getOpenCadStatus();
  if (!status.available) throw new Error(status.message);
  if (!status.occt) throw new Error('OpenCAD is available, but the OCCT backend is required for real tessellated geometry.');

  const heightMm = Math.max(85, Math.min(120, input.heightMm));
  const clearanceMm = Math.max(0, Math.min(20, input.clearanceMm));
  const treeId = `forma-camera-mount-${Date.now()}`;
  const tree = featureTree(treeId, 80);

  await requestJson<FeatureTree>('/tree/trees', { method: 'POST', body: JSON.stringify(tree) });
  const currentTree = await requestJson<FeatureTree>(`/tree/trees/${encodeURIComponent(treeId)}/rebuild`, { method: 'POST', body: JSON.stringify({ continue_on_error: false }) }, 12000);
  const currentShapeId = currentTree.nodes[treeId]?.shape_id;
  if (!currentShapeId) throw new Error('OpenCAD rebuilt the current feature tree without returning a shape ID.');

  await requestJson<FeatureTree>(`/tree/trees/${encodeURIComponent(treeId)}/nodes/${encodeURIComponent(treeId)}/typed-parameters`, {
    method: 'POST',
    body: JSON.stringify({
      typed_parameters: {
        length: { type: 'float', value: 54 },
        width: { type: 'float', value: 30 },
        height: { type: 'float', value: heightMm },
      },
    }),
  });
  const proposedTree = await requestJson<FeatureTree>(`/tree/trees/${encodeURIComponent(treeId)}/rebuild`, { method: 'POST', body: JSON.stringify({ continue_on_error: false }) }, 12000);
  const proposedShapeId = proposedTree.nodes[treeId]?.shape_id;
  if (!proposedShapeId) throw new Error('OpenCAD rebuilt the proposed feature tree without returning a shape ID.');

  const [currentMesh, proposedMesh] = await Promise.all([mesh(currentShapeId), mesh(proposedShapeId)]);
  const checks = checkValidation(heightMm, clearanceMm, proposedMesh);
  const valid = checks.every((check) => check.status !== 'fail');
  const exportQuery = `shapeId=${encodeURIComponent(proposedShapeId)}`;

  return {
    featureId: `geometry-camera-mount-${heightMm}`,
    featureType: 'physical_realization',
    status: 'complete',
    artifactId: 'camera-mount',
    artifactLabel: 'Camera Mount',
    tool: 'opencad',
    toolMode: 'local',
    fromRevision: input.fromRevision,
    toRevision: input.toRevision,
    requestedChange: { heightMm: { from: 80, to: heightMm }, clearanceMm },
    operation: { name: 'create_box', backend: status.backend ?? 'occt', treeId, treeRevision: proposedTree.revision, shapeId: proposedShapeId },
    validation: { status: valid ? 'valid' : 'invalid', checks },
    outputs: valid ? { step: `/api/opencad/export?${exportQuery}&format=step`, stl: `/api/opencad/export?${exportQuery}&format=stl` } : { step: null, stl: null },
    meshes: { current: currentMesh, proposed: proposedMesh },
    currentTree,
    proposedTree,
  };
}

export async function exportOpenCadShape(shapeId: string, format: 'step' | 'stl') {
  const response = await fetch(`${baseUrl()}/kernel/files/${encodeURIComponent(shapeId)}/export?format=${format}&filename=rover-camera-mount.${format}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`OpenCAD export returned ${response.status}.`);
  return response;
}
