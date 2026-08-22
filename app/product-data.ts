export type Category =
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

export type EdgeKind =
  | 'contains'
  | 'routes'
  | 'drives'
  | 'sourced'
  | 'validated'
  | 'depends'
  | 'changed';

export type Artifact = {
  id: string;
  label: string;
  category: Category;
  code: string;
  meta: string;
  x: number;
  y: number;
  revision?: string;
};

export type Relation = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
};

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  overview: { label: 'Overview', color: '#9aa8c7' },
  mechanical: { label: 'Mechanical', color: '#e2aa45' },
  pcb: { label: 'PCB / Electrical', color: '#2ac9d6' },
  firmware: { label: 'Firmware', color: '#55d79b' },
  bom: { label: 'BOM', color: '#ff7861' },
  manufacturing: { label: 'Manufacturing', color: '#e875b8' },
  suppliers: { label: 'Suppliers', color: '#6eb8f0' },
  tests: { label: 'Tests', color: '#a989e9' },
  agents: { label: 'Agents', color: '#adff5b' },
  documents: { label: 'Documents', color: '#8da5d8' },
};

export const EDGE_META: Record<EdgeKind, { label: string; color: string }> = {
  contains: { label: 'Contains', color: '#67738e' },
  routes: { label: 'Routes to', color: '#e2aa45' },
  drives: { label: 'Drives / Controls', color: '#55d79b' },
  sourced: { label: 'Sourced from', color: '#6eb8f0' },
  validated: { label: 'Validated by', color: '#a989e9' },
  depends: { label: 'Depends on', color: '#ff7861' },
  changed: { label: 'Changed by', color: '#adff5b' },
};

