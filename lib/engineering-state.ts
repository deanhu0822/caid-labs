import type { AgentResponse, CorpusEvidence } from './corpus-types';
import { openCadAdapter, type OpenCadRealizationPlan } from './opencad-adapter';
import type { ScannerMatch } from './scanner-analysis';
import type { PrototypeBuildDefinition } from './new-build-adapter';

export type ExperienceMode = 'guided' | 'pro';
export type ProposalStatus = 'validated' | 'accepted' | 'rejected';
export type ValidationStatus = 'pass' | 'warn' | 'reject';

export type EngineeringConstraint = {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  source: 'guided' | 'pro' | 'scanner' | 'feedback';
};

export type ValidationCheck = {
  domain: 'Constraint' | 'Dependency' | 'Electrical' | 'Mechanical' | 'Manufacturing';
  status: ValidationStatus;
  message: string;
};

export type ArtifactMutation = {
  artifactId: string;
  before: string;
  after: string;
  reason: string;
};

export type EngineeringMetric = {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
};

export type EngineeringProposal = {
  id: string;
  objective: string;
  title: string;
  summary: string;
  why: string;
  tradeoff: string;
  nextAction: string;
  status: ProposalStatus;
  sourceTaskId: string | null;
  baseRevision: string;
  targetRevision: string;
  affectedArtifactIds: string[];
  changed: ArtifactMutation[];
  preservedArtifactIds: string[];
  artifactOverrides: Record<string, { label?: string; meta?: string }>;
  metrics: EngineeringMetric[];
  validation: ValidationCheck[];
  evidence: CorpusEvidence[];
  confidence: number;
  latencyMs: number;
  openCad: OpenCadRealizationPlan;
};

export type RevisionRecord = {
  id: string;
  date: string;
  title: string;
  changedArtifactIds: string[];
  preservedArtifactIds: string[];
  mutations: ArtifactMutation[];
  artifactOverrides: Record<string, { label?: string; meta?: string }>;
};

export type EngineeringProject =
  | { kind: 'existing'; id: 'rover-alpha'; name: 'Autonomous Inspection Rover' }
  | { kind: 'generated'; id: string; name: string; build: PrototypeBuildDefinition };

export type EngineeringState = {
  project: EngineeringProject;
  experienceMode: ExperienceMode;
  currentRevision: string;
  viewingRevision: string;
  selectedArtifactId: string;
  objective: string;
  constraints: EngineeringConstraint[];
  fixedArtifactIds: string[];
  focusArtifactIds: string[];
  proposal: EngineeringProposal | null;
  scannerObservation: ScannerMatch | null;
  artifactOverrides: Record<string, { label?: string; meta?: string }>;
  revisions: RevisionRecord[];
};

export type EngineeringAction =
  | { type: 'SET_EXPERIENCE'; mode: ExperienceMode }
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'SET_OBJECTIVE'; objective: string }
  | { type: 'SET_CONSTRAINT'; constraint: EngineeringConstraint }
  | { type: 'REMOVE_CONSTRAINT'; key: string }
  | { type: 'SET_FOCUS'; artifactIds: string[] }
  | { type: 'SET_PROPOSAL'; proposal: EngineeringProposal }
  | { type: 'ACCEPT_PROPOSAL' }
  | { type: 'SET_VIEWING_REVISION'; revision: string }
  | { type: 'SET_SCANNER_OBSERVATION'; observation: ScannerMatch }
  | { type: 'TOGGLE_FIXED_ARTIFACT'; artifactId: string }
  | { type: 'CREATE_NEW_BUILD'; build: PrototypeBuildDefinition }
  | { type: 'RESET_TO_EXISTING' };

const INITIAL_REVISIONS: RevisionRecord[] = [
  { id: 'Rev A', date: 'May 12', title: 'Architecture baseline', changedArtifactIds: ['main-board', 'power-board', 'chassis'], preservedArtifactIds: [], mutations: [], artifactOverrides: {} },
  { id: 'Rev B', date: 'Jun 04', title: 'Harness integration', changedArtifactIds: ['j12', 'j12-bom', 'cable-routing'], preservedArtifactIds: [], mutations: [], artifactOverrides: {} },
  { id: 'Rev C', date: 'Aug 18', title: 'DVT release', changedArtifactIds: ['j12', 'camera-module', 'battery', 'camera-service'], preservedArtifactIds: [], mutations: [], artifactOverrides: {} },
];

