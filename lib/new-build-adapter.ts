import { FORMA_MODEL_ROLES, mockFormaInferenceProvider, type FormaInferenceMode } from './forma-inference';

export type PrototypeSourceKind = 'image' | 'video' | 'document';

export type PrototypeInputSource = {
  id: string;
  kind: PrototypeSourceKind;
  name: string;
  mimeType: string;
  url: string;
  sizeBytes: number;
  durationSeconds?: number;
};

export type PrototypeScenario = 'inspection-rover' | 'air-monitor' | 'camera-platform' | 'pick-and-place';

export type ExtractedRequirement = {
  key: string;
  label: string;
  value: string;
  source: 'text' | 'reference' | 'document' | 'prototype-default';
  sourceId?: string;
  sourceName?: string;
};

export type PrototypeMediaObservation = {
  sourceId: string;
  kind: 'image' | 'video';
  summary: string;
  inferenceConnected: false;
};

export type PrototypeDocumentObservation = {
  sourceId: string;
  sourceName: string;
  title: string;
  artifactType: string;
  component: string | null;
  partNumbers: string[];
  properties: Array<{ key: string; label: string; value: string; sourceId: string; sourceName: string }>;
  mode: FormaInferenceMode;
  inferencePerformed: boolean;
  parserRole: typeof FORMA_MODEL_ROLES.parse;
  summary: string;
};

export type PrototypeIntent = {
  prototype: true;
  scenario: PrototypeScenario;
  buildGoal: string;
  goalSummary: string;
  requirements: ExtractedRequirement[];
  missingDecisions: string[];
  mediaObservations: PrototypeMediaObservation[];
  documentObservations: PrototypeDocumentObservation[];
};

export type ClarificationAnswers = {
  terrain: string;
  priority: string;
  budget: string;
};

export type GeneratedArtifactCategory =
  | 'overview'
  | 'mechanical'
  | 'pcb'
  | 'firmware'
  | 'bom'
  | 'manufacturing'
  | 'suppliers'
  | 'tests'
  | 'agents'
  | 'documents';

export type GeneratedEdgeKind = 'contains' | 'routes' | 'drives' | 'sourced' | 'validated' | 'depends' | 'changed';

export type GeneratedArtifact = {
  id: string;
  label: string;
  category: GeneratedArtifactCategory;
  code: string;
  meta: string;
  x: number;
  y: number;
  revision?: string;
};

export type GeneratedRelation = {
  id: string;
  source: string;
  target: string;
  kind: GeneratedEdgeKind;
};

export type PrototypeDecisionOption = {
  id: string;
  label: string;
  description: string;
};

export type PrototypeArchitecture = {
  prototype: true;
  name: string;
  slug: string;
  assumptions: string[];
  artifacts: GeneratedArtifact[];
  relations: GeneratedRelation[];
  nextDecision: {
    title: string;
    description: string;
    options: PrototypeDecisionOption[];
  };
  prototypeChecks: string[];
  openCad: {
    connected: false;
    note: string;
  };
};

export type PrototypeBuildDefinition = {
  id: string;
  displayName: string;
  originalPrompt: string;
  additionalNotes: string;
  sources: PrototypeInputSource[];
  intent: PrototypeIntent;
  clarifications: ClarificationAnswers;
  architecture: PrototypeArchitecture;
  createdAtLabel: string;
};

