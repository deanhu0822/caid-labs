export type OpenCadRealizationPlan = {
  adapter: 'opencad';
  connected: false;
  status: 'interface-ready';
  operations: string[];
  note: string;
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
  'camera-mount': 'Rebuild the camera-mount datum and optical alignment features.',
  j12: 'Validate connector keep-out geometry and the mating access envelope.',
};

export const openCadAdapter: OpenCadAdapter = {
  connected: false,
  planPhysicalRealization({ changedArtifactIds }) {
    const operations = changedArtifactIds
      .map((id) => OPERATION_BY_ARTIFACT[id])
      .filter((operation): operation is string => Boolean(operation));
    return {
      adapter: 'opencad',
      connected: false,
      status: 'interface-ready',
      operations: operations.length ? operations : ['No geometry mutation is required for this proposal.'],
      note: 'OpenCAD is not connected. Forma has prepared a physical-realization handoff without claiming that CAD was rebuilt.',
    };
  },
};
