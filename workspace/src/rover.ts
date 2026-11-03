export type Revision = 'C' | 'D';
export type Part = { id: string; label: string; category: string; code: string; x: number; y: number; details: [string, string][] };
// A smaller view of the illustrative rover in the supplied recording and caid-labs product-data.ts.
export const PARTS: Part[] = [
  { id: 'rover', label: 'Inspection Rover', category: 'Product', code: 'rover-alpha', x: 345, y: 30, details: [['Purpose', 'Autonomous inspection'], ['Project', 'rover-alpha'], ['Data', 'Illustrative sample']] },
  { id: 'chassis', label: 'Chassis', category: 'Mechanical', code: 'CHS-240', x: 65, y: 175, details: [['Material', '6061-T6 aluminum'], ['Mass', '2.4 kg'], ['Change', 'Keep current chassis']] },
  { id: 'main-board', label: 'Main Control Board', category: 'Electrical', code: 'MCB-C4', x: 345, y: 175, details: [['Layers', '6'], ['Revision', 'C4']] },
  { id: 'camera', label: 'Camera Module', category: 'Sensing', code: 'CM-4K-R2', x: 625, y: 175, details: [['Interface', 'Camera service'], ['Change', 'Unchanged']] },
  { id: 'motor', label: '24V Motor M2', category: 'Drivetrain', code: 'MTR-24-220', x: 65, y: 345, details: [['Supply', '24 V'], ['BOM line', '18'], ['Model', 'M2']] },
  { id: 'controller', label: 'Motor Controller', category: 'Electrical', code: 'MCTRL-8A', x: 345, y: 345, details: [['Current rating', '8 A'], ['Controls', '24V Motor']] },
  { id: 'power', label: 'Power Distribution', category: 'Electrical', code: 'PDB-24V', x: 625, y: 345, details: [['Supply', '24 V'], ['Current rating', '10 A']] },
  { id: 'driver', label: 'Motor Driver', category: 'Electrical', code: 'DRV-8A', x: 345, y: 515, details: [['Current rating', '8 A'], ['BOM line', '22']] },
  { id: 'battery', label: 'Li-ion Battery', category: 'Power', code: '24V · 12AH', x: 625, y: 515, details: [['Supply', '24 V'], ['Capacity', '12 Ah'], ['Change', 'Unchanged']] },
];
export const CONNECTIONS: [string, string, string][] = [
 ['rover','chassis','contains'], ['rover','main-board','contains'], ['rover','camera','contains'],
 ['chassis','motor','locates'], ['main-board','controller','contains'], ['main-board','power','contains'],
 ['controller','motor','controls'], ['controller','driver','depends on'], ['power','battery','depends on'], ['power','controller','powers'],
];
export const CHANGES = [
 { id:'motor',label:'24V Motor',before:'MTR-24-220 · M2',after:'MTR-24-290 · M4',reason:'Higher torque motor'},
 { id:'controller',label:'Motor Controller',before:'MCTRL-8A',after:'MCTRL-D1 · 10 A',reason:'Match the example motor'},
 { id:'driver',label:'Motor Driver',before:'DRV-8A',after:'DRV-10A',reason:'Increase current capacity'},
 { id:'power',label:'Power Distribution',before:'10 A',after:'12 A',reason:'Accommodate increased load'},
];
export function partsForRevision(revision: Revision): Part[] {
 return PARTS.map(part => {
  if(revision === 'C') return part;
  if(part.id === 'motor') return {...part,label:'24V Motor M4',code:'MTR-24-290',details: [['Supply','24 V'],['BOM line','18'],['Model','M4']]};
  if(part.id === 'controller') return {...part,code:'MCTRL-D1',details:[['Current rating','10 A'],['Controls','24V Motor']]};
  if(part.id === 'driver') return {...part,code:'DRV-10A',details:[['Current rating','10 A'],['BOM line','22']]};
  if(part.id === 'power') return {...part,details:[['Supply','24 V'],['Current rating','12 A']]};
  return part;
 });
}
export function neighbors(id: string) {
 return CONNECTIONS.filter(([a,b])=>a===id||b===id).map(([a,b])=>a===id?b:a);
}

