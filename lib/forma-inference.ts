export type FormaInferenceMode = 'nvidia-build' | 'huggingface' | 'local' | 'mock' | 'unavailable';

export type FormaInferenceCapability = 'reasoning' | 'vision' | 'document-parse';

export type FormaInferenceServiceStatus = {
  capability: FormaInferenceCapability;
  mode: FormaInferenceMode;
  model: string;
  endpointConfigured: boolean;
  connected?: boolean;
  detail?: string;
};

export type FormaInferenceStatus = {
  mode: FormaInferenceMode;
  provider: 'mock' | 'nvidia-local' | 'nvidia-build' | 'huggingface';
  connected?: boolean;
  endpoint?: string;
  checkedAt?: string;
  services: FormaInferenceServiceStatus[];
  disclosure: string;
};

export type FormaMediaObservation = {
  mode: FormaInferenceMode;
  inferencePerformed: boolean;
  sourceId: string;
  kind: 'image' | 'video' | 'physical-state';
  summary: string;
  labels: Array<{ label: string; confidence: number | null }>;
  raw?: unknown;
};

export type FormaReasoningResult<T = unknown> = {
  mode: FormaInferenceMode;
  inferencePerformed: boolean;
  summary: string;
  structured: T;
  raw?: unknown;
};

export type FormaDocumentArtifacts = {
  sourceId: string;
  title: string;
  artifactType: 'component-specification' | 'bom' | 'requirements' | 'manual' | 'engineering-document';
  component: string | null;
  sections: Array<{ heading: string; text: string }>;
  partNumbers: string[];
  requirements: Array<{ key: string; value: string }>;
  properties: Array<{
    key: string;
    label: string;
    value: string;
    sourceId: string;
    sourceName: string;
  }>;
};

export type FormaInferenceConfig = {
  reasoningUrl?: string;
  visionUrl?: string;
  parseUrl?: string;
  allowMockFallback?: boolean;
};

export interface FormaInferenceProvider {
  readonly name: 'mock' | 'nvidia-local' | 'nvidia-build' | 'huggingface';
  getStatus(): FormaInferenceStatus;
  checkHealth?(options?: { probe?: boolean }): Promise<FormaInferenceStatus>;
  observeMedia(input: {
    sourceId: string;
    kind: 'image' | 'video' | 'physical-state';
    name: string;
    mimeType?: string;
    dataUrl?: string;
    context?: string;
  }): Promise<FormaMediaObservation>;
  reason<T>(input: { objective: string; engineeringState: unknown; featureContract?: unknown; mockResult: T }): Promise<FormaReasoningResult<T>>;
  parseDocument(input: { sourceId: string; name: string; mimeType?: string; text?: string; dataUrl?: string }): Promise<FormaReasoningResult<FormaDocumentArtifacts>>;
}

export const FORMA_MODEL_ROLES = {
  reasoning: 'Llama-3.1-Nemotron-70B-Instruct',
  vision: 'Cosmos-Reason1-7B',
  parse: 'nvidia/NVIDIA-Nemotron-Parse-2.0',
} as const;

const MOCK_DISCLOSURE = 'Deterministic demo output. No model inference was performed.';

function emptyDocumentArtifacts(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): FormaDocumentArtifacts {
  return {
    sourceId: input.sourceId,
    title: input.name,
    artifactType: 'engineering-document',
    component: null,
    sections: [],
    partNumbers: [],
    requirements: [],
    properties: [],
  };
}

export class MockFormaInferenceProvider implements FormaInferenceProvider {
  readonly name = 'mock' as const;

  getStatus(): FormaInferenceStatus {
    return {
      mode: 'mock',
      provider: this.name,
      disclosure: MOCK_DISCLOSURE,
      services: [
        { capability: 'reasoning', mode: 'mock', model: FORMA_MODEL_ROLES.reasoning, endpointConfigured: false },
        { capability: 'vision', mode: 'mock', model: FORMA_MODEL_ROLES.vision, endpointConfigured: false },
        { capability: 'document-parse', mode: 'mock', model: FORMA_MODEL_ROLES.parse, endpointConfigured: false },
      ],
    };
  }

