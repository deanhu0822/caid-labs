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