// Original CAID graph fixture, read from caid-labs @ 53512822. Synthetic sample only.
export type {Category} from './product-types';
import type {Category} from './product-types';

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
  description?: string;
  productRelationship?: string;
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

function describeRelation(source: string, target: string, kind: EdgeKind) {
  const sourceLabel = ARTIFACTS.find((artifact) => artifact.id === source)?.label ?? source;
  const targetLabel = ARTIFACTS.find((artifact) => artifact.id === target)?.label ?? target;
  const descriptions: Record<EdgeKind, string> = {
    contains: `${sourceLabel} physically contains or locates ${targetLabel}.`,
    routes: `${sourceLabel} routes an engineering interface to ${targetLabel}.`,
    drives: `${sourceLabel} sends control or power commands to ${targetLabel}.`,
    sourced: `${sourceLabel} is sourced from ${targetLabel}.`,
    validated: `${sourceLabel} is validated by ${targetLabel}.`,
    depends: `${sourceLabel} depends on ${targetLabel}.`,
    changed: `${sourceLabel} can be changed by ${targetLabel}.`,
  };
  return descriptions[kind];
}

const r = (source: string, target: string, kind: EdgeKind): Relation => ({
  id: `${source}-${target}-${kind}`,
  source,
  target,
  kind,
  description: describeRelation(source, target, kind),
});

export const RELATIONS: Relation[] = [
  r('rover', 'chassis', 'contains'), r('rover', 'main-board', 'contains'), r('rover', 'camera-mount', 'contains'), r('rover', 'final-assembly', 'depends'),
  r('chassis', 'left-wheel', 'contains'), r('chassis', 'right-wheel', 'contains'), r('chassis', 'battery-enclosure', 'contains'), r('chassis', 'motor-housing', 'contains'),
  r('main-board', 'j12', 'contains'), r('main-board', 'motor-controller', 'contains'), r('main-board', 'power-board', 'contains'),
  r('j12', 'chassis', 'routes'), r('motor-control', 'j12', 'depends'), r('j12', 'j12-bom', 'depends'), r('j12', 'qa-fixture', 'validated'),
  r('j12-bom', 'molex', 'sourced'), r('cable-routing', 'j12', 'depends'),
  r('motor-control', 'motor-controller', 'drives'), r('motor-controller', 'motor-driver', 'depends'), r('motor-control', 'motor-bom', 'drives'), r('motor-control', 'motor-load-test', 'validated'),
  r('motor-bom', 'motor-supplier', 'sourced'), r('motor-install', 'motor-bom', 'depends'), r('motor-housing', 'motor-bom', 'contains'),
  r('motor-bom', 'motor-m4-datasheet', 'sourced'),
  r('power-board', 'battery-mgmt', 'drives'), r('power-board', 'battery', 'depends'), r('battery-enclosure', 'battery', 'contains'),
  r('camera-mount', 'camera-module', 'contains'), r('camera-service', 'camera-module', 'depends'), r('camera-module', 'camera-supplier', 'sourced'),
  r('navigation', 'motor-control', 'depends'), r('navigation', 'camera-service', 'depends'),
  r('final-assembly', 'cable-routing', 'depends'), r('final-assembly', 'motor-install', 'depends'),
  r('motor-load-test', 'motor-bom', 'validated'), r('power-test', 'power-board', 'validated'), r('camera-cal', 'camera-module', 'validated'), r('final-qa', 'final-assembly', 'validated'),
  r('main-board', 'product-agent', 'changed'), r('j12-bom', 'supply-agent', 'changed'), r('final-assembly', 'build-agent', 'changed'),
];


