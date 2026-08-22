export type EngineeringTestAssetId =
  | 'asset-01-machined-bracket'
  | 'asset-02-molded-housing'
  | 'asset-03-sheet-metal-bracket'
  | 'asset-04-defective-shaft'
  | 'asset-05-connector-datasheet'
  | 'asset-06-pump-assembly';

export type EngineeringExtractionPart = {
  name: string;
  quantity: number;
  material: string;
  confidence: number;
};

export type EngineeringExtractionDimension = {
  label: string;
  value_text: string;
  unit: string;
  confidence: number;
};

export type EngineeringExtractionRisk = {
  title: string;
  severity: 'low' | 'medium' | 'high';
  rationale: string;
  mitigation: string;
  confidence: number;
};

export type EngineeringExtractionTask = {
  title: string;
  source: 'ai' | 'user';
};

export type EngineeringExtraction = {
  parts: EngineeringExtractionPart[];
  dimensions: EngineeringExtractionDimension[];
  risks: EngineeringExtractionRisk[];
  tasks: EngineeringExtractionTask[];
};

export type EngineeringTestAsset = {
  id: EngineeringTestAssetId;
  label: string;
  sourceFile: string;
  fixtureFile: string;
  pageRenderFiles: string[];
  pages: number;
  category: 'engineering-drawing' | 'component-datasheet' | 'assembly-and-bom';
  categoryLabel: string;
  modality: 'document';
  pipeline: 'Nemotron Parse 2.0';
  testFocus: string;
  sourceSha256: string;
  fixtureSha256: string;
};

const ROOT = '/engineering-test-assets';

export const ENGINEERING_TEST_ASSETS: EngineeringTestAsset[] = [
  {
    id: 'asset-01-machined-bracket',
    label: 'Machined bracket',
    sourceFile: 'asset_01_machined_bracket.pdf',
    fixtureFile: 'asset_01_machined_bracket.golden.json',
    pageRenderFiles: ['asset_01_machined_bracket-1.png'],
    pages: 1,
    category: 'engineering-drawing',
    categoryLabel: 'Mechanical drawing',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'Part identity, dimensions, tolerances, material, and a low-severity design risk.',
    sourceSha256: '21eed3ecd0a5820da9d7652a1c8ca9b95b09b001cb4c29a9206201865772018b',
    fixtureSha256: '373754059dfee1af15387a38fb00d1b0f73ea663b56f5eadd7b7f0b8c3b71038',
  },
  {
    id: 'asset-02-molded-housing',
    label: 'Molded housing',
    sourceFile: 'asset_02_molded_housing.pdf',
    fixtureFile: 'asset_02_molded_housing.golden.json',
    pageRenderFiles: ['asset_02_molded_housing-1.png'],
    pages: 1,
    category: 'engineering-drawing',
    categoryLabel: 'Molded-part drawing',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'Thin wall, thick boss, sharp corner, missing draft, and severity-ranked manufacturability risks.',
    sourceSha256: '57a5c0b6e2da8d51c7160ae288ddb6c84bb380af1227b53232b1b4d806c98a88',
    fixtureSha256: '083dcced088da9e41fe9d9473d576cad3c390f08fbdb6df6a7e0563e35cced3b',
  },
  {
    id: 'asset-03-sheet-metal-bracket',
    label: 'Sheet-metal bracket',
    sourceFile: 'asset_03_sheet_metal_bracket.pdf',
    fixtureFile: 'asset_03_sheet_metal_bracket.golden.json',
    pageRenderFiles: ['asset_03_sheet_metal_bracket-1.png'],
    pages: 1,
    category: 'engineering-drawing',
    categoryLabel: 'Sheet-metal drawing',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'Bend radius, hole-to-bend distance, edge distance, and forming risks.',
    sourceSha256: 'deeeeaab010afc7d5ec747f302eebfa5e76b26eb4ac43d9f28e5da847db3a18b',
    fixtureSha256: '327a68ed0f2a4cc9127c312c2d2dd80616ddf2937fafd7f6392b84a13413f2d9',
  },
  {
    id: 'asset-04-defective-shaft',
    label: 'Defective shaft',
    sourceFile: 'asset_04_defective_shaft.pdf',
    fixtureFile: 'asset_04_defective_shaft.golden.json',
    pageRenderFiles: ['asset_04_defective_shaft-1.png'],
    pages: 1,
    category: 'engineering-drawing',
    categoryLabel: 'Defect drawing',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'Blank material, untoleranced critical bore, mixed units, and high-severity defect detection.',
    sourceSha256: '9c4532bd0272773f9c859c7308ec33b3b4278036a788633193d98150498d1a9c',
    fixtureSha256: 'f05c2f2091b9069bea34b22a9d586a6a382fb7cdc906e41242d478cd6d5a4d44',
  },
  {
    id: 'asset-05-connector-datasheet',
    label: 'Connector datasheet',
    sourceFile: 'asset_05_connector_datasheet.pdf',
    fixtureFile: 'asset_05_connector_datasheet.golden.json',
    pageRenderFiles: [],
    pages: 1,
    category: 'component-datasheet',
    categoryLabel: 'Component datasheet',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'Specification tables, electrical limits, and a current-derating note outside the tables.',
    sourceSha256: 'f5fd1d094223206d55d9f3fe154bed8c77a84f614ff9ae7f48a8b6e9f05aa4f7',
    fixtureSha256: 'b05e84a907953ddfd7be6dc76f06f4b3964c32647a98df59babbba6fb2f16379',
  },
  {
    id: 'asset-06-pump-assembly',
    label: 'Pump assembly',
    sourceFile: 'asset_06_pump_assembly.pdf',
    fixtureFile: 'asset_06_pump_assembly.golden.json',
    pageRenderFiles: ['asset_06_pump_assembly-1.png', 'asset_06_pump_assembly-2.png'],
    pages: 2,
    category: 'assembly-and-bom',
    categoryLabel: 'Assembly drawing + BOM',
    modality: 'document',
    pipeline: 'Nemotron Parse 2.0',
    testFocus: 'All-page parsing: the six-item BOM and quantities are present only on page 2.',
    sourceSha256: 'b5b038983a66af78ca12f5f4fb92e252d299c89a56cba483b9d1b1380d904a7d',
    fixtureSha256: '52985920bf075fd2498638a33ffe6cfba02b3617dfe21bda0c420c7f53f2bc6c',
  },
];