export const initialEngineeringState: EngineeringState = {
  project: { kind: 'existing', id: 'rover-alpha', name: 'Autonomous Inspection Rover' },
  experienceMode: 'pro',
  currentRevision: 'Rev C',
  viewingRevision: 'Rev C',
  selectedArtifactId: 'j12',
  objective: '',
  constraints: [],
  fixedArtifactIds: [],
  focusArtifactIds: [],
  proposal: null,
  scannerObservation: null,
  artifactOverrides: {},
  revisions: INITIAL_REVISIONS,
};

function nextRevision(revision: string) {
  const match = revision.match(/Rev\s+([A-Z])/i);
  const letter = match?.[1]?.toUpperCase() ?? 'C';
  return `Rev ${String.fromCharCode(Math.min(90, letter.charCodeAt(0) + 1))}`;
}

function createProposal(input: Omit<EngineeringProposal, 'id' | 'baseRevision' | 'targetRevision' | 'openCad'>, state: EngineeringState): EngineeringProposal {
  const changedArtifactIds = input.changed.map((change) => change.artifactId);
  return {
    ...input,
    id: `proposal-${Date.now()}`,
    baseRevision: state.currentRevision,
    targetRevision: nextRevision(state.currentRevision),
    openCad: openCadAdapter.planPhysicalRealization({ objective: input.objective, changedArtifactIds }),
  };
}

