import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentKind, CorpusEvidence, CorpusHealth } from './corpus-types';

type ProductArtifact = {
  id: string;
  label: string;
  category: string;
  code: string;
  identifier: string;
  revision?: string;
  source_files: string[];
};

type ProductRelationship = {
  id: string;
  source: string;
  target: string;
  kind: string;
};

type ProductGraph = {
  product_id: string;
  name: string;
  revision: string;
  artifacts: ProductArtifact[];
  relationships: ProductRelationship[];
};

export type EvaluationTask = {
  id: string;
  prompt: string;
  expected_answer: string;
  evidence_files: string[];
  artifact_refs: string[];
};

type EvaluationFile = {
  agent: string;
  tasks: EvaluationTask[];
};

type CorpusDocument = {
  sourceFile: string;
  title: string;
  extension: string;
  content: string;
  artifactIds: string[];
};

type CorpusIndex = {
  root: string;
  product: ProductGraph;
  documents: CorpusDocument[];
  documentsByPath: Map<string, CorpusDocument>;
  evaluations: Record<AgentKind, EvaluationTask[]>;
  scenarioCount: number;
  scannerAssetCount: number;
  fileCount: number;
};

const CORPUS_ROOT = path.join(process.cwd(), 'synthetic-assets', 'rover-alpha');
const INDEXED_EXTENSIONS = new Set(['.json', '.md', '.csv', '.c', '.rs', '.scad', '.svg', '.mjs']);
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'by', 'can', 'do', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'the', 'to', 'use', 'we', 'what', 'when', 'which', 'with']);

const DOMAIN_BOOSTS: Record<AgentKind, string[]> = {
  builder: ['specs/', 'manufacturing/', 'tests/', 'electrical/', 'mechanical/', 'bom/'],
  product: ['product.json', 'electrical/', 'revisions/', 'manufacturing/', 'firmware/'],
  supply: ['suppliers/', 'bom/', 'electrical/', 'specs/', 'tests/'],
};

const EXPANSIONS: Record<string, string[]> = {
  j12: ['43025-0400', 'connector', 'gpio_17', 'adc3'],
  payload: ['motor', 'torque', 'current', 'mtr-24-290', 'mctrl-8a'],
  runtime: ['battery', 'energy', 'power', 'bat-24-18', 'hours'],
  shortage: ['inventory', 'stock', 'lead', 'alternate', 'allocation'],
  unavailable: ['inventory', 'stock', 'alternate', 'allocation'],
  camera: ['cm-4k-r2', 'calibration', 'basler'],
  revision: ['rev', 'incompatible', 'change'],
};

let indexPromise: Promise<CorpusIndex> | undefined;

function normalizePath(value: string) {
  return value.replaceAll('\\', '/');
}

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return nested.flat();
}

function collectArtifactRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectArtifactRefs(item, refs));
    return refs;
  }
  if (!value || typeof value !== 'object') return refs;
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (key === 'artifact_refs' && Array.isArray(item)) {
      item.forEach((id) => { if (typeof id === 'string') refs.add(id); });
    }
    collectArtifactRefs(item, refs);
  });
  return refs;
}

function titleFromPath(sourceFile: string) {
  return sourceFile
    .split('/').at(-1)!
    .replace(/\.[^.]+$/, '')
    .split(/[-_]/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(CORPUS_ROOT, relativePath), 'utf8')) as T;
}

async function buildIndex(): Promise<CorpusIndex> {
  const product = await readJson<ProductGraph>('product.json');
  const files = await walk(CORPUS_ROOT);
  const sourceArtifacts = new Map<string, Set<string>>();
  product.artifacts.forEach((artifact) => artifact.source_files.forEach((sourceFile) => {
    const normalized = normalizePath(sourceFile);
    const ids = sourceArtifacts.get(normalized) ?? new Set<string>();
    ids.add(artifact.id);
    sourceArtifacts.set(normalized, ids);
  }));

  const documents: CorpusDocument[] = [];
  for (const absolute of files) {
    const sourceFile = normalizePath(path.relative(CORPUS_ROOT, absolute));
    const extension = path.extname(sourceFile).toLowerCase();
    if (!INDEXED_EXTENSIONS.has(extension) || sourceFile.startsWith('evaluation/')) continue;
    const content = await fs.readFile(absolute, 'utf8');
    const artifactIds = sourceArtifacts.get(sourceFile) ?? new Set<string>();
    if (extension === '.json') {
      try {
        collectArtifactRefs(JSON.parse(content)).forEach((id) => artifactIds.add(id));
      } catch {
        // The checked-in validator owns JSON validity; keep indexing resilient.
      }
    }
    documents.push({ sourceFile, title: titleFromPath(sourceFile), extension, content, artifactIds: [...artifactIds] });
  }

  const [builder, productQuestions, supply, scenarios, scannerLabels] = await Promise.all([
    readJson<EvaluationFile>('evaluation/builder_tasks.json'),
    readJson<EvaluationFile>('evaluation/product_questions.json'),
    readJson<EvaluationFile>('evaluation/supply_tasks.json'),
    readJson<{ scenarios: unknown[] }>('scenarios.json'),
    readJson<{ images: unknown[] }>('scanner/labels.json'),
  ]);

  return {
    root: CORPUS_ROOT,
    product,
    documents,
    documentsByPath: new Map(documents.map((document) => [document.sourceFile, document])),
    evaluations: { builder: builder.tasks, product: productQuestions.tasks, supply: supply.tasks },
    scenarioCount: scenarios.scenarios.length,
    scannerAssetCount: scannerLabels.images.length,
    fileCount: files.length,
  };
}

