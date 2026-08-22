export type OpenCadToolMode = 'local' | 'simulated';

export type OpenCadMesh = {
  shapeId: string;
  vertices: number[];
  faces: number[];
  normals: number[];
  face_groups?: Array<{ start: number; count: number; face_index: number; owner_shape_id: string }>;
};

export type OpenCadValidationCheck = {
  key: 'geometry' | 'chassis_clearance' | 'camera_clearance' | 'cable_clearance' | 'wall_thickness';
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  source: 'opencad' | 'forma';
};

export type OpenCadRealizationRecord = {
  featureId: string;
  featureType: 'physical_realization';
  status: 'complete' | 'simulated';
  artifactId: string;
  artifactLabel: string;
  tool: 'opencad';
  toolMode: OpenCadToolMode;
  fromRevision: string;
  toRevision: string;
  requestedChange: {
    heightMm: { from: number; to: number };
    clearanceMm: number;
  };
  operation: {
    name: 'create_box';
    backend: string;
    treeId: string | null;
    treeRevision: number | null;
    shapeId: string | null;
  };
  validation: {
    status: 'valid' | 'invalid';
    checks: OpenCadValidationCheck[];
  };
  outputs: {
    step: string | null;
    stl: string | null;
  };
};

export type OpenCadRealizationResponse = OpenCadRealizationRecord & {
  meshes: { current: OpenCadMesh; proposed: OpenCadMesh };
  currentTree: unknown | null;
  proposedTree: unknown | null;
};

export type OpenCadRealizationPlan = {
  adapter: 'opencad';
  connected: boolean;
  required: boolean;
  status: 'not-required' | 'required' | 'realized' | 'simulated';
  operations: string[];
  note: string;
  realizationId?: string;
};

export interface OpenCadAdapter {
  readonly connected: boolean;
  planPhysicalRealization(input: {
    objective: string;
    changedArtifactIds: string[];
  }): OpenCadRealizationPlan;
}

const OPERATION_BY_ARTIFACT: Record<string, string> = {
  chassis: 'Rebuild the affected chassis clearance or mounting feature.',
  'motor-housing': 'Verify the motor envelope and regenerate the local housing feature.',
  'battery-enclosure': 'Rebuild the battery-cage envelope against the selected pack.',
  'camera-mount': 'Rebuild the camera-mount height parameter and validate its physical envelope.',
  j12: 'Validate connector keep-out geometry and the mating access envelope.',
};

export const openCadAdapter: OpenCadAdapter = {
  connected: false,
  planPhysicalRealization({ changedArtifactIds }) {
    const operations = changedArtifactIds
      .map((id) => OPERATION_BY_ARTIFACT[id])
      .filter((operation): operation is string => Boolean(operation));
    const required = changedArtifactIds.includes('camera-mount');
    return {
      adapter: 'opencad',
      connected: false,
      required,
      status: required ? 'required' : 'not-required',
      operations: operations.length ? operations : ['No geometry mutation is required for this proposal.'],
      note: required
        ? 'A local OpenCAD rebuild is required before this physical change can create a revision.'
        : operations.length
          ? 'Forma recorded the CAD follow-up. The focused live realization workflow is currently mapped to camera-mount geometry only.'
          : 'Forma determined that this proposal does not require a physical geometry mutation.',
    };
  },
};