// Canonical Rev C relationships from the same CAID source revision.
const CANONICAL_RELATIONS: Relation[] = [
  {
    "id": "product:left_wheel_assembly:mounted_on:chassis",
    "source": "left-wheel",
    "target": "chassis",
    "kind": "contains",
    "description": "Left axle datum",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:right_wheel_assembly:mounted_on:chassis",
    "source": "right-wheel",
    "target": "chassis",
    "kind": "contains",
    "description": "Right axle datum",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:camera_mount:mounted_on:chassis",
    "source": "camera-mount",
    "target": "chassis",
    "kind": "contains",
    "description": "Front inspection datum",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:camera_module:mounted_on:camera_mount",
    "source": "camera-module",
    "target": "camera-mount",
    "kind": "contains",
    "description": "Optical center at 80 mm",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:battery_enclosure:mounted_on:chassis",
    "source": "battery-enclosure",
    "target": "chassis",
    "kind": "contains",
    "description": "Rear energy bay",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:battery_enclosure:contains:battery_pack",
    "source": "battery-enclosure",
    "target": "battery",
    "kind": "contains",
    "description": "Pack retained by BAT-CAGE-03",
    "productRelationship": "contains"
  },
  {
    "id": "product:motor_housing:mounted_on:chassis",
    "source": "motor-housing",
    "target": "chassis",
    "kind": "contains",
    "description": "Two mirrored housings",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:motor_housing:contains:drive_motor_m2",
    "source": "motor-housing",
    "target": "motor-bom",
    "kind": "contains",
    "description": "M2 released envelope",
    "productRelationship": "contains"
  },
  {
    "id": "product:main_board:mounted_on:chassis",
    "source": "main-board",
    "target": "chassis",
    "kind": "contains",
    "description": "Electronics deck",
    "productRelationship": "mounted_on"
  },
  {
    "id": "product:main_board:contains:j12_connector",
    "source": "main-board",
    "target": "j12",
    "kind": "contains",
    "description": "J12 board interface",
    "productRelationship": "contains"
  },
  {
    "id": "product:main_board:connects_to:motor_controller",
    "source": "main-board",
    "target": "motor-controller",
    "kind": "routes",
    "description": "Enable and sense control",
    "productRelationship": "connects_to"
  },
  {
    "id": "product:motor_controller:connects_to:motor_driver",
    "source": "motor-controller",
    "target": "motor-driver",
    "kind": "routes",
    "description": "PWM and current feedback",
    "productRelationship": "connects_to"
  },
  {
    "id": "product:motor_driver:connects_to:drive_motor_m2",
    "source": "motor-driver",
    "target": "motor-bom",
    "kind": "routes",
    "description": "24 V H-bridge output",
    "productRelationship": "connects_to"
  },
  {
    "id": "product:battery_pack:connects_to:main_board",
    "source": "battery",
    "target": "main-board",
    "kind": "routes",
    "description": "Protected 24 V input",
    "productRelationship": "connects_to"
  },
  {
    "id": "product:camera_module:connects_to:main_board",
    "source": "camera-module",
    "target": "main-board",
    "kind": "routes",
    "description": "Power and differential data",
    "productRelationship": "connects_to"
  }
];
export const REFERENCE_RELATIONS: Relation[] = [...RELATIONS];
for (const relation of CANONICAL_RELATIONS) {
 if (!REFERENCE_RELATIONS.some(r=>r.source===relation.source&&r.target===relation.target&&r.kind===relation.kind)) REFERENCE_RELATIONS.push(relation);
}

export const REFERENCE_PROPERTIES: Record<string, Record<string, string>> = {
  j12: {
    Type: 'Electrical Connector', Revision: 'Rev C', Part: 'Molex Micro-Fit 3.0', Pins: '4', Net: '24V Motor Power', Supplier: 'Molex', Stock: '1,248 · LOW', 'Lead Time': '14 days', 'Unit Cost': '$0.84',
  },
  'main-board': { Type: 'Printed Circuit Board', Revision: 'C4', Owner: 'Electrical', Layers: '6', Status: 'Released' },
  chassis: { Type: 'Mechanical Assembly', Revision: 'C3', Material: '6061-T6 Aluminum', Mass: '2.4 kg', Status: 'Released' },
  'motor-bom': { Type: 'Purchased Part', Revision: 'B', Supplier: 'Motion Dynamics', Stock: '384', 'Unit Cost': '$42.10' },
  'motor-m4-datasheet': { Type: 'Engineering Document', Revision: 'Rev C', File: 'motor_M4_datasheet.pdf', Status: 'Prototype document interpretation', Parser: 'Future · Nemotron Parse 2.0' },
};