export const ARTIFACTS: Artifact[] = [
  { id: 'rover', label: 'Autonomous Inspection Rover', category: 'overview', code: 'PRODUCT · REV C', meta: 'rover-alpha', x: 470, y: 0 },
  { id: 'chassis', label: 'Chassis', category: 'mechanical', code: 'MECH · ASM', meta: 'CHS-240', x: 135, y: 175 },
  { id: 'left-wheel', label: 'Left Wheel Assembly', category: 'mechanical', code: 'MECH · ASM', meta: 'WHL-L-04', x: 0, y: 335 },
  { id: 'right-wheel', label: 'Right Wheel Assembly', category: 'mechanical', code: 'MECH · ASM', meta: 'WHL-R-04', x: 88, y: 515 },
  { id: 'camera-mount', label: 'Camera Mount', category: 'mechanical', code: 'MECH · STEP', meta: 'CAM-MNT-C', x: 805, y: 105 },
  { id: 'battery-enclosure', label: 'Battery Enclosure', category: 'mechanical', code: 'MECH · STEP', meta: 'BAT-CAGE-03', x: 925, y: 500 },
  { id: 'motor-housing', label: 'Motor Housing', category: 'mechanical', code: 'MECH · STEP', meta: 'MTR-HSG-04', x: 190, y: 705 },
  { id: 'main-board', label: 'Main Control Board', category: 'pcb', code: 'PCB · KICAD', meta: 'MCB-C4', x: 440, y: 150 },
  { id: 'motor-controller', label: 'Motor Controller', category: 'pcb', code: 'PCB · ALTIUM', meta: 'MCTRL-8A', x: 465, y: 430 },
  { id: 'power-board', label: 'Power Distribution Board', category: 'pcb', code: 'PCB · KICAD', meta: 'PDB-24V', x: 740, y: 325 },
  { id: 'j12', label: 'J12 Connector', category: 'pcb', code: 'PART · CONNECTOR', meta: 'MOLEX · 4-PIN', x: 255, y: 335, revision: 'Rev C' },
  { id: 'motor-control', label: 'Motor Control', category: 'firmware', code: 'FW · GIT', meta: 'motor_ctrl.c', x: 440, y: 650 },
  { id: 'camera-service', label: 'Camera Service', category: 'firmware', code: 'FW · GIT', meta: 'camera.rs', x: 825, y: 255 },
  { id: 'battery-mgmt', label: 'Battery Management', category: 'firmware', code: 'FW · GIT', meta: 'bms.c', x: 800, y: 690 },
  { id: 'navigation', label: 'Navigation Firmware', category: 'firmware', code: 'FW · GIT', meta: 'nav-stack', x: 590, y: 790 },
  { id: 'j12-bom', label: 'J12 Molex Connector', category: 'bom', code: 'BOM · LINE 27', meta: '43025-0400', x: 25, y: 165, revision: 'Rev C' },
  { id: 'motor-bom', label: '24V Motor', category: 'bom', code: 'BOM · LINE 18', meta: 'MTR-24-220', x: 15, y: 690 },
  { id: 'camera-module', label: 'Camera Module', category: 'bom', code: 'BOM · LINE 09', meta: 'CM-4K-R2', x: 1030, y: 150, revision: 'Rev C' },
  { id: 'battery', label: 'Li-ion Battery', category: 'bom', code: 'BOM · LINE 04', meta: '24V · 12AH', x: 1015, y: 645, revision: 'Rev C' },
  { id: 'motor-driver', label: 'Motor Driver', category: 'bom', code: 'BOM · LINE 22', meta: 'DRV-8A', x: 635, y: 535 },
  { id: 'final-assembly', label: 'Final Assembly', category: 'manufacturing', code: 'MFG · ROUTE', meta: 'ROUTE-08', x: 585, y: 930 },
  { id: 'cable-routing', label: 'Cable Routing', category: 'manufacturing', code: 'MFG · WORK INST', meta: 'WI-114', x: 90, y: 420 },
  { id: 'motor-install', label: 'Motor Installation', category: 'manufacturing', code: 'MFG · WORK INST', meta: 'WI-082', x: 235, y: 875 },
  { id: 'qa-fixture', label: 'Final QA Fixture', category: 'manufacturing', code: 'MFG · FIXTURE', meta: 'QA-FIX-C', x: 60, y: 585 },
  { id: 'molex', label: 'Molex', category: 'suppliers', code: 'SUPPLIER', meta: 'AVL · PRIMARY', x: 0, y: 25 },
  { id: 'motor-supplier', label: 'Motion Dynamics', category: 'suppliers', code: 'SUPPLIER', meta: 'AVL · PRIMARY', x: 0, y: 855 },
  { id: 'camera-supplier', label: 'Basler', category: 'suppliers', code: 'SUPPLIER', meta: 'AVL · PRIMARY', x: 1045, y: 0 },
  { id: 'motor-load-test', label: 'Motor Load Test', category: 'tests', code: 'TEST · RIG', meta: 'T-MTR-08', x: 385, y: 890 },
  { id: 'power-test', label: 'Power Test', category: 'tests', code: 'TEST · BENCH', meta: 'T-PWR-24', x: 815, y: 865 },
  { id: 'camera-cal', label: 'Camera Calibration', category: 'tests', code: 'TEST · CAL', meta: 'T-CAM-12', x: 1040, y: 325 },
  { id: 'final-qa', label: 'Final QA', category: 'tests', code: 'TEST · ROUTE', meta: 'T-FINAL-C', x: 990, y: 850 },
  { id: 'product-agent', label: 'Product Agent', category: 'agents', code: 'AGENT · LOCAL', meta: 'dependency reasoning', x: 755, y: 1010 },
  { id: 'supply-agent', label: 'Supply Agent', category: 'agents', code: 'AGENT · LOCAL', meta: 'availability watch', x: 1010, y: 1010 },
  { id: 'build-agent', label: 'Build Agent', category: 'agents', code: 'AGENT · LOCAL', meta: 'assembly reasoning', x: 245, y: 1040 },
  { id: 'motor-m4-datasheet', label: 'Motor M4 Datasheet', category: 'documents', code: 'DOC · PDF', meta: 'motor_M4_datasheet.pdf', x: 5, y: 1045, revision: 'Rev C' },
];

const r = (source: string, target: string, kind: EdgeKind): Relation => ({ id: `${source}-${target}-${kind}`, source, target, kind });