function payloadProposal(response: AgentResponse, state: EngineeringState): EngineeringProposal {
  const motorFixed = state.fixedArtifactIds.includes('motor-bom');
  if (motorFixed) {
    return createProposal({
      objective: response.question,
      title: 'Motor M2 conflicts with the 30% payload target',
      summary: 'Forma Labs kept the fixed Motor M2 and rejected the payload change because the two requirements conflict.',
      why: 'The current motor has 14% measured torque margin at 8 kg; the corpus does not contain a validated assignment that reaches 10.4 kg while retaining it.',
      tradeoff: 'Lower the payload target, release the fixed-motor constraint, or add a validated drivetrain option.',
      nextAction: 'Choose whether Motor M2 or the 30% payload target is the harder constraint.',
      status: 'rejected',
      sourceTaskId: response.matchedTask?.id ?? null,
      affectedArtifactIds: response.artifactIds,
      changed: [],
      preservedArtifactIds: ['motor-bom', 'chassis', 'camera-module', 'camera-service', 'battery-enclosure'],
      artifactOverrides: {},
      metrics: [
        { label: 'Payload target', value: '10.4 kg', tone: 'neutral' },
        { label: 'M2 torque margin', value: '14%', tone: 'negative' },
        { label: 'Mutation', value: 'Blocked', tone: 'negative' },
      ],
      validation: [
        { domain: 'Constraint', status: 'reject', message: 'Fixed Motor M2 conflicts with the validated payload assignment.' },
        { domain: 'Dependency', status: 'pass', message: 'Motor observation remains attached to the product graph.' },
        { domain: 'Electrical', status: 'warn', message: 'No higher-torque current profile can be validated while Motor M2 is fixed.' },
        { domain: 'Mechanical', status: 'pass', message: 'Current motor housing and chassis remain unchanged.' },
        { domain: 'Manufacturing', status: 'pass', message: 'No build documents mutate for a rejected proposal.' },
      ],
      evidence: response.evidence,
      confidence: response.confidence,
      latencyMs: response.latencyMs,
    }, state);
  }

  return createProposal({
    objective: response.question,
    title: 'Upgrade Motor M2 to M4',
    summary: 'The rover reaches the 10.4 kg target through a minimal drivetrain and controls update while preserving the released chassis and camera system.',
    why: 'MTR-24-290 provides the required torque increase and is currently available in the synthetic supplier record.',
    tradeoff: 'Peak current rises 18%, mass rises 120 g, BOM cost rises $31.40, and estimated runtime decreases 11%.',
    nextAction: 'Accept the validated change to create the next product revision.',
    status: 'validated',
    sourceTaskId: response.matchedTask?.id ?? null,
    affectedArtifactIds: response.artifactIds,
    changed: [
      { artifactId: 'motor-bom', before: 'MTR-24-220 (M2)', after: 'MTR-24-290 (M4)', reason: 'Required torque for 10.4 kg payload.' },
      { artifactId: 'motor-controller', before: 'MCTRL-8A', after: 'MCTRL-D1 / 10 A', reason: 'Support the higher motor-current envelope.' },
      { artifactId: 'motor-driver', before: 'DRV-8A', after: 'DRV-10A', reason: 'Match the proposed controller channel.' },
      { artifactId: 'power-board', before: '10 A branch protection', after: '12 A branch protection', reason: 'Protect the revised motor branch.' },
      { artifactId: 'motor-control', before: '8.0 A firmware limit', after: '9.2 A firmware limit', reason: 'Apply the validated current ceiling.' },
    ],
    preservedArtifactIds: ['chassis', 'camera-module', 'camera-mount', 'camera-service', 'battery-enclosure', 'navigation'],
    artifactOverrides: {
      'motor-bom': { label: '24V Motor M4', meta: 'MTR-24-290' },
      'motor-controller': { meta: 'MCTRL-D1 · 10A' },
      'motor-driver': { meta: 'DRV-10A' },
      'power-board': { meta: 'PDB-24V · 12A' },
      'motor-control': { meta: 'motor_ctrl.c · 9.2A' },
    },
    metrics: [
      { label: 'Torque', value: '+32%', tone: 'positive' },
      { label: 'Peak current', value: '+18%', tone: 'negative' },
      { label: 'Mass', value: '+120 g', tone: 'negative' },
      { label: 'BOM delta', value: '+$31.40', tone: 'negative' },
      { label: 'Runtime', value: '-11%', tone: 'negative' },
    ],
    validation: [
      { domain: 'Constraint', status: 'pass', message: '10.4 kg payload target achieved.' },
      { domain: 'Dependency', status: 'pass', message: 'Nine affected graph objects traced; unrelated camera objects preserved.' },
      { domain: 'Electrical', status: 'pass', message: '9.2 A limit remains below the proposed 10 A controller ceiling.' },
      { domain: 'Mechanical', status: 'pass', message: 'Motor envelope fits the current housing and chassis.' },
      { domain: 'Manufacturing', status: 'warn', message: 'WI-082, BOM, and motor/power tests must be revised.' },
    ],
    evidence: response.evidence,
    confidence: response.confidence,
    latencyMs: response.latencyMs,
  }, state);
}

function runtimeProposal(response: AgentResponse, state: EngineeringState): EngineeringProposal {
  return createProposal({
    objective: response.question,
    title: 'Increase battery capacity to 18 Ah',
    summary: 'A larger pack reaches four hours, but a local battery-cage and chassis extension is required.',
    why: 'BAT-24-18 supplies 432 Wh, matching the runtime objective without changing the mission duty cycle.',
    tradeoff: 'The pack adds 1.1 kg and does not fit the current enclosure.',
    nextAction: 'Approve the enclosure handoff for OpenCAD and rerun payload and power validation.',
    status: 'validated',
    sourceTaskId: response.matchedTask?.id ?? null,
    affectedArtifactIds: response.artifactIds,
    changed: [
      { artifactId: 'battery', before: 'BAT-24-12', after: 'BAT-24-18', reason: 'Supply the required 432 Wh.' },
      { artifactId: 'battery-enclosure', before: 'BAT-CAGE-03', after: 'BAT-CAGE-D1', reason: 'Fit the longer battery envelope.' },
      { artifactId: 'chassis', before: 'CHS-240 C3', after: 'CHS-240 D1', reason: 'Provide local cage clearance.' },
      { artifactId: 'battery-mgmt', before: '12 Ah profile', after: '18 Ah profile', reason: 'Track revised pack capacity.' },
    ],
    preservedArtifactIds: ['motor-bom', 'motor-controller', 'camera-module', 'main-board', 'j12'],
    artifactOverrides: {
      battery: { meta: '24V · 18AH' },
      'battery-enclosure': { meta: 'BAT-CAGE-D1' },
      chassis: { meta: 'CHS-240 · D1' },
      'battery-mgmt': { meta: 'bms.c · 18AH' },
    },
    metrics: [
      { label: 'Runtime', value: '4.0 h', tone: 'positive' },
      { label: 'Energy', value: '432 Wh', tone: 'positive' },
      { label: 'Mass', value: '+1.1 kg', tone: 'negative' },
      { label: 'Cage', value: 'D1', tone: 'neutral' },
    ],
    validation: [
      { domain: 'Constraint', status: 'pass', message: 'Four-hour runtime target is met at the current duty cycle.' },
      { domain: 'Dependency', status: 'pass', message: 'Battery, enclosure, chassis, BMS, and power test are isolated.' },
      { domain: 'Electrical', status: 'pass', message: '24 V system architecture is preserved.' },
      { domain: 'Mechanical', status: 'warn', message: 'Existing BAT-CAGE-03 does not fit; a D1 geometry change is required.' },
      { domain: 'Manufacturing', status: 'warn', message: 'BOM and installation instructions require revision.' },
    ],
    evidence: response.evidence,
    confidence: response.confidence,
    latencyMs: response.latencyMs,
  }, state);
}