  async observeMedia(input: Parameters<FormaInferenceProvider['observeMedia']>[0]): Promise<FormaMediaObservation> {
    await Promise.resolve();
    return {
      mode: 'mock',
      inferencePerformed: false,
      sourceId: input.sourceId,
      kind: input.kind,
      summary: `${input.name} is attached as ${input.kind === 'video' ? 'motion' : 'visual'} context. Its pixels${input.kind === 'video' ? ', frames, and audio were' : ' were'} not analyzed.`,
      labels: [],
    };
  }

  async reason<T>(input: Parameters<FormaInferenceProvider['reason']>[0] & { mockResult: T }): Promise<FormaReasoningResult<T>> {
    await Promise.resolve();
    return { mode: 'mock', inferencePerformed: false, summary: MOCK_DISCLOSURE, structured: input.mockResult };
  }

  async parseDocument(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): Promise<FormaReasoningResult<FormaDocumentArtifacts>> {
    await Promise.resolve();
    const looksLikeMotorM4 = /(?:motor[^a-z0-9]*m4|m4[^a-z0-9]*motor)/i.test(input.name);
    const structured = looksLikeMotorM4
      ? {
          sourceId: input.sourceId,
          title: 'Motor M4 Datasheet',
          artifactType: 'component-specification' as const,
          component: 'Motor M4',
          sections: [{ heading: 'Prototype specification extraction', text: 'Deterministic values for the Forma document-input demonstration.' }],
          partNumbers: ['MTR-24-290'],
          requirements: [{ key: 'motor-voltage', value: '24 V' }, { key: 'motor-peak-current', value: '11.2 A' }, { key: 'motor-torque', value: '8.4 Nm' }],
          properties: [
            { key: 'voltage', label: 'Voltage', value: '24 V', sourceId: input.sourceId, sourceName: input.name },
            { key: 'peak-current', label: 'Peak current', value: '11.2 A', sourceId: input.sourceId, sourceName: input.name },
            { key: 'torque', label: 'Torque', value: '8.4 Nm', sourceId: input.sourceId, sourceName: input.name },
          ],
        }
      : emptyDocumentArtifacts(input);
    return {
      mode: 'mock',
      inferencePerformed: false,
      summary: looksLikeMotorM4 ? 'Prototype document interpretation using deterministic Motor M4 demo values. No model inference was performed.' : MOCK_DISCLOSURE,
      structured,
    };
  }
}

type LocalResponse<T> = { structured?: T; output?: T; summary?: string; labels?: FormaMediaObservation['labels']; [key: string]: unknown };

export class NvidiaLocalInferenceProvider implements FormaInferenceProvider {
  readonly name = 'nvidia-local' as const;
  private readonly fallback = new MockFormaInferenceProvider();

  constructor(private readonly config: FormaInferenceConfig) {}

  getStatus(): FormaInferenceStatus {
    const services: FormaInferenceServiceStatus[] = [
      { capability: 'reasoning', mode: this.config.reasoningUrl ? 'local' : this.config.allowMockFallback === false ? 'unavailable' : 'mock', model: FORMA_MODEL_ROLES.reasoning, endpointConfigured: Boolean(this.config.reasoningUrl) },
      { capability: 'vision', mode: this.config.visionUrl ? 'local' : this.config.allowMockFallback === false ? 'unavailable' : 'mock', model: FORMA_MODEL_ROLES.vision, endpointConfigured: Boolean(this.config.visionUrl) },
      { capability: 'document-parse', mode: this.config.parseUrl ? 'local' : this.config.allowMockFallback === false ? 'unavailable' : 'mock', model: FORMA_MODEL_ROLES.parse, endpointConfigured: Boolean(this.config.parseUrl) },
    ];
    const mode: FormaInferenceMode = services.every((service) => service.mode === 'local')
      ? 'local'
      : services.some((service) => service.mode === 'mock')
        ? 'mock'
        : 'unavailable';
    return {
      mode,
      provider: this.name,
      services,
      disclosure: mode === 'local'
        ? 'Configured for local NVIDIA inference endpoints.'
        : mode === 'mock'
          ? 'One or more local endpoints are absent; deterministic mock fallback is active.'
          : 'Required local inference endpoints are unavailable and mock fallback is disabled.',
    };
  }

