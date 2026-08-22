export type AgentKind = 'builder' | 'product' | 'supply';

export type CorpusEvidence = {
  sourceFile: string;
  title: string;
  excerpt: string;
  artifactIds: string[];
  score: number;
};

export type AgentResponse = {
  agent: AgentKind;
  question: string;
  answer: string;
  reasoning: string[];
  artifactIds: string[];
  evidence: CorpusEvidence[];
  matchedTask: null | {
    id: string;
    prompt: string;
  };
  confidence: number;
  latencyMs: number;
  mode: 'ground-truth' | 'retrieval';
  structuredState: {
    candidateId: string;
    productId: string;
    revision: string;
    validation: { schema: 'pass'; semanticGates: 'pass'; gateFailures: []; warnings: string[] };
    requirements: string[];
    componentIds: string[];
    relationshipCount: number;
    circuitNets: string[];
    fabricationProcesses: string[];
    instructionSteps: Array<{ id: string; title: string; phase: string }>;
    sourcingItems: Array<{ componentId: string; productName: string; vendor: string | null; unitCostUsd: number }>;
  };
};

export type CorpusHealth = {
  status: 'ok';
  backend: 'forma-labs-corpus-local';
  productId: string;
  revision: string;
  artifacts: number;
  relationships: number;
  files: number;
  indexedDocuments: number;
  scenarios: number;
  scannerAssets: number;
  cloudRequired: false;
};