export function engineeringTestAssetUrl(file: string) {
  return `${ROOT}/${file}`;
}

export function findEngineeringTestAsset(id: string) {
  return ENGINEERING_TEST_ASSETS.find((asset) => asset.id === id) ?? null;
}

export type ExtractionValidation = {
  valid: boolean;
  issues: string[];
  counts: { parts: number; dimensions: number; risks: number; tasks: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function confidenceIsValid(value: unknown) {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

export function validateEngineeringExtraction(value: unknown): ExtractionValidation {
  const issues: string[] = [];
  const record = isRecord(value) ? value : {};
  const parts = Array.isArray(record.parts) ? record.parts : [];
  const dimensions = Array.isArray(record.dimensions) ? record.dimensions : [];
  const risks = Array.isArray(record.risks) ? record.risks : [];
  const tasks = Array.isArray(record.tasks) ? record.tasks : [];

  for (const key of ['parts', 'dimensions', 'risks', 'tasks']) {
    if (!Array.isArray(record[key])) issues.push(`${key} must be an array.`);
  }
  parts.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.quantity !== 'number' || entry.quantity < 1 || typeof entry.material !== 'string' || !confidenceIsValid(entry.confidence)) {
      issues.push(`parts[${index}] does not match the extraction fixture contract.`);
    }
  });
  dimensions.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.label !== 'string' || typeof entry.value_text !== 'string' || typeof entry.unit !== 'string' || !confidenceIsValid(entry.confidence)) {
      issues.push(`dimensions[${index}] does not match the extraction fixture contract.`);
    }
  });
  risks.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.title !== 'string' || !['low', 'medium', 'high'].includes(String(entry.severity)) || typeof entry.rationale !== 'string' || typeof entry.mitigation !== 'string' || !confidenceIsValid(entry.confidence)) {
      issues.push(`risks[${index}] does not match the extraction fixture contract.`);
    }
  });
  tasks.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.title !== 'string' || !['ai', 'user'].includes(String(entry.source))) {
      issues.push(`tasks[${index}] does not match the extraction fixture contract.`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    counts: { parts: parts.length, dimensions: dimensions.length, risks: risks.length, tasks: tasks.length },
  };
}

export type EngineeringTestRunResult = {
  assetId: EngineeringTestAssetId;
  status: 'prototype' | 'local' | 'unavailable';
  statusLabel: string;
  pipeline: 'Nemotron Parse 2.0';
  inferencePerformed: boolean;
  resultKind: 'golden-fixture' | 'model-output' | 'none';
  summary: string;
  structured: unknown;
  validation: ExtractionValidation;
  provenance: {
    corpus: 'engineering_test_assets';
    sourceFile: string;
    sourceSha256: string;
    fixtureFile: string;
    fixtureSha256: string;
    repositoryPath: string;
  };
  committable: false;
  commitBlocker: string;
};