export interface NewBuildPrototypeAdapter {
  readonly inferenceConnected: false;
  readonly openCadConnected: false;
  analyzeIntent(input: { text: string; sources: PrototypeInputSource[]; additionalNotes: string }): Promise<PrototypeIntent>;
  analyzeImage(source: PrototypeInputSource): Promise<PrototypeMediaObservation>;
  analyzeVideo(source: PrototypeInputSource): Promise<PrototypeMediaObservation>;
  analyzeDocument(source: PrototypeInputSource): Promise<PrototypeDocumentObservation>;
  synthesizeArchitecture(intent: PrototypeIntent, clarifications: ClarificationAnswers): Promise<PrototypeArchitecture>;
  validateDesign(architecture: PrototypeArchitecture): Promise<string[]>;
  realizeWithOpenCAD(architecture: PrototypeArchitecture): Promise<{ connected: false; note: string }>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function detectScenario(text: string): PrototypeScenario {
  if (/air[ -]?quality|air monitor|particulate|co2/i.test(text)) return 'air-monitor';
  if (/pick[ -]?and[ -]?place|pick and place|desktop robot arm/i.test(text)) return 'pick-and-place';
  if (/camera platform|camera dolly|robotic camera/i.test(text)) return 'camera-platform';
  return 'inspection-rover';
}

function findMeasure(text: string, pattern: RegExp, fallback: string) {
  const match = text.match(pattern);
  return match ? `${match[1]} ${match[2]}` : fallback;
}

function documentRequirements(documentObservations: PrototypeDocumentObservation[]): ExtractedRequirement[] {
  return documentObservations.flatMap((document) => document.properties.map((property) => ({
    key: `document:${document.sourceId}:${property.key}`,
    label: property.label,
    value: property.value,
    source: 'document' as const,
    sourceId: document.sourceId,
    sourceName: document.sourceName,
  })));
}

function roverIntent(text: string, mediaObservations: PrototypeMediaObservation[], documentObservations: PrototypeDocumentObservation[]): PrototypeIntent {
  return {
    prototype: true,
    scenario: 'inspection-rover',
    buildGoal: 'Industrial inspection rover',
    goalSummary: `Carry ${findMeasure(text, /(\d+(?:\.\d+)?)\s*(lb|lbs|pounds|kg)/i, '20 lb')} for ${findMeasure(text, /(\d+(?:\.\d+)?)\s*(hours?|hrs?)/i, '4 hours')}.`,
    requirements: [
      { key: 'payload', label: 'Payload', value: findMeasure(text, /(\d+(?:\.\d+)?)\s*(lb|lbs|pounds|kg)/i, '20 lb'), source: 'text' },
      { key: 'runtime', label: 'Runtime', value: findMeasure(text, /(\d+(?:\.\d+)?)\s*(hours?|hrs?)/i, '4 hours'), source: 'text' },
      { key: 'width', label: 'Width', value: /compact|narrow/i.test(text) ? 'Compact / narrow-access' : 'Compact', source: 'text' },
      { key: 'environment', label: 'Environment', value: /industrial/i.test(text) ? 'Industrial indoor' : 'Indoor inspection', source: 'text' },
      { key: 'mobility', label: 'Mobility', value: 'Wheeled', source: 'prototype-default' },
      { key: 'function', label: 'Primary function', value: 'Visual inspection', source: 'text' },
      ...documentRequirements(documentObservations),
    ],
    missingDecisions: ['Target speed', 'Maximum budget', 'Camera type', 'Terrain tolerance'],
    mediaObservations,
    documentObservations,
  };
}

function scenarioIntent(scenario: Exclude<PrototypeScenario, 'inspection-rover'>, mediaObservations: PrototypeMediaObservation[], documentObservations: PrototypeDocumentObservation[]): PrototypeIntent {
  const presets = {
    'air-monitor': {
      buildGoal: 'Portable air-quality monitor',
      goalSummary: 'Measure indoor air quality from a portable battery-powered enclosure.',
      requirements: [
        ['sensors', 'Sensors', 'Particulate, CO₂, temperature'],
        ['runtime', 'Runtime', 'All-day portable use'],
        ['interface', 'Interface', 'Local display and data logging'],
        ['enclosure', 'Enclosure', 'Hand-portable'],
      ],
      missing: ['Measurement accuracy', 'Connectivity', 'Battery target', 'Budget'],
    },
    'camera-platform': {
      buildGoal: 'Small robotic camera platform',
      goalSummary: 'Move a compact camera smoothly under programmable control.',
      requirements: [
        ['motion', 'Motion', 'Smooth motorized travel'],
        ['payload', 'Camera payload', 'Compact camera'],
        ['control', 'Control', 'Programmable positions'],
        ['size', 'Size', 'Desktop scale'],
      ],
      missing: ['Travel distance', 'Axis count', 'Camera mass', 'Budget'],
    },
    'pick-and-place': {
      buildGoal: 'Desktop pick-and-place machine',
      goalSummary: 'Place small components accurately on a desktop work area.',
      requirements: [
        ['workspace', 'Workspace', 'Desktop footprint'],
        ['motion', 'Motion', 'Three-axis positioning'],
        ['tool', 'Tool', 'Vacuum pick head'],
        ['control', 'Control', 'Programmable placement jobs'],
      ],
      missing: ['Placement accuracy', 'Cycle time', 'Part size', 'Budget'],
    },
  } as const;
  const preset = presets[scenario];
  return {
    prototype: true,
    scenario,
    buildGoal: preset.buildGoal,
    goalSummary: preset.goalSummary,
    requirements: [...preset.requirements.map(([key, label, value]) => ({ key, label, value, source: 'text' as const })), ...documentRequirements(documentObservations)],
    missingDecisions: [...preset.missing],
    mediaObservations,
    documentObservations,
  };
}

const relation = (source: string, target: string, kind: GeneratedEdgeKind): GeneratedRelation => ({ id: `${source}-${target}-${kind}`, source, target, kind });

function roverArchitecture(intent: PrototypeIntent, clarifications: ClarificationAnswers): PrototypeArchitecture {
  const artifacts: GeneratedArtifact[] = [
    { id: 'scratch-rover', label: 'Industrial Inspection Rover', category: 'overview', code: 'PRODUCT · REV A', meta: 'inspection-rover', x: 480, y: 0, revision: 'Rev A' },
    { id: 'scratch-chassis', label: 'Compact Chassis', category: 'mechanical', code: 'MECH · CONCEPT', meta: 'CHS-A0', x: 110, y: 170, revision: 'Rev A' },
    { id: 'scratch-drive', label: 'Dual-Wheel Drive', category: 'mechanical', code: 'MECH · SYSTEM', meta: 'DRV-SYS-A0', x: 120, y: 390 },
    { id: 'scratch-camera-mount', label: 'Modular Camera Mount', category: 'mechanical', code: 'MECH · CONCEPT', meta: 'CAM-MNT-A0', x: 830, y: 150 },
    { id: 'scratch-left-motor', label: 'Left Motor Placeholder', category: 'bom', code: 'BOM · TBD', meta: '24V · TORQUE TBD', x: 0, y: 590 },
    { id: 'scratch-right-motor', label: 'Right Motor Placeholder', category: 'bom', code: 'BOM · TBD', meta: '24V · TORQUE TBD', x: 205, y: 660 },
    { id: 'scratch-motor-controller', label: 'Motor Controller', category: 'pcb', code: 'PCB · CONCEPT', meta: 'MCTRL-A0', x: 365, y: 410 },
    { id: 'scratch-battery', label: '24V Battery Placeholder', category: 'bom', code: 'BOM · TBD', meta: '24V · CAPACITY TBD', x: 875, y: 565 },
    { id: 'scratch-pdb', label: 'Power Distribution', category: 'pcb', code: 'PCB · CONCEPT', meta: 'PDB-24V-A0', x: 690, y: 405 },
    { id: 'scratch-compute', label: 'Main Controller', category: 'pcb', code: 'PCB · CONCEPT', meta: 'COMPUTE-A0', x: 500, y: 190 },
    { id: 'scratch-camera', label: 'Camera Module Placeholder', category: 'bom', code: 'BOM · TBD', meta: 'CAMERA · TBD', x: 1010, y: 315 },
    { id: 'scratch-motor-fw', label: 'Motor Control Firmware', category: 'firmware', code: 'FW · PROTOTYPE', meta: 'motor_control.c', x: 410, y: 675 },
    { id: 'scratch-nav-fw', label: 'Navigation Firmware', category: 'firmware', code: 'FW · PROTOTYPE', meta: 'navigation.py', x: 610, y: 760 },
    { id: 'scratch-assembly', label: 'Prototype Assembly', category: 'manufacturing', code: 'MFG · DRAFT', meta: 'ROUTE-A0', x: 590, y: 930 },
    { id: 'scratch-drive-test', label: 'Drive Validation Placeholder', category: 'tests', code: 'TEST · DRAFT', meta: 'T-DRIVE-A0', x: 285, y: 900 },
  ];
  intent.documentObservations.forEach((document, index) => artifacts.push({
    id: `document-${document.sourceId}`,
    label: document.title,
    category: 'documents',
    code: 'DOC · LOCAL',
    meta: document.sourceName,
    x: 20 + index * 190,
    y: 1110,
    revision: 'Rev A',
  }));
  const relations: GeneratedRelation[] = [
    relation('scratch-rover', 'scratch-chassis', 'contains'),
    relation('scratch-rover', 'scratch-compute', 'contains'),
    relation('scratch-rover', 'scratch-camera-mount', 'contains'),
    relation('scratch-rover', 'scratch-assembly', 'depends'),
    relation('scratch-chassis', 'scratch-drive', 'contains'),
    relation('scratch-drive', 'scratch-left-motor', 'contains'),
    relation('scratch-drive', 'scratch-right-motor', 'contains'),
    relation('scratch-motor-controller', 'scratch-left-motor', 'drives'),
    relation('scratch-motor-controller', 'scratch-right-motor', 'drives'),
    relation('scratch-compute', 'scratch-motor-controller', 'drives'),
    relation('scratch-pdb', 'scratch-motor-controller', 'routes'),
    relation('scratch-pdb', 'scratch-battery', 'depends'),
    relation('scratch-camera-mount', 'scratch-camera', 'contains'),
    relation('scratch-compute', 'scratch-camera', 'depends'),
    relation('scratch-motor-fw', 'scratch-motor-controller', 'drives'),
    relation('scratch-nav-fw', 'scratch-motor-fw', 'depends'),
    relation('scratch-nav-fw', 'scratch-camera', 'depends'),
    relation('scratch-drive-test', 'scratch-drive', 'validated'),
    relation('scratch-assembly', 'scratch-chassis', 'depends'),
  ];
  intent.documentObservations.forEach((document) => relations.push(relation('scratch-left-motor', `document-${document.sourceId}`, 'sourced')));
  return {
    prototype: true,
    name: intent.buildGoal,
    slug: 'inspection-rover-a',
    assumptions: ['24 V electrical architecture', 'Dual-wheel differential drive', `${intent.requirements.find((item) => item.key === 'payload')?.value ?? '20 lb'} payload target`, 'Modular camera mount', clarifications.terrain],
    artifacts,
    relations,
    nextDecision: {
      title: 'Choose a drive system',
      description: 'This choice sets the first motor, controller, battery, and runtime assumptions.',
      options: [
        { id: 'balanced', label: 'Balanced', description: 'Good payload and runtime for mixed industrial use.' },
        { id: 'high-torque', label: 'High Torque', description: 'More carrying capacity with slightly lower runtime.' },
        { id: 'efficiency', label: 'Efficiency', description: 'Longer runtime with a lower maximum payload.' },
      ],
    },
    prototypeChecks: [],
    openCad: { connected: false, note: 'OpenCAD is not connected; no CAD geometry was generated.' },
  };
}

function compactArchitecture(intent: PrototypeIntent, clarifications: ClarificationAnswers): PrototypeArchitecture {
  const rootId = `scratch-${intent.scenario}`;
  const scenarioParts = {
    'air-monitor': ['Portable Enclosure', 'Battery', 'Main Controller', 'Air Sensor Array', 'Local Display', 'Logging Firmware'],
    'camera-platform': ['Desktop Frame', 'Motion Axis', 'Drive Motor', 'Motor Controller', 'Camera Mount', 'Motion Firmware'],
    'pick-and-place': ['Machine Frame', 'XYZ Motion System', 'Stepper Motors', 'Motion Controller', 'Vacuum Toolhead', 'Placement Firmware'],
  } as const;
  const categories: GeneratedArtifactCategory[] = ['mechanical', 'bom', 'pcb', 'bom', 'mechanical', 'firmware'];
  const parts = scenarioParts[intent.scenario as keyof typeof scenarioParts] ?? scenarioParts['camera-platform'];
  const artifacts: GeneratedArtifact[] = [
    { id: rootId, label: intent.buildGoal, category: 'overview', code: 'PRODUCT · REV A', meta: intent.scenario, x: 470, y: 0, revision: 'Rev A' },
    ...parts.map((label, index) => ({ id: `${rootId}-${index + 1}`, label, category: categories[index], code: `${categories[index].toUpperCase()} · CONCEPT`, meta: `TBD-${String(index + 1).padStart(2, '0')}`, x: 80 + (index % 3) * 360, y: 220 + Math.floor(index / 3) * 330 })),
  ];
  intent.documentObservations.forEach((document, index) => artifacts.push({ id: `document-${document.sourceId}`, label: document.title, category: 'documents', code: 'DOC · LOCAL', meta: document.sourceName, x: 80 + index * 240, y: 850, revision: 'Rev A' }));
  const relations: GeneratedRelation[] = parts.map((_, index) => relation(rootId, `${rootId}-${index + 1}`, index > 2 ? 'depends' : 'contains'));
  intent.documentObservations.forEach((document) => relations.push(relation(rootId, `document-${document.sourceId}`, 'sourced')));
  return {
    prototype: true,
    name: intent.buildGoal,
    slug: `${intent.scenario}-a`,
    assumptions: ['Concept-level component placeholders', clarifications.priority, clarifications.budget, 'Interfaces remain to be selected'],
    artifacts,
    relations,
    nextDecision: {
      title: 'Choose the primary component strategy',
      description: 'Select the first tradeoff to resolve before assigning specific components.',
      options: [
        { id: 'balanced', label: 'Balanced', description: 'Keep performance, cost, and size near the current assumptions.' },
        { id: 'performance', label: 'Performance', description: 'Prioritize capability even if cost and power increase.' },
        { id: 'compact', label: 'Compact', description: 'Prioritize size and portability over peak capability.' },
      ],
    },
    prototypeChecks: [],
    openCad: { connected: false, note: 'OpenCAD is not connected; no CAD geometry was generated.' },
  };
}

export const newBuildPrototypeAdapter: NewBuildPrototypeAdapter = {
  inferenceConnected: false,
  openCadConnected: false,
  async analyzeImage(source) {
    await wait(120);
    const observation = await mockFormaInferenceProvider.observeMedia({ sourceId: source.id, kind: 'image', name: source.name, mimeType: source.mimeType });
    return { sourceId: source.id, kind: 'image', summary: observation.summary, inferenceConnected: false };
  },
  async analyzeVideo(source) {
    await wait(120);
    const observation = await mockFormaInferenceProvider.observeMedia({ sourceId: source.id, kind: 'video', name: source.name, mimeType: source.mimeType });
    return { sourceId: source.id, kind: 'video', summary: observation.summary, inferenceConnected: false };
  },
  async analyzeDocument(source) {
    await wait(140);
    const parsed = await mockFormaInferenceProvider.parseDocument({ sourceId: source.id, name: source.name, mimeType: source.mimeType });
    return {
      sourceId: source.id,
      sourceName: source.name,
      title: parsed.structured.title,
      artifactType: parsed.structured.artifactType,
      component: parsed.structured.component,
      partNumbers: parsed.structured.partNumbers,
      properties: parsed.structured.properties,
      mode: parsed.mode,
      inferencePerformed: parsed.inferencePerformed,
      parserRole: FORMA_MODEL_ROLES.parse,
      summary: parsed.summary,
    };
  },
  async analyzeIntent({ text, sources }) {
    const mediaSources = sources.filter((source): source is PrototypeInputSource & { kind: 'image' | 'video' } => source.kind === 'image' || source.kind === 'video');
    const documentSources = sources.filter((source) => source.kind === 'document');
    const [mediaObservations, documentObservations] = await Promise.all([
      Promise.all(mediaSources.map((source) => source.kind === 'image' ? this.analyzeImage(source) : this.analyzeVideo(source))),
      Promise.all(documentSources.map((source) => this.analyzeDocument(source))),
    ]);
    await wait(240);
    const scenario = detectScenario(text);
    const deterministicIntent = scenario === 'inspection-rover' ? roverIntent(text, mediaObservations, documentObservations) : scenarioIntent(scenario, mediaObservations, documentObservations);
    const routed = await mockFormaInferenceProvider.reason({
      objective: text,
      engineeringState: { sources: sources.map(({ id, kind, name, mimeType }) => ({ id, kind, name, mimeType })) },
      featureContract: { output: 'PrototypeIntent', prototype: true },
      mockResult: deterministicIntent,
    });
    return routed.structured;
  },
  async synthesizeArchitecture(intent, clarifications) {
    await wait(320);
    const deterministicArchitecture = intent.scenario === 'inspection-rover' ? roverArchitecture(intent, clarifications) : compactArchitecture(intent, clarifications);
    const routed = await mockFormaInferenceProvider.reason({
      objective: intent.goalSummary,
      engineeringState: { intent, clarifications },
      featureContract: { output: 'PrototypeArchitecture', prototype: true },
      mockResult: deterministicArchitecture,
    });
    const architecture = routed.structured;
    architecture.prototypeChecks = await this.validateDesign(architecture);
    architecture.openCad = await this.realizeWithOpenCAD(architecture);
    return architecture;
  },
  async validateDesign(architecture) {
    await wait(120);
    return [
      `${architecture.artifacts.length} concept artifacts have identifiers.`,
      `${architecture.relations.length} initial dependency relationships were created.`,
      'Specific part assignments and engineering calculations are still required.',
    ];
  },
  async realizeWithOpenCAD() {
    await wait(80);
    return { connected: false, note: 'OpenCAD is not connected; no CAD geometry was generated.' };
  },
};

export const analyzeIntent = newBuildPrototypeAdapter.analyzeIntent.bind(newBuildPrototypeAdapter);
export const analyzeImage = newBuildPrototypeAdapter.analyzeImage.bind(newBuildPrototypeAdapter);
export const analyzeVideo = newBuildPrototypeAdapter.analyzeVideo.bind(newBuildPrototypeAdapter);
export const analyzeDocument = newBuildPrototypeAdapter.analyzeDocument.bind(newBuildPrototypeAdapter);
export const synthesizeArchitecture = newBuildPrototypeAdapter.synthesizeArchitecture.bind(newBuildPrototypeAdapter);
export const validateDesign = newBuildPrototypeAdapter.validateDesign.bind(newBuildPrototypeAdapter);
export const realizeWithOpenCAD = newBuildPrototypeAdapter.realizeWithOpenCAD.bind(newBuildPrototypeAdapter);