export function getCorpusIndex() {
  indexPromise ??= buildIndex();
  return indexPromise;
}

export function tokenize(value: string) {
  const base = value.toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ?? [];
  const tokens = base.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  const expanded = new Set(tokens);
  tokens.forEach((token) => EXPANSIONS[token]?.forEach((item) => expanded.add(item)));
  return [...expanded];
}

function countOccurrences(haystack: string, needle: string) {
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1 && count < 12) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function makeExcerpt(content: string, tokens: string[]) {
  const compact = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[{}\[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = compact.toLowerCase();
  const positions = tokens.map((token) => lower.indexOf(token)).filter((position) => position >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - 90);
  const end = Math.min(compact.length, position + 230);
  return `${start > 0 ? '…' : ''}${compact.slice(start, end).trim()}${end < compact.length ? '…' : ''}`;
}

export async function searchCorpus(query: string, options: { limit?: number; agent?: AgentKind } = {}): Promise<CorpusEvidence[]> {
  const index = await getCorpusIndex();
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const phrase = query.trim().toLowerCase();

  return index.documents
    .map((document) => {
      const pathText = document.sourceFile.toLowerCase();
      const idText = document.artifactIds.join(' ').toLowerCase();
      const contentText = document.content.toLowerCase();
      let score = phrase.length > 5 && contentText.includes(phrase) ? 18 : 0;
      tokens.forEach((token) => {
        if (pathText.includes(token)) score += 7;
        if (idText.includes(token)) score += 6;
        score += Math.min(6, countOccurrences(contentText, token));
      });
      if (options.agent && DOMAIN_BOOSTS[options.agent].some((prefix) => pathText.startsWith(prefix) || pathText === prefix)) score += 3;
      return { document, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.document.sourceFile.localeCompare(b.document.sourceFile))
    .slice(0, Math.min(Math.max(options.limit ?? 8, 1), 20))
    .map(({ document, score }) => ({
      sourceFile: document.sourceFile,
      title: document.title,
      excerpt: makeExcerpt(document.content, tokens),
      artifactIds: document.artifactIds,
      score,
    }));
}

export async function getEvidenceForFiles(sourceFiles: string[], query: string): Promise<CorpusEvidence[]> {
  const index = await getCorpusIndex();
  const tokens = tokenize(query);
  return sourceFiles
    .map((sourceFile, position) => {
      const document = index.documentsByPath.get(normalizePath(sourceFile));
      if (!document) return null;
      return {
        sourceFile: document.sourceFile,
        title: document.title,
        excerpt: makeExcerpt(document.content, tokens),
        artifactIds: document.artifactIds,
        score: 100 - position,
      } satisfies CorpusEvidence;
    })
    .filter((item): item is CorpusEvidence => Boolean(item));
}

export async function getEvaluationTasks(agent: AgentKind) {
  return (await getCorpusIndex()).evaluations[agent];
}

export async function getArtifactRecord(id: string) {
  const index = await getCorpusIndex();
  const artifact = index.product.artifacts.find((item) => item.id === id);
  if (!artifact) return null;
  const relationships = index.product.relationships.filter((edge) => edge.source === id || edge.target === id);
  const sources = artifact.source_files.map((sourceFile) => index.documentsByPath.get(normalizePath(sourceFile))).filter((document): document is CorpusDocument => Boolean(document));
  return {
    artifact,
    relationships,
    sources: sources.map((document) => ({ sourceFile: document.sourceFile, title: document.title, excerpt: makeExcerpt(document.content, [id, artifact.identifier.toLowerCase()]) })),
  };
}

export async function getCorpusHealth(): Promise<CorpusHealth> {
  const index = await getCorpusIndex();
  return {
    status: 'ok',
    backend: 'forma-labs-corpus-local',
    productId: index.product.product_id,
    revision: index.product.revision,
    artifacts: index.product.artifacts.length,
    relationships: index.product.relationships.length,
    files: index.fileCount,
    indexedDocuments: index.documents.length,
    scenarios: index.scenarioCount,
    scannerAssets: index.scannerAssetCount,
    cloudRequired: false,
  };
}