export function proposalFromAgent(response: AgentResponse, state: EngineeringState): EngineeringProposal {
  if (response.matchedTask?.id === 'BLD-001' || /payload/i.test(response.question)) return payloadProposal(response, state);
  if (response.matchedTask?.id === 'BLD-002' || /runtime|battery life/i.test(response.question)) return runtimeProposal(response, state);
  if (response.matchedTask?.id === 'BLD-003' || /j12|connector/i.test(response.question)) return j12ChangeProposal(state, response);

  const changed = response.artifactIds.slice(0, 4).map((artifactId) => ({ artifactId, before: 'Current assignment', after: 'Candidate assignment', reason: 'Objective-relevant corpus evidence.' }));
  return createProposal({
    objective: response.question,
    title: response.matchedTask?.prompt ?? 'Review the retrieved engineering candidate',
    summary: response.answer,
    why: 'The candidate is limited to objects returned by the objective-driven corpus query.',
    tradeoff: 'This retrieval does not yet match a fully validated scenario.',
    nextAction: 'Review the evidence and add explicit constraints before accepting a mutation.',
    status: response.mode === 'ground-truth' ? 'validated' : 'rejected',
    sourceTaskId: response.matchedTask?.id ?? null,
    affectedArtifactIds: response.artifactIds,
    changed,
    preservedArtifactIds: [],
    artifactOverrides: {},
    metrics: [
      { label: 'Confidence', value: `${Math.round(response.confidence * 100)}%`, tone: 'neutral' },
      { label: 'Affected', value: String(response.artifactIds.length), tone: 'neutral' },
    ],
    validation: [
      { domain: 'Constraint', status: response.mode === 'ground-truth' ? 'pass' : 'reject', message: response.mode === 'ground-truth' ? 'Validated corpus scenario matched.' : 'No validated scenario exactly matches this intent.' },
      { domain: 'Dependency', status: 'pass', message: `${response.artifactIds.length} relevant objects were traced.` },
      { domain: 'Electrical', status: 'warn', message: 'Review cited electrical evidence.' },
      { domain: 'Mechanical', status: 'warn', message: 'Review cited mechanical evidence.' },
      { domain: 'Manufacturing', status: 'warn', message: 'Manufacturing approval remains pending.' },
    ],
    evidence: response.evidence,
    confidence: response.confidence,
    latencyMs: response.latencyMs,
  }, state);
}