  private async invoke<T>(endpoint: string, payload: unknown): Promise<LocalResponse<T>> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Local inference endpoint returned ${response.status}.`);
    return response.json() as Promise<LocalResponse<T>>;
  }

  async observeMedia(input: Parameters<FormaInferenceProvider['observeMedia']>[0]): Promise<FormaMediaObservation> {
    if (!this.config.visionUrl) {
      if (this.config.allowMockFallback === false) return { mode: 'unavailable', inferencePerformed: false, sourceId: input.sourceId, kind: input.kind, summary: 'Local vision endpoint is not configured.', labels: [] };
      return this.fallback.observeMedia(input);
    }
    try {
      const raw = await this.invoke<unknown>(this.config.visionUrl, { model: FORMA_MODEL_ROLES.vision, task: 'structured_physical_observation', input });
      return { mode: 'local', inferencePerformed: true, sourceId: input.sourceId, kind: input.kind, summary: raw.summary ?? 'Local physical-state observation completed.', labels: raw.labels ?? [], raw };
    } catch (error) {
      if (this.config.allowMockFallback === false) throw error;
      return this.fallback.observeMedia(input);
    }
  }

  async reason<T>(input: Parameters<FormaInferenceProvider['reason']>[0] & { mockResult: T }): Promise<FormaReasoningResult<T>> {
    if (!this.config.reasoningUrl) {
      if (this.config.allowMockFallback === false) return { mode: 'unavailable', inferencePerformed: false, summary: 'Local reasoning endpoint is not configured.', structured: input.mockResult };
      return this.fallback.reason(input);
    }
    try {
      const raw = await this.invoke<T>(this.config.reasoningUrl, { model: FORMA_MODEL_ROLES.reasoning, task: 'engineering_reasoning', objective: input.objective, engineeringState: input.engineeringState, featureContract: input.featureContract });
      return { mode: 'local', inferencePerformed: true, summary: raw.summary ?? 'Local engineering reasoning completed.', structured: (raw.structured ?? raw.output ?? input.mockResult) as T, raw };
    } catch (error) {
      if (this.config.allowMockFallback === false) throw error;
      return this.fallback.reason(input);
    }
  }

  async parseDocument(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): Promise<FormaReasoningResult<FormaDocumentArtifacts>> {
    if (!this.config.parseUrl) {
      if (this.config.allowMockFallback === false) return { mode: 'unavailable', inferencePerformed: false, summary: 'Local document parser endpoint is not configured.', structured: emptyDocumentArtifacts(input) };
      return this.fallback.parseDocument(input);
    }
    const empty = emptyDocumentArtifacts(input);
    try {
      const raw = await this.invoke<FormaDocumentArtifacts>(this.config.parseUrl, { model: FORMA_MODEL_ROLES.parse, task: 'extract_engineering_artifacts', input });
      return { mode: 'local', inferencePerformed: true, summary: raw.summary ?? 'Local document parsing completed.', structured: (raw.structured ?? raw.output ?? empty) as FormaDocumentArtifacts, raw };
    } catch (error) {
      if (this.config.allowMockFallback === false) throw error;
      return this.fallback.parseDocument(input);
    }
  }
}

export const mockFormaInferenceProvider = new MockFormaInferenceProvider();

export function createFormaInferenceProvider(config: FormaInferenceConfig = {}): FormaInferenceProvider {
  const hasLocalEndpoint = Boolean(config.reasoningUrl || config.visionUrl || config.parseUrl);
  return hasLocalEndpoint || config.allowMockFallback === false ? new NvidiaLocalInferenceProvider(config) : mockFormaInferenceProvider;
}