export const RELATIONS: Relation[] = [
  r('rover', 'chassis', 'contains'), r('rover', 'main-board', 'contains'), r('rover', 'camera-mount', 'contains'), r('rover', 'final-assembly', 'depends'),
  r('chassis', 'left-wheel', 'contains'), r('chassis', 'right-wheel', 'contains'), r('chassis', 'battery-enclosure', 'contains'), r('chassis', 'motor-housing', 'contains'),
  r('main-board', 'j12', 'contains'), r('main-board', 'motor-controller', 'contains'), r('main-board', 'power-board', 'contains'),
  r('j12', 'chassis', 'routes'), r('j12', 'motor-control', 'drives'), r('j12', 'j12-bom', 'depends'), r('j12', 'qa-fixture', 'validated'),
  r('j12-bom', 'molex', 'sourced'), r('cable-routing', 'j12', 'depends'),
  r('motor-controller', 'motor-control', 'drives'), r('motor-controller', 'motor-driver', 'depends'), r('motor-control', 'motor-bom', 'drives'),
  r('motor-bom', 'motor-supplier', 'sourced'), r('motor-install', 'motor-bom', 'depends'), r('motor-housing', 'motor-bom', 'contains'),
  r('motor-bom', 'motor-m4-datasheet', 'sourced'),
  r('power-board', 'battery-mgmt', 'drives'), r('power-board', 'battery', 'depends'), r('battery-enclosure', 'battery', 'contains'),
  r('camera-mount', 'camera-module', 'contains'), r('camera-service', 'camera-module', 'depends'), r('camera-module', 'camera-supplier', 'sourced'),
  r('navigation', 'motor-control', 'depends'), r('navigation', 'camera-service', 'depends'),
  r('final-assembly', 'cable-routing', 'depends'), r('final-assembly', 'motor-install', 'depends'),
  r('motor-load-test', 'motor-bom', 'validated'), r('power-test', 'power-board', 'validated'), r('camera-cal', 'camera-module', 'validated'), r('final-qa', 'final-assembly', 'validated'),
  r('main-board', 'product-agent', 'changed'), r('j12-bom', 'supply-agent', 'changed'), r('final-assembly', 'build-agent', 'changed'),
];

export const J12_BLAST = ['j12', 'main-board', 'chassis', 'j12-bom', 'molex', 'motor-control', 'qa-fixture'];
export const BUILDER_BLAST = ['motor-bom', 'motor-controller', 'battery', 'battery-mgmt', 'motor-control', 'motor-driver'];

export const REVISION_CHANGES: Record<string, string[]> = {
  'Rev A': ['main-board', 'power-board', 'chassis'],
  'Rev B': ['j12', 'j12-bom', 'cable-routing'],
  'Rev C': ['j12', 'camera-module', 'battery', 'camera-service'],
};

export const DETAIL_OVERRIDES: Record<string, Record<string, string>> = {
  j12: {
    Type: 'Electrical Connector', Revision: 'Rev C', Part: 'Molex Micro-Fit 3.0', Pins: '4', Net: '24V Motor Power', Supplier: 'Molex', Stock: '1,248 · LOW', 'Lead Time': '14 days', 'Unit Cost': '$0.84',
  },
  'main-board': { Type: 'Printed Circuit Board', Revision: 'C4', Owner: 'Electrical', Layers: '6', Status: 'Released' },
  chassis: { Type: 'Mechanical Assembly', Revision: 'C3', Material: '6061-T6 Aluminum', Mass: '2.4 kg', Status: 'Released' },
  'motor-bom': { Type: 'Purchased Part', Revision: 'B', Supplier: 'Motion Dynamics', Stock: '384', 'Unit Cost': '$42.10' },
  'motor-m4-datasheet': { Type: 'Engineering Document', Revision: 'Rev C', File: 'motor_M4_datasheet.pdf', Status: 'Prototype document interpretation', Parser: 'Future · Nemotron Parse 2.0' },
};

export const IMPACT_ITEMS = [
  ['Mechanical', 'Rear chassis opening requires +2 mm clearance'],
  ['PCB', 'Footprint and keep-out zone change'],
  ['Firmware', 'Pin mapping remains compatible'],
  ['BOM', 'New supplier part and line revision required'],
  ['Manufacturing', 'Cable installation procedure changes'],
  ['QA', 'Fixture connector needs replacement'],
];

export const BUILDER_SUGGESTIONS = [
  'Reduce weight by 10%',
  'Increase payload capacity',
  'Replace an unavailable motor',
  'Reduce manufacturing cost',
  'Improve battery runtime',
];