export function j12ChangeProposal(state: EngineeringState, response?: AgentResponse): EngineeringProposal {
  return createProposal({
    objective: 'Replace the unavailable J12 connector with a compatible alternate.',
    title: 'Replace J12 with NSI-MF4-LK',
    summary: 'The alternate is electrically compatible, but the smallest coherent change also touches the PCB footprint, chassis clearance, BOM, work instruction, and QA adapter.',
    why: 'The current Molex allocation is unavailable; the synthetic alternate has 560 units and a nine-day lead.',
    tradeoff: 'Mounting pegs differ and the latch needs 2 mm of additional chassis clearance.',
    nextAction: 'Accept the controlled D1 change or keep J12 fixed and resolve supply allocation.',
    status: 'validated',
    sourceTaskId: response?.matchedTask?.id ?? 'SUP-001',
    affectedArtifactIds: ['j12', 'main-board', 'chassis', 'j12-bom', 'cable-routing', 'qa-fixture'],
    changed: [
      { artifactId: 'j12', before: 'Molex 43025-0400', after: 'NSI-MF4-LK', reason: 'Available electrically compatible alternate.' },
      { artifactId: 'main-board', before: 'MF3_2x2_RA_C footprint', after: 'MF4-LK D1 footprint', reason: 'Mounting peg geometry differs.' },
      { artifactId: 'chassis', before: 'CHS-240 C3 opening', after: 'CHS-240 D1 +2 mm', reason: 'Clear the alternate latch.' },
      { artifactId: 'j12-bom', before: '43025-0400', after: 'NSI-MF4-LK', reason: 'Revise the controlled purchase line.' },
      { artifactId: 'cable-routing', before: 'WI-114 C', after: 'WI-114 D1', reason: 'Update mating and routing procedure.' },
      { artifactId: 'qa-fixture', before: 'QA-FIX-C', after: 'QA-FIX-D1 adapter', reason: 'Validate the alternate connector.' },
    ],
    preservedArtifactIds: ['motor-bom', 'motor-controller', 'battery', 'camera-module', 'camera-service', 'navigation'],
    artifactOverrides: {
      j12: { label: 'J12 Connector · Alternate', meta: 'NSI-MF4-LK' },
      'main-board': { meta: 'MCB-D1' },
      chassis: { meta: 'CHS-240 · D1' },
      'j12-bom': { label: 'J12 Alternate Connector', meta: 'NSI-MF4-LK' },
      'cable-routing': { meta: 'WI-114 · D1' },
      'qa-fixture': { meta: 'QA-FIX-D1' },
    },
    metrics: [
      { label: 'Available', value: '560', tone: 'positive' },
      { label: 'Lead time', value: '9 days', tone: 'positive' },
      { label: 'Unit cost', value: '$0.71', tone: 'positive' },
      { label: 'Clearance', value: '+2 mm', tone: 'negative' },
    ],
    validation: [
      { domain: 'Constraint', status: 'pass', message: 'Available stock satisfies the replacement objective.' },
      { domain: 'Dependency', status: 'pass', message: 'Six directly affected objects are isolated.' },
      { domain: 'Electrical', status: 'pass', message: 'Four-pin net mapping remains compatible.' },
      { domain: 'Mechanical', status: 'warn', message: 'PCB pegs and chassis latch clearance require D1 geometry.' },
      { domain: 'Manufacturing', status: 'warn', message: 'WI-114 and QA-FIX-C require controlled updates.' },
    ],
    evidence: response?.evidence ?? [],
    confidence: response?.confidence ?? 0.94,
    latencyMs: response?.latencyMs ?? 0,
  }, state);
}

export function engineeringReducer(state: EngineeringState, action: EngineeringAction): EngineeringState {
  switch (action.type) {
    case 'CREATE_NEW_BUILD': {
      const changedArtifactIds = action.build.architecture.artifacts.map((artifact) => artifact.id);
      const revision: RevisionRecord = {
        id: 'Rev A',
        date: action.build.createdAtLabel,
        title: 'Initial product architecture',
        changedArtifactIds,
        preservedArtifactIds: [],
        mutations: [],
        artifactOverrides: {},
      };
      const extractedConstraints: EngineeringConstraint[] = action.build.intent.requirements.map((requirement) => ({
        key: `intent:${requirement.key}`,
        label: requirement.label,
        value: requirement.value,
        source: 'guided',
      }));
      const clarificationConstraints: EngineeringConstraint[] = [
        { key: 'terrain', label: 'Operating surface', value: action.build.clarifications.terrain, source: 'guided' },
        { key: 'priority', label: 'Design priority', value: action.build.clarifications.priority, source: 'guided' },
        { key: 'budget', label: 'Budget target', value: action.build.clarifications.budget, source: 'guided' },
      ];
      return {
        ...initialEngineeringState,
        project: { kind: 'generated', id: action.build.id, name: action.build.displayName, build: action.build },
        experienceMode: 'guided',
        currentRevision: 'Rev A',
        viewingRevision: 'Rev A',
        selectedArtifactId: action.build.architecture.artifacts[0]?.id ?? 'scratch-product',
        objective: action.build.intent.goalSummary,
        constraints: [...extractedConstraints, ...clarificationConstraints],
        focusArtifactIds: action.build.architecture.artifacts.slice(0, 6).map((artifact) => artifact.id),
        revisions: [revision],
      };
    }
    case 'RESET_TO_EXISTING':
      return { ...initialEngineeringState, experienceMode: state.experienceMode };
    case 'SET_EXPERIENCE':
      return { ...state, experienceMode: action.mode };
    case 'SELECT_ARTIFACT':
      return { ...state, selectedArtifactId: action.artifactId };
    case 'SET_OBJECTIVE':
      return { ...state, objective: action.objective };
    case 'SET_CONSTRAINT': {
      const constraints = state.constraints.filter((constraint) => constraint.key !== action.constraint.key);
      return { ...state, constraints: [...constraints, action.constraint] };
    }
    case 'REMOVE_CONSTRAINT':
      return { ...state, constraints: state.constraints.filter((constraint) => constraint.key !== action.key) };
    case 'SET_FOCUS':
      return { ...state, focusArtifactIds: action.artifactIds };
    case 'SET_PROPOSAL':
      return {
        ...state,
        objective: action.proposal.objective,
        proposal: action.proposal,
        focusArtifactIds: action.proposal.affectedArtifactIds,
        viewingRevision: state.currentRevision,
      };
    case 'ACCEPT_PROPOSAL': {
      if (!state.proposal || state.proposal.status !== 'validated') return state;
      const accepted = { ...state.proposal, status: 'accepted' as const };
      const revision: RevisionRecord = {
        id: accepted.targetRevision,
        date: 'Now',
        title: accepted.title,
        changedArtifactIds: accepted.changed.map((change) => change.artifactId),
        preservedArtifactIds: accepted.preservedArtifactIds,
        mutations: accepted.changed,
        artifactOverrides: { ...state.artifactOverrides, ...accepted.artifactOverrides },
      };
      return {
        ...state,
        currentRevision: accepted.targetRevision,
        viewingRevision: accepted.targetRevision,
        proposal: accepted,
        artifactOverrides: { ...state.artifactOverrides, ...accepted.artifactOverrides },
        focusArtifactIds: revision.changedArtifactIds,
        revisions: [...state.revisions.filter((item) => item.id !== revision.id), revision],
      };
    }
    case 'SET_VIEWING_REVISION':
      return { ...state, viewingRevision: action.revision };
    case 'SET_SCANNER_OBSERVATION':
      return {
        ...state,
        scannerObservation: action.observation,
        selectedArtifactId: action.observation.artifactId,
        focusArtifactIds: [action.observation.artifactId],
      };
    case 'TOGGLE_FIXED_ARTIFACT': {
      const fixed = state.fixedArtifactIds.includes(action.artifactId)
        ? state.fixedArtifactIds.filter((id) => id !== action.artifactId)
        : [...state.fixedArtifactIds, action.artifactId];
      const observedLabel = action.artifactId === state.scannerObservation?.artifactId ? state.scannerObservation.label : action.artifactId;
      const constraints = state.constraints.filter((constraint) => constraint.key !== `fixed:${action.artifactId}`);
      if (!fixed.includes(action.artifactId)) return { ...state, fixedArtifactIds: fixed, constraints };
      return {
        ...state,
        fixedArtifactIds: fixed,
        constraints: [...constraints, { key: `fixed:${action.artifactId}`, label: 'Keep component', value: observedLabel, source: 'scanner' }],
      };
    }
    default:
      return state;
  }
}
